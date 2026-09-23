"""LSMS roster selection and household-size estimation contracts."""
import copy
import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from build_data import load_lsms_estimates, restrict_to_dhs_timeline
from fetch_lsms import (classify_file, resolve_participant_file, roster_variable_evidence,
                        study_variables, aggregate_studies, main as fetch_lsms,
                        apply_estimates, estimate_study, load_resources)


class LsmsRosterTests(unittest.TestCase):
    def file(self, name='HR1', count=29914, fid='F3', description=''):
        return dict(fileId=fid, fileName=name, description=description, caseCount=count,
                    classification=classify_file(dict(file_name=name, description=description,
                                                       case_count=count)))

    def variables(self, fid='F3'):
        # World Bank HRDS 1993 public variable metadata, file HR1:
        # https://microdata.worldbank.org/index.php/api/catalog/TZA_1993_HRDS_v01_M/variables
        return [dict(fid=fid, vid='V'+str(i), name=name, labl=label) for i, (name, label) in enumerate([
            ('hhn', 'household number'), ('id', 'id code'), ('i2', 'sex'),
            ('i3', 'relationship to head'), ('i7', 'age')], 1)]

    def test_hrds_cryptic_filename_resolved_without_summing_larger_modules(self):
        files = [self.file(), self.file('HR', 5184, 'F2'), self.file('HR12', 131564, 'F14')]
        with patch('fetch_lsms.study_variables', return_value=(self.variables(), 'api:variables')):
            selected, reason, _ = resolve_participant_file(files, 'TZA_1993_HRDS_v01_M')
        self.assertEqual((selected['fileId'], selected['caseCount']), ('F3', 29914))
        self.assertEqual(reason, 'verified_roster_variables')
        self.assertEqual(len(selected['rosterVariableEvidence']['variables']), 5)
        self.assertEqual(selected['rosterVariableEvidence']['sourceUrl'], 'api:variables')

    def test_clear_roster_descriptions_and_compact_names_need_no_variable_request(self):
        for name, description in [
            ('R1_Z01A_HHRoster', ''), ('hh_sec_b', 'Roster of household members, individual characteristics'),
            ('M1', 'Roster, Demographics'), ('sec1', 'Roster'),
            ('s01_me_bfa2018', 'Section 1: Household sociodemographic characteristics'),
            ('GSEC2', 'Household Questionnaire\nSection 2: Survey roster')]:
            with self.subTest(name=name), patch('fetch_lsms.study_variables') as request:
                selected, _, _ = resolve_participant_file([self.file(name, description=description)], 'TEST')
                self.assertIsNotNone(selected)
                request.assert_not_called()

    def test_household_head_or_owner_demographics_do_not_establish_roster(self):
        for label in ('age of household head', 'age of plot owner', 'age of child', 'age at first marriage'):
            variables = self.variables()
            variables[-1]['labl'] = label
            self.assertIsNone(roster_variable_evidence(variables))
        variables = self.variables()
        variables[2]['labl'] = 'sex of household head'
        self.assertIsNone(roster_variable_evidence(variables))

    def test_identifiers_and_all_demographics_must_occur_in_one_file(self):
        variables = self.variables()
        variables[-1]['fid'] = 'F2'
        with patch('fetch_lsms.study_variables', return_value=(variables, 'api')):
            selected, reason, _ = resolve_participant_file([self.file()], 'TEST')
        self.assertIsNone(selected)
        self.assertEqual(reason, 'unresolved_no_person_roster')
        self.assertIsNone(roster_variable_evidence(self.variables()[1:]))

    def test_named_module_stays_excluded_even_with_repeated_demographic_columns(self):
        with patch('fetch_lsms.study_variables', return_value=(self.variables(), 'api')):
            selected, _, _ = resolve_participant_file([self.file('expenditure')], 'TEST')
        self.assertIsNone(selected)

    def test_different_variable_roster_counts_are_not_summed_or_resolved_by_size(self):
        files = [self.file(), self.file('HR1_visit2', 30000, 'F4')]
        with patch('fetch_lsms.study_variables', return_value=(self.variables()+self.variables('F4'), 'api')):
            selected, reason, alternatives = resolve_participant_file(files, 'TEST')
        self.assertIsNone(selected)
        self.assertEqual(reason, 'unresolved_ambiguous_variable_rosters')
        self.assertEqual(alternatives, ['F3', 'F4'])

    def test_no_files_missing_counts_and_network_failures_have_separate_reasons(self):
        with patch('fetch_lsms.study_variables') as request:
            self.assertEqual(resolve_participant_file([], 'TEST')[1], 'unresolved_no_file_metadata')
            self.assertEqual(resolve_participant_file([self.file(count=0)], 'TEST')[1], 'unresolved_missing_case_counts')
            request.assert_not_called()
        with patch('fetch_lsms.study_variables', side_effect=OSError('request failed')):
            files = [self.file()]
            self.assertEqual(resolve_participant_file(files, 'TEST')[1], 'unresolved_variable_metadata_unavailable')
            self.assertEqual(files[0]['variableMetadataError'], 'request failed')
        with patch('fetch_lsms.study_variables', return_value=(self.variables(), 'api')):
            files = [self.file(count=0), self.file('HR12', 100, 'F14')]
            self.assertEqual(resolve_participant_file(files, 'TEST')[1], 'unresolved_roster_missing_case_count')

    def test_household_size_is_not_a_household_identifier(self):
        variables = self.variables()
        variables[0].update(name='a01', labl='number of hh-members')
        self.assertIsNone(roster_variable_evidence(variables))

    def test_derived_analysis_tables_are_not_inferred_to_be_single_year_rosters(self):
        with patch('fetch_lsms.study_variables') as request:
            selected, reason, _ = resolve_participant_file([self.file()], 'BIH_2001-2004_LSMS_v01_M_v01_A_EPCT')
            self.assertIsNone(selected)
            self.assertEqual(reason, 'unresolved_derived_analysis_file')
            request.assert_not_called()

    def test_named_roster_missing_count_is_reported_even_without_variable_signature(self):
        files = [self.file('HH_SEC_B', 0, description='Roster of household members'),
                 self.file('ag_filters', 1184, 'F75')]
        with patch('fetch_lsms.study_variables', return_value=([], 'api')):
            self.assertEqual(resolve_participant_file(files, 'TEST')[1], 'unresolved_roster_missing_case_count')

    def test_variable_response_must_be_complete(self):
        with patch('fetch_lsms.api_get', return_value={'total': 10, 'variables': self.variables()}):
            with self.assertRaisesRegex(ValueError, 'Incomplete'):
                study_variables('TEST')

    def test_aggregate_counts_only_selected_roster_and_audits_skips(self):
        studies = [dict(idno='TZA_1993_HRDS_v01_M', year_start=1993),
                   dict(idno='TZA_1994_OTHER', year_start=1994)]
        with patch('fetch_lsms.study_files', side_effect=[[self.file()], []]), \
             patch('fetch_lsms.study_variables', return_value=(self.variables(), 'api')):
            totals, report, stats = aggregate_studies(studies, delay=0)
        self.assertEqual(totals, {'TZA': {'1993': 29914}})
        self.assertEqual(stats['unresolvedReasons'], {'unresolved_no_file_metadata': 1})
        self.assertIsNone(report[1]['participants'])
        self.assertIn('no data files', report[1]['unresolvedReason'])


