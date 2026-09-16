"""PREDICTS release merge, identity and provenance regression tests."""
import csv
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from build_data import load_predicts_sources
from fetch_predicts import RELEASES, aggregate_releases, api_records, local_records, prepare_release


class PredictsTests(unittest.TestCase):
    def row(self, **overrides):
        return {'SSBS': 'source 1  01', 'Latitude': '5', 'Longitude': '10',
                'Sample_midpoint': '2010-02-01', '_id': '1', **overrides}

    def merge(self, first, second):
        with patch('fetch_predicts.CountryMatcher.from_file') as matcher:
            matcher.return_value.country_at.return_value = 'AAA'
            return aggregate_releases(zip(RELEASES, [first, second]), 'unused.geojson')

    def test_additions_use_sample_year_not_release_year_or_api_row_id(self):
        counts, reports = self.merge([self.row()], [self.row(SSBS='other 1  01',
                                                           Sample_midpoint='2018-01-01')])
        self.assertEqual(counts, {'AAA': {'2010': 1, '2018': 1}})
        self.assertEqual([r['matched'] for r in reports], [1, 1])

    def test_duplicate_sites_within_and_across_releases_count_once(self):
        counts, reports = self.merge([self.row(), self.row()], [self.row()])
        self.assertEqual(counts, {'AAA': {'2010': 1}})
        self.assertEqual(reports[0]['duplicateRows'], 1)
        self.assertEqual(reports[1]['duplicatesFromEarlierReleases'], 1)

    def test_conflicting_site_metadata_requires_review(self):
        for first, second in [([self.row(), self.row(Latitude='6')], []),
                              ([self.row()], [self.row(Sample_midpoint='2018-01-01')])]:
            with self.subTest(first=first, second=second):
                with self.assertRaisesRegex(ValueError, 'Conflicting PREDICTS site'):
                    self.merge(first, second)

    def test_labels_are_not_factor_codes_and_unused_categories_do_not_create_sites(self):
        sites, stats = prepare_release([
            self.row(SSBS='001', unused_levels=['unused source', 'unused study']),
            self.row(SSBS='1', unused_levels=['different ordering'])])
        self.assertEqual(set(sites), {'001', '1'})
        self.assertNotIn('unused_levels', sites['001'])
        self.assertEqual(stats['rows'], 2)
        with self.assertRaisesRegex(ValueError, 'text SSBS'):
            prepare_release([self.row(SSBS=1)])

    def test_invalid_locations_or_dates_are_reported(self):
        counts, reports = self.merge([self.row(Latitude='nan'), self.row(SSBS='b',
                                    Sample_midpoint='NA')], [self.row()])
        self.assertEqual(reports[0]['invalid'], 2)
        self.assertEqual(counts, {'AAA': {'2010': 1}})

    def test_same_coordinates_in_distinct_studies_remain_distinct_sites(self):
        counts, _ = self.merge([self.row()], [self.row(SSBS='source 2  01')])
        self.assertEqual(counts, {'AAA': {'2010': 2}})

    def test_zip_csv_preserves_text_identifiers_and_requires_member_if_ambiguous(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'sites.zip'
            output = io.StringIO()
            writer = csv.DictWriter(output, fieldnames=list(self.row()))
            writer.writeheader()
            writer.writerow(self.row())
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('sites.csv', output.getvalue())
            rows = list(local_records(path))
            self.assertEqual(rows[0]['SSBS'], 'source 1  01')
            with zipfile.ZipFile(path, 'a') as archive:
                archive.writestr('other.csv', output.getvalue())
            with self.assertRaisesRegex(ValueError, 'multiple CSV'):
                list(local_records(path))
            self.assertEqual(len(list(local_records(path, 'sites.csv'))), 1)

    def test_pagination_uses_selected_release_resource(self):
        with patch('fetch_predicts.fetch_page', side_effect=[
            {'total': 2, 'records': [self.row()], 'after': ['cursor']},
            {'total': 2, 'records': [self.row(SSBS='other')], 'after': None},
        ]) as fetch:
            self.assertEqual(len(list(api_records('2022-resource', 1))), 2)
            fetch.assert_any_call('2022-resource', None, 1)
            fetch.assert_any_call('2022-resource', ['cursor'], 1)

    def test_build_requires_both_releases_and_matching_total(self):
        counts, reports = self.merge([self.row()], [self.row(SSBS='other')])
        report = {'_meta': {'schemaVersion': 1, 'unit': 'sites', 'matched': 2},
                  'releases': reports}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'predicts_report.json'
            path.write_text(json.dumps(report))
            self.assertEqual(len(load_predicts_sources(path, counts)), 2)
            with self.assertRaisesRegex(ValueError, 'do not match'):
                load_predicts_sources(path, {'AAA': {'2010': 1}})
            report['releases'] = reports[:1]
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, '2022 additions'):
                load_predicts_sources(path, counts)


if __name__ == '__main__':
    unittest.main()
