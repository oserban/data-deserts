"""Regression checks for GBIF basis-of-record filtering and cached provenance."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from build_data import load_gbif_filters
from fetch_gbif import ALLOWED_BASIS_OF_RECORD, EXCLUDED_BASIS_OF_RECORD, country_kingdom_years


class GbifFilterTests(unittest.TestCase):
    def test_query_includes_exactly_the_three_requested_basis_types(self):
        occurrences = Mock()
        occurrences.search.return_value = {
            'count': 7, 'facets': {'year': {'1985': 3, '2026': 4}}}
        self.assertEqual(country_kingdom_years(occurrences, 'KE', 1, 1985, 2026, 1),
                         {'1985': 3, '2026': 4})
        query = occurrences.search.call_args.kwargs
        self.assertEqual(query['basisOfRecord'], [
            'HUMAN_OBSERVATION', 'MACHINE_OBSERVATION', 'LIVING_SPECIMEN'])
        self.assertTrue(query['hasCoordinate'])
        self.assertFalse(query['hasGeospatialIssue'])
        self.assertEqual(query['occurrenceStatus'], 'PRESENT')
        self.assertEqual(query['year'], '1985,2026')
        self.assertEqual(query['kingdomKey'], 1)

    def test_included_and_excluded_types_are_consistent(self):
        self.assertFalse(set(ALLOWED_BASIS_OF_RECORD) & set(EXCLUDED_BASIS_OF_RECORD))
        self.assertIn('PRESERVED_SPECIMEN', EXCLUDED_BASIS_OF_RECORD)
        self.assertIn('MATERIAL_SAMPLE', EXCLUDED_BASIS_OF_RECORD)
        self.assertIn('OBSERVATION', EXCLUDED_BASIS_OF_RECORD)

    def test_incomplete_year_facets_fail_instead_of_undercounting(self):
        occurrences = Mock()
        occurrences.search.return_value = {'count': 10, 'facets': {'year': {'2020': 9}}}
        with self.assertRaisesRegex(RuntimeError, 'incomplete'):
            country_kingdom_years(occurrences, 'KE', 1, 1985, 2026, 1)

    def report(self, basis=None, count=4):
        return {
            '_meta': {'records': count, 'filters': {
                'basisOfRecordIncluded': ALLOWED_BASIS_OF_RECORD if basis is None else basis}},
            'byCountry': {'KEN': {'records': count}, 'AAA': {'records': 0}},
        }

    def load(self, report):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'gbif_report.json'
            path.write_text(json.dumps(report))
            return load_gbif_filters(path, {'KEN': {'2020': 4}})

    def test_build_accepts_current_filter_and_matching_counts(self):
        filters = self.load(self.report())
        self.assertEqual(filters['basisOfRecordIncluded'], ALLOWED_BASIS_OF_RECORD)

    def test_build_rejects_old_or_incomplete_allowlists(self):
        for basis in [ALLOWED_BASIS_OF_RECORD + ['PRESERVED_SPECIMEN'],
                      ['HUMAN_OBSERVATION', 'MACHINE_OBSERVATION']]:
            with self.subTest(basis=basis), self.assertRaisesRegex(ValueError, 'outdated'):
                self.load(self.report(basis=basis))

    def test_build_rejects_counts_that_do_not_match_report(self):
        with self.assertRaisesRegex(ValueError, 'do not match'):
            self.load(self.report(count=5))


if __name__ == '__main__':
    unittest.main()