class HouseholdEstimateTests(unittest.TestCase):
    def setUp(self):
        self.resources = load_resources()

    def study(self, sid='NGA_2010_GHSP-W1_v03_M'):
        binding = self.resources['studies'][sid]
        return dict(studyId=sid, iso3=binding['countryIso3'], year=binding['year'],
                    participants=None, selection='unresolved_no_person_roster',
                    files=[dict(fileId=binding['fileId'], fileName=binding['fileName'],
                                caseCount=binding['households'])])

    def test_resource_contains_only_reviewed_study_inputs(self):
        studies = self.resources['studies']
        self.assertEqual(len(studies), 23)
        self.assertTrue(all(row['mean'] >= 1 and row['households'] > 0 for row in studies.values()))
        self.assertEqual(set(studies['NGA_2010_GHSP-W1_v03_M']),
                         {'countryIso3', 'year', 'fileId', 'fileName', 'households',
                          'mean', 'tier', 'referenceYear', 'sourceUrl'})

    def test_same_study_mean_uses_one_reviewed_household_file(self):
        study = self.study()
        estimate, reason = estimate_study(study, self.resources)
        self.assertIsNone(reason)
        self.assertEqual(estimate['households'], 4933)
        self.assertEqual(estimate['estimatedMembers'], 27161)
        self.assertEqual(estimate['householdSize']['tier'], 'same_study_unweighted')
        self.assertIsNone(study['participants'])

    def test_comparable_survey_requires_explicit_review(self):
        sid = next(s for s in self.resources['studies'] if s.startswith('JAM_1994'))
        estimate, _ = estimate_study(self.study(sid), self.resources)
        self.assertEqual(estimate['householdSize']['tier'], 'comparable_survey')
        self.assertEqual(estimate['householdSize']['mean'], 3.838)
        self.assertEqual(estimate['householdSize']['yearGap'], 2)

    def test_national_fallback_retains_source_and_year_gap(self):
        sid = next(s for s in self.resources['studies'] if s.startswith('BEN_2021'))
        estimate, _ = estimate_study(self.study(sid), self.resources)
        reference = estimate['householdSize']
        self.assertEqual(reference['tier'], 'national_reference')
        self.assertLessEqual(reference['yearGap'], 5)
        self.assertIn('population.un.org', reference['sourceUrl'])

    def test_fixed_reviewed_mean_does_not_fall_back_to_another_country(self):
        sid = next(s for s in self.resources['studies'] if s.startswith('IND_1997'))
        estimate, _ = estimate_study(self.study(sid), self.resources)
        self.assertEqual(estimate['householdSize']['tier'], 'same_study_unweighted')
        study = self.study(sid)
        study['iso3'] = 'AAA'
        with self.assertRaisesRegex(ValueError, 'identity changed'):
            estimate_study(study, self.resources)

    def test_observed_roster_always_wins(self):
        study = self.study()
        study['participants'] = 1234
        records, meta = apply_estimates([study])
        self.assertEqual(records, {})
        self.assertEqual(study['participants'], 1234)
        self.assertIsNone(study['estimatedParticipants'])
        self.assertEqual(meta['remainingStudies'], 0)

    def test_ambiguous_and_derived_studies_require_review(self):
        for selection, suffix in [('unresolved_ambiguous_variable_rosters', ''),
                                  ('unresolved_no_person_roster', '_A_derived')]:
            study = self.study()
            study.update(selection=selection, studyId=study['studyId'] + suffix)
            self.assertEqual(estimate_study(study, self.resources),
                             (None, 'unresolved_study_requires_review'))

    def test_changed_household_file_is_not_silently_reused(self):
        for key, value in [('caseCount', 4000), ('fileName', 'other'), ('fileId', 'missing')]:
            study = self.study()
            study['files'][0][key] = value
            self.assertEqual(estimate_study(study, self.resources),
                             (None, 'reviewed_household_file_changed_or_missing'))

    def test_application_is_idempotent_and_offline(self):
        studies = [self.study()]
        with patch('urllib.request.urlopen', side_effect=AssertionError('No network allowed')):
            first = apply_estimates(studies)
            snapshot = copy.deepcopy(studies)
            second = apply_estimates(studies)
        self.assertEqual(first, second)
        self.assertEqual(snapshot, studies)

    def test_normal_fetch_computes_estimates_without_an_opt_in_flag(self):
        studies = [self.study()]
        observed = self.study()
        observed.update(studyId='NGA_2011_OBSERVED', year=2011, participants=100,
                        selectedFileId=observed['files'][0]['fileId'])
        observed['files'][0]['caseCount'] = 100
        studies.append(observed)
        totals = {'NGA': {'2011': 100}}
        stats = dict(studies=2, withParticipants=1, unresolved=1,
                     unresolvedReasons={'unresolved_no_person_roster': 1})
        with tempfile.TemporaryDirectory() as tmp:
            output, report = Path(tmp) / 'lsms.json', Path(tmp) / 'lsms_report.json'
            argv = ['fetch_lsms.py', '--output', str(output), '--report', str(report)]
            with patch('sys.argv', argv), \
                 patch('fetch_lsms.collection_studies', return_value=[{'idno': s['studyId']} for s in studies]), \
                 patch('fetch_lsms.aggregate_studies', return_value=(totals, studies, stats)), \
                 patch('urllib.request.urlopen', side_effect=AssertionError('Household references must be local')), \
                 contextlib.redirect_stdout(io.StringIO()):
                fetch_lsms()
            self.assertEqual(json.loads(output.read_text()), totals)
            audit = json.loads(report.read_text())
            self.assertEqual(audit['_meta']['estimatedRecords'], {'NGA': {'2010': 27161}})
            self.assertEqual(audit['_meta']['householdEstimation']['estimatedStudies'], 1)
            self.assertEqual(audit['studies'][0]['estimatedParticipants'], 27161)
            self.assertEqual(audit['studies'][1]['participants'], 100)
            self.assertIsNone(audit['studies'][1]['estimatedParticipants'])

    def test_build_recomputes_audit_and_rejects_changed_estimates(self):
        studies = [self.study()]
        records, provenance = apply_estimates(studies)
        report = dict(studies=studies, _meta=dict(estimatedRecords=records, householdEstimation=provenance))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'report.json'
            path.write_text(json.dumps(report))
            self.assertEqual(load_lsms_estimates(path, {}, {'NGA'})['estimatedRecords'], records)
            report['_meta']['estimatedRecords']['NGA']['2010'] += 1
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, 'stale or differ'):
                load_lsms_estimates(path, {}, {'NGA'})

    def test_dhs_timeline_also_clips_estimates(self):
        datasets = {'dhs': {'records': {'AAA': {'1985': 1}}},
                    'lsms': {'records': {}, 'estimatedRecords': {'AAA': {'1980': 5, '1990': 10},
                                                               'BBB': {'1980': 6}}}}
        self.assertEqual(restrict_to_dhs_timeline(datasets), 1985)
        self.assertEqual(datasets['lsms']['estimatedRecords'], {'AAA': {'1990': 10}})


if __name__ == '__main__':
    unittest.main()
