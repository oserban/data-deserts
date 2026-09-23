import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from shapely.geometry import box, mapping

from fetch_crop_allocation import (Cache, DataError, country_names, country_notes,
    parse_faostat_observations, reconcile_duplicates, reconcile_map_boundaries, load_units, evidence_counts,
    extract_census_member, digest, period_includes, parse_siap_observations)


class CensusReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.names = country_names()
        self.sources = [dict(country='Cambodia', admin_level_raw='0', data_source='FAOSTAT',
            report='FAOSTAT Crop Harvested Area Database', coverage_period='2000-2020',
            admin_level_ref='supplement.pdf#page=15')]
        self.notes = {'KHM': {'text': 'Total harvested area from FAOSTAT.', 'pages': [74]}}
        self.row = {'Area': 'Cambodia', 'Area Code (M49)': '116', 'Year': '2010', 'Item': 'Rice',
                    'Element': 'Area harvested', 'Element Code': '5312', 'Unit': 'ha',
                    'Value': '12', 'Flag': 'A', 'Flag Description': 'Official figure'}

    def parse(self, rows, **kwargs):
        return parse_faostat_observations(rows, 'raw.zip!original.csv@sha256:abc', [2000, 2010, 2015],
                                         ['rice', 'potato', 'wheat'], kwargs.get('sources', self.sources),
                                         kwargs.get('notes', self.notes), self.names)

    def test_official_new_and_legacy_exports_keep_zero_and_row_provenance(self):
        rows, unresolved, _ = self.parse([self.row, {**self.row, 'Value': '0', 'Flag': '',
                                                  'Flag Description': 'Official data'}])
        self.assertFalse(unresolved)
        self.assertEqual([r['area_ha'] for r in rows], [12, 0])
        self.assertEqual(rows[0]['admin_unit_id'], 'KHM:0')
        self.assertTrue(rows[0]['source_ref'].endswith('#row=2'))
        self.assertEqual(rows[0]['product'], 'mirca_os')
        self.assertIn('#page=74', rows[0]['admin_level_ref'])

    def test_estimates_unofficial_missing_flags_and_excluded_crops_never_count(self):
        bad = [{**self.row, 'Flag': f, 'Flag Description': label} for f, label in
               [('I', 'Imputed value'), ('E', 'Estimated value'), ('T', 'Unofficial figure'), ('', ''),
                ('A', 'Estimated value')]]
        bad += [{**self.row, 'Item': 'Sweet potatoes'}, {**self.row, 'Item': 'Other cereals'},
                {**self.row, 'Year': '2005'}]
        rows, _, omitted = self.parse(bad)
        self.assertFalse(rows)
        self.assertEqual(sum(omitted.values()), len(bad))

    def test_wrong_quantity_units_country_code_and_notes_are_unresolved(self):
        rows, unresolved, _ = self.parse([{**self.row, **change} for change in
            [{'Element': 'Area sown'}, {'Unit': '1000 ha'}, {'Area Code (M49)': '004'},
             {'Value': 'nan'}, {'Value': '-1'}, {'Note': 'Includes estimated allocation'}]])
        self.assertFalse(rows)
        self.assertEqual(len(unresolved), 6)

    def test_mixed_levels_and_subnational_note_exceptions_are_not_national_reports(self):
        for options in [dict(sources=[*self.sources, {**self.sources[0], 'admin_level_raw': '1'}]),
                        dict(notes={'KHM': {'text': 'FAOSTAT; province totals used for wheat.', 'pages': [74]}}),
                        dict(notes={})]:
            with self.subTest(options=options):
                rows, unresolved, _ = self.parse([self.row], **options)
                self.assertFalse(rows)
                self.assertEqual(len(unresolved), 1)

    def test_year_membership_does_not_interpolate_enumerated_years(self):
        self.assertTrue(period_includes('2000–2020', 2010))
        self.assertFalse(period_includes('2000, 2015, 2020', 2010))
        self.assertFalse(period_includes('2011-2020', 2010))

    def test_country_notes_continue_across_pages_without_bleeding_into_next_country(self):
        notes = country_notes([{'pdf_page': 1, 'text': 'Asia\nCambodia\nFAOSTAT total harvested'},
                               {'pdf_page': 2, 'text': 'area.\nTajikistan\nOther statistics.\n2'}], self.names)
        self.assertEqual(notes['KHM'], {'text': 'FAOSTAT total harvested area.', 'pages': [1, 2]})
        self.assertNotIn('Other', notes['KHM']['text'])

    def test_identical_exports_deduplicate_conflicting_official_values_do_not(self):
        rows, _, _ = self.parse([self.row, self.row])
        accepted, conflicts = reconcile_duplicates(rows)
        self.assertEqual(len(accepted), 1)
        self.assertFalse(conflicts)
        self.assertIn('#row=3', accepted[0]['source_ref'])
        accepted, conflicts = reconcile_duplicates([*rows, {**rows[0], 'area_ha': 13}])
        self.assertFalse(accepted)
        self.assertEqual(len(conflicts), 1)

    def write_map(self, root, iso='KHM'):
        path = root / 'world.raw.geojson'
        path.write_text(json.dumps({'type': 'FeatureCollection', 'features': [
            {'type': 'Feature', 'id': iso, 'properties': {}, 'geometry': mapping(box(0, 0, 2, 1))}]}))
        return path

    def test_national_observation_uses_exact_map_coordinates(self):
        rows, _, _ = self.parse([self.row])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            world = self.write_map(root)
            accepted, features, errors = reconcile_map_boundaries(rows, world)
            self.assertFalse(errors)
            self.assertEqual(accepted[0]['admin_unit_id'], 'KHM:0')
            self.assertEqual(features[0]['geometry'], json.loads(world.read_text())['features'][0]['geometry'])
            self.assertEqual(features[0]['properties']['admin_unit_id'], 'KHM')
            units = root / 'units.geojson'
            units.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}))
            self.assertEqual(len(load_units(units, accepted, world)), 1)
            self.assertEqual(evidence_counts(accepted)['mirca_os'], {'KHM': {'2010': 1}})

    def test_country_absent_from_map_is_excluded(self):
        rows, _, _ = self.parse([self.row])
        with tempfile.TemporaryDirectory() as directory:
            accepted, features, errors = reconcile_map_boundaries(rows, self.write_map(Path(directory), 'MEX'))
        self.assertFalse(accepted)
        self.assertFalse(features)
        self.assertEqual(errors[0]['reason'], 'Country absent from dashboard map')

    def test_member_namespaces_crc_and_cached_integrity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            archive = root / 'raw.zip'
            with zipfile.ZipFile(archive, 'w') as z:
                z.writestr('country1/census.csv', 'first')
                z.writestr('country2/census.csv', 'second')
            cache = Cache(root / 'cache', True)
            sha = digest(archive)
            first = extract_census_member(archive, 'country1/census.csv', sha, cache)
            second = extract_census_member(archive, 'country2/census.csv', sha, cache)
            self.assertNotEqual(first, second)
            self.assertEqual(second.read_text(), 'second')
            self.assertEqual(extract_census_member(archive, 'country1/census.csv', sha, cache), first)
            first.write_text('corrupt')
            with self.assertRaisesRegex(DataError, 'Corrupt census extraction'):
                extract_census_member(archive, 'country1/census.csv', sha, cache)
            with self.assertRaisesRegex(DataError, 'Unsafe archive member'):
                extract_census_member(archive, '../census.csv', sha, cache)

    def siap(self, rows):
        return parse_siap_observations(rows, 'raw.rar!SIAP.csv', [2000, 2010, 2015], ['wheat', 'potato'],
            [dict(country='Mexico', report='Agricultural Production Statistics', admin_level_raw='1',
                  source_links='https://infosiap.siap.gob.mx/data', coverage_period='2000-2020',
                  admin_level_ref='supplement.pdf#page=39')],
            {'MEX': {'text': 'A province-level total and irrigated harvested area was obtained.', 'pages': [92]}})

    def siap_row(self, **changes):
        return {'Year': '2010', 'NameCrop_En': 'Wheat Grain', 'NameCrop_Sp': 'Trigo grano',
                'NameState': 'Sonora', 'NameMunicipality': 'First', 'NameSeason': 'Fall-Winter',
                'IrrigationStyle': 'Rainfed', 'Harvested(Ha)': '10', 'Sown(Ha)': '100', **changes}

    def test_siap_sums_harvested_area_across_seasons_modes_and_municipalities_once(self):
        rows, errors, _ = self.siap([self.siap_row(), self.siap_row(),
            self.siap_row(NameMunicipality='Second'), self.siap_row(IrrigationStyle='Irrigated'),
            self.siap_row(NameSeason='Spring-Summer')])
        self.assertFalse(errors)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['area_ha'], 40)
        self.assertEqual(rows[0]['admin_level'], 1)

    def test_siap_conflicting_cells_or_mixed_admin_totals_reject_whole_state_crop(self):
        for extra in [self.siap_row(**{'Harvested(Ha)': '11'}), self.siap_row(NameMunicipality='')]:
            rows, errors, _ = self.siap([self.siap_row(), extra])
            self.assertFalse(rows)
            self.assertEqual(len(errors), 1)

    def test_siap_seed_components_are_flagged_and_fodder_never_enters(self):
        rows, errors, omitted = self.siap([self.siap_row(),
            self.siap_row(NameCrop_En='Seed of Wheat Grain', NameCrop_Sp='Semilla trigo'),
            self.siap_row(NameCrop_En='Green Wheat (Forage)'), self.siap_row(NameCrop_En='Sweet Potato')])
        self.assertFalse(errors)
        self.assertEqual(rows[0]['crosswalk_exactness'], 'aggregated')
        self.assertEqual(rows[0]['area_ha'], 20)
        self.assertEqual(omitted['outside_crop_or_year_scope'], 2)

    def test_state_evidence_retains_counts_and_levels_with_one_country_geometry(self):
        rows, _, _ = self.siap([self.siap_row(), self.siap_row(NameState='Chihuahua')])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            world = self.write_map(root, 'MEX')
            accepted, features, unresolved = reconcile_map_boundaries(rows, world)
            self.assertFalse(unresolved)
            self.assertEqual([r['admin_unit_id'] for r in accepted], [r['admin_unit_id'] for r in rows])
            self.assertTrue(all(r['admin_level'] == 1 for r in accepted))
            self.assertEqual(len(features), 1)
            self.assertEqual(features[0]['properties']['admin_level'], 0)
            self.assertEqual(features[0]['properties']['source_admin_levels'], [1])
            self.assertEqual(evidence_counts(accepted)['mirca_os'], {'MEX': {'2010': 2}})
            units = root / 'units.geojson'
            units.write_text(json.dumps({'type': 'FeatureCollection', 'features': features}))
            self.assertEqual(set(load_units(units, accepted, world)), {('MEX', 'MEX', 2010)})

    def test_changed_map_subdivision_and_modified_coordinates_fail(self):
        rows, _, _ = self.parse([self.row])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            world = self.write_map(root)
            accepted, features, _ = reconcile_map_boundaries(rows, world)
            units = root / 'units.geojson'
            original = json.dumps({'type': 'FeatureCollection', 'features': features})
            for change in ('coordinates', 'subdivision', 'duplicate', 'map'):
                data = json.loads(original)
                if change == 'coordinates':
                    data['features'][0]['geometry'] = mapping(box(0, 0, 1, 1))
                elif change == 'subdivision':
                    data['features'][0]['properties']['admin_unit_id'] = 'province'
                elif change == 'duplicate':
                    data['features'].append(data['features'][0])
                else:
                    world.write_text(world.read_text() + '\n')
                units.write_text(json.dumps(data))
                with self.subTest(change=change), self.assertRaises(DataError):
                    load_units(units, accepted, world)


if __name__ == '__main__':
    unittest.main()
