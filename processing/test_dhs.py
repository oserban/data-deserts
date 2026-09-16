"""Regression tests for DHS units, nutrition evidence and shared app exports.

Run: python3 -m unittest discover -s processing -p 'test_*.py'
"""
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from build_data import load_dhs_coverage, restrict_to_dhs_timeline
from fetch_dhs import aggregate_surveys, fetch_nutrition_evidence, nutrition_indicator_topics


class DhsCoverageTests(unittest.TestCase):
    def test_timeline_uses_first_dhs_year_and_recalculates_other_source_totals(self):
        original_gbif = {'AAA': {'1900': 1000, '1985': 3, '2026': 4},
                         'BBB': {'1984': 50}}
        datasets = {
            'dhs': {'records': {'AAA': {'1985': 1}, 'BBB': {'2000': 1}}},
            'gbif': {'records': original_gbif},
        }
        self.assertEqual(restrict_to_dhs_timeline(datasets), 1985)
        self.assertEqual(datasets['gbif']['records'], {'AAA': {'1985': 3, '2026': 4}})
        self.assertEqual(datasets['gbif']['summary'], {
            'countries': 1, 'records': 7, 'yearMin': 1985, 'yearMax': 2026})
        self.assertEqual(original_gbif['AAA']['1900'], 1000)
        self.assertEqual(datasets['dhs']['records']['BBB'], {'2000': 1})

    def test_timeline_refuses_to_fall_back_to_gbif_when_dhs_is_empty(self):
        with self.assertRaisesRegex(ValueError, 'without DHS surveys'):
            restrict_to_dhs_timeline({'dhs': {'records': {}},
                                      'gbif': {'records': {'AAA': {'1900': 1}}}})

    def survey(self, **overrides):
        return {
            'SurveyId': 'AA2015DHS', 'DHS_CountryCode': 'AA', 'CountryName': 'Example',
            'SurveyYear': 2015, 'SurveyYearLabel': '2015-16', 'SurveyType': 'DHS',
            'SurveyStatus': 'Completed', 'IndicatorData': 1,
            'SurveyCharacteristicIds': '', 'NumberOfWomen': 100,
            'NumberOfMen': 50, 'NumberofHouseholds': 90, **overrides,
        }

    def aggregate(self, rows, evidence=None):
        return aggregate_surveys(rows, {'AA': 'AAA'}, {10: 'Anthropometry', 14: 'Iodine salt test'},
                                 evidence or {})

    def report(self, surveys, **meta):
        return {'_meta': {'schemaVersion': 2, 'unit': 'surveys',
                          'nutritionDefinition': 'Any nutrition topic', **meta}, 'surveys': surveys}

    def load_coverage(self, report, counts):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'dhs_report.json'
            path.write_text(json.dumps(report))
            return load_dhs_coverage(path, counts)

    def test_counts_surveys_once_not_people_households_or_duplicate_rows(self):
        survey = self.survey()
        household_only = self.survey(SurveyId='AA2015MIS', SurveyType='MIS',
                                     NumberOfWomen=None, NumberOfMen=None)
        counts, surveys, stats = self.aggregate([survey, survey, household_only])
        self.assertEqual(counts, {'AAA': {'2015': 2}})
        self.assertEqual(len(surveys), 2)
        self.assertEqual(surveys[0]['households'], 90)
        self.assertEqual(stats['surveys'], 2)
        self.assertNotIn('participants', surveys[0])

    def test_nutrition_includes_household_topic_and_feeding_indicators(self):
        rows = [self.survey(SurveyCharacteristicIds='14'),
                self.survey(SurveyId='AA2020DHS', SurveyYear=2020)]
        counts, surveys, _ = self.aggregate(rows, {'AA2020DHS': {'Initial breastfeeding'}})
        self.assertTrue(all(survey['nutrition'] for survey in surveys))
        self.assertEqual(surveys[0]['nutritionTopics'], ['Iodine salt test'])
        self.assertEqual(surveys[1]['nutritionTopics'], ['Initial breastfeeding'])
        self.assertEqual(sum(counts['AAA'].values()), 2)

    def test_missing_nutrition_evidence_is_unknown(self):
        _, surveys, _ = self.aggregate([self.survey()])
        self.assertIsNone(surveys[0]['nutrition'])
        self.assertEqual(surveys[0]['nutritionTopics'], [])

    def test_unavailable_surveys_do_not_expand_coverage(self):
        counts, surveys, stats = self.aggregate([
            self.survey(SurveyStatus='Ongoing'),
            self.survey(SurveyId='AA2020DHS', IndicatorData=0)])
        self.assertEqual(counts, {})
        self.assertEqual(surveys, [])
        self.assertEqual(stats['unavailableSurveys'], 2)

    def test_indicator_selection_includes_both_nutrition_domains_only(self):
        topics = nutrition_indicator_topics([
            {'IndicatorId': 'feeding', 'Level1': 'Child Nutrition', 'Level2': 'Feeding '},
            {'IndicatorId': 'iron', 'Level1': 'Adult Nutrition', 'Level2': 'Micronutrients'},
            {'IndicatorId': 'malaria', 'Level1': 'Malaria', 'Level2': 'Testing'}])
        self.assertEqual(topics, {'feeding': 'Feeding', 'iron': 'Micronutrients'})

    def test_published_zero_is_evidence_but_missing_values_are_not(self):
        def records(endpoint, *args, **kwargs):
            if endpoint == 'indicators':
                return [{'IndicatorId': 'feeding', 'Level1': 'Child Nutrition',
                         'Level2': 'Initial breastfeeding'}]
            self.assertEqual(kwargs['breakdown'], 'national')
            return [
                {'SurveyId': 'zero', 'IndicatorId': 'feeding', 'Value': 0},
                {'SurveyId': 'missing', 'IndicatorId': 'feeding', 'Value': None},
                {'SurveyId': 'blank', 'IndicatorId': 'feeding', 'Value': ''},
            ]
        with patch('fetch_dhs.api_records', side_effect=records):
            self.assertEqual(fetch_nutrition_evidence(100), {'zero': {'Initial breastfeeding'}})

    def test_year_export_merges_surveys_and_preserves_fieldwork_label(self):
        counts, surveys, _ = self.aggregate([
            self.survey(), self.survey(SurveyId='AA2015MIS', SurveyType='MIS',
                                      SurveyCharacteristicIds='10')])
        coverage, definition = self.load_coverage(self.report(surveys), counts)
        self.assertEqual(len(coverage['AAA']), 1)
        year = coverage['AAA'][0]
        self.assertEqual((year['year'], year['label'], year['surveyCount']), (2015, '2015-16', 2))
        self.assertTrue(year['nutrition'])
        self.assertEqual(year['surveyTypes'], ['DHS', 'MIS'])
        self.assertEqual(definition, 'Any nutrition topic')

    def test_build_rejects_stale_participant_counts(self):
        _, surveys, _ = self.aggregate([self.survey()])
        with self.assertRaisesRegex(ValueError, 'do not match'):
            self.load_coverage(self.report(surveys), {'AAA': {'2015': 150}})
        with self.assertRaisesRegex(ValueError, 'old participant schema'):
            self.load_coverage(self.report(surveys, schemaVersion=1), {'AAA': {'2015': 1}})

    def test_build_rejects_duplicate_survey_provenance(self):
        counts, surveys, _ = self.aggregate([self.survey()])
        with self.assertRaisesRegex(ValueError, 'duplicate DHS survey'):
            self.load_coverage(self.report(surveys + surveys), counts)

    def test_invalid_year_or_country_fails_instead_of_silent_omission(self):
        for overrides in [{'SurveyYear': 'unknown'}, {'DHS_CountryCode': 'XX'}]:
            with self.subTest(overrides=overrides), self.assertRaises(ValueError):
                self.aggregate([self.survey(**overrides)])


if __name__ == '__main__':
    unittest.main()
