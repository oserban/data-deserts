"""Scientific and cache contracts for harvested-area allocation dispersion."""
import io
import json
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
import zipfile
from unittest.mock import patch, MagicMock

from fetch_crop_allocation import (Cache, DataError, dispersion_curve, compute,
                                   crop_allowed, evidence_counts, validate_grid, assert_same_grid,
                                   manifest_coverage, supplementary_rows, local_gaez2015_layers,
                                   import_local_gaez2015, validate_zip_headers, share_dispersion_curve, main,
                                   MISSING_EVIDENCE_EXIT, METHOD, UNIT)

try:
    import numpy as np
except ImportError:
    np = None


@unittest.skipUnless(np is not None, 'install processing/requirements.txt')
class DispersionTests(unittest.TestCase):
    def metadata(self):
        return dict(country_iso3='AAA',admin_unit_id='a',admin_level=1,crop='wheat',year=2010,
                    products='gaez|mirca_os',crosswalk_exactness='exact')

    def curve(self, data, **kwargs):
        return dispersion_curve(data, 1, 4, self.metadata(), **kwargs)

    def test_mass_conserved_but_displaced_allocations_decay(self):
        curve = self.curve([[[4,0],[0,0]], [[0,4],[0,0]]])
        self.assertAlmostEqual(curve[0]['mean_cv'], 2**.5)
        self.assertEqual(curve[0]['n_blocks'],2)
        self.assertEqual(curve[-1]['mean_cv'],0)
        self.assertEqual(curve[-1]['scale_km_normalised'],1)

    def test_separate_analysis_regions_do_not_cancel_discrepancies(self):
        # Separate map countries must each satisfy the total checks.
        for a in ([[[10]],[[9]]], [[[9]],[[10]]]):
            with self.assertRaisesRegex(DataError,'statistical base'):
                self.curve(a)

    def test_permissive_screen_does_not_disable_zero_residual_assertion(self):
        with self.assertRaisesRegex(DataError,'pairwise residual'):
            self.curve([[[100]],[[101]]], totals_rtol=.1)

    def test_country_share_comparison_handles_different_raw_totals(self):
        rows, similarity, totals = share_dispersion_curve(
            [[[2, 0]], [[20, 0]]], 1, 4, self.metadata())
        self.assertEqual(totals, {'gaez': 2.0, 'mirca_os': 20.0})
        self.assertEqual(similarity, 1)
        self.assertEqual(rows[-1]['mean_cv'], 0)


class AgriculturePayloadTests(unittest.TestCase):
    def metadata(self):
        return dict(country_iso3='AAA', admin_unit_id='a', admin_level=1, crop='wheat', year=2010,
                    products='gaez|mirca_os', crosswalk_exactness='exact')

    def curve(self, data, **kwargs):
        return dispersion_curve(data, 1, 4, self.metadata(), **kwargs)

    def test_absent_evidence_exports_availability_without_fabricated_values(self):
        from build_data import agriculture_payload
        with tempfile.TemporaryDirectory() as directory:
            payload = agriculture_payload(directory, {'AAA'})
        self.assertEqual(payload['status'], 'unavailable')
        self.assertEqual(len(payload['cropOrder']), 15)
        self.assertEqual(payload['records'], {})
        self.assertTrue(all(not c['metrics'] and not c['records'] for c in payload['crops'].values()))

    def test_payload_deduplicates_evidence_and_keeps_zero_dispersion(self):
        from build_data import agriculture_payload
        row = dict(product='mirca_os', country_iso3='AAA', year=2010, crop='wheat',
                   admin_unit_id='one', admin_level=1, source_ref='census:table1',
                   admin_level_ref='supplement:page3', status='reported')
        summary = dict(country_iso3='AAA', year=2010, crop='wheat',
                       dispersion_at_native_cell=0, effective_resolution_km=15,
                       crosswalk_exactness='exact', complete=True)
        report = {'_meta': {'countingMethod': METHOD, 'unit': UNIT},
                  'evidence': [row, {**row, 'product': 'mapspam'}, {**row, 'crop': 'barley'},
                               {**row, 'admin_unit_id': 'two'}, {**row, 'country_iso3': 'OUT'}],
                  'effective_resolution': [summary, {**summary, 'crop': 'barley', 'complete': False}]}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/'crop_allocation_report.json'
            path.write_text(json.dumps(report))
            payload = agriculture_payload(directory, {'AAA'})
            self.assertEqual(payload['records'], {'AAA': {'2010': 2}})
            self.assertEqual(payload['crops']['wheat']['records'], {'AAA': {'2010': 2}})
            self.assertEqual(payload['crops']['barley']['records'], {'AAA': {'2010': 1}})
            self.assertEqual(payload['crops']['wheat']['metrics']['AAA']['2010']['dispersion'], 0)
            self.assertIsNone(payload['crops']['barley']['metrics']['AAA']['2010']['dispersion'])
            self.assertEqual(payload['effective_resolution_km']['AAA']['2010'], {'wheat': 15, 'barley': None})
            report['effective_resolution'].append(summary)
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, 'Duplicate agriculture'):
                agriculture_payload(directory, {'AAA'})

    def test_payload_refuses_metrics_from_another_map(self):
        from build_data import agriculture_payload
        report = {'_meta': {'countingMethod': METHOD, 'unit': UNIT,
                           'analysisGeometry': {'sha256': 'original', 'scope': 'map country'}},
                  'evidence': [], 'effective_resolution': []}
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'crop_allocation_report.json').write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, 'geometry differs'):
                agriculture_payload(directory, {'AAA'}, expected_geometry_sha='changed')
            payload = agriculture_payload(directory, {'AAA'}, expected_geometry_sha='original')
            self.assertEqual(payload['analysisGeometry']['sha256'], 'original')

    def test_payload_keeps_source_availability_without_two_product_comparison(self):
        from build_data import agriculture_payload
        availability = dict(country_iso3='AAA', crop='wheat', year=2015, products=['mirca_os'],
                            n_products=1, expected_products=['mirca_os'], source_availability=1.0,
                            status='single_product', issues=[])
        report = {'_meta': {'countingMethod': METHOD, 'unit': UNIT},
                  'evidence': [], 'effective_resolution': [], 'source_availability': [availability]}
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'crop_allocation_report.json').write_text(json.dumps(report))
            payload = agriculture_payload(directory, {'AAA'})
            metric = payload['crops']['wheat']['metrics']['AAA']['2015']
        self.assertEqual(metric['sourceAvailability'], 1)
        self.assertIsNone(metric['dispersion'])
        self.assertFalse(metric['complete'])
        self.assertEqual(payload['aggregateMapAvailability'], {'AAA': {'2015': 1}})

    def test_empty_blocks_ignored_and_edges_summed(self):
        a=np.zeros((2,3,5));a[0,2,4]=10;a[1,0,0]=10
        c=self.curve(a)
        self.assertEqual(c[-1]['n_blocks'],1)
        self.assertEqual(c[-1]['mean_cv'],0)
        self.assertEqual(c[-1]['scale_km'],5)

    def test_compute_uses_one_country_and_preserves_observed_crossing(self):
        from shapely.geometry import box
        geometry = box(0, 0, 2, 1)
        evidence = [dict(country_iso3='AAA', admin_unit_id=uid, admin_level=1,
                         crop='potato', year=2000, product='mirca_os', crosswalk_exactness='aggregated')
                    for uid in ('state1', 'state2')]
        layers = [dict(crop='potato', year=2000, product=p, system=s, path=p,
                       unit='ha', crosswalk_exactness='exact')
                  for p in ('mirca2000', 'mirca_os') for s in ('irrigated', 'rainfed')]
        args = SimpleNamespace(crops=['potato'], years=[2000], mapspam_vintages=[2010],
                               tolerance=.1, totals_tolerance=.1, zero_rtol=1e-6, zero_atol_ha=.01)
        def remap(paths, factors, boundary, cell_m, cache):
            self.assertIs(boundary, geometry)
            # Different sub-country allocations may cancel within this ONE map country.
            values = [[4, 0], [0, 0]] if paths[0] == 'mirca2000' else [[0, 4], [0, 0]]
            return SimpleNamespace(values=np.array(values), shape=(2, 2), transform='same',
                                   crs='same', area_km2=4)
        with patch('fetch_crop_allocation.remap_unit', side_effect=remap) as mocked:
            rows, summaries, curves, skipped = compute(layers, evidence,
                {('AAA', 'AAA', 2000): dict(geometry=geometry, admin_level=0)}, args)
        self.assertFalse(skipped)
        self.assertEqual(mocked.call_count, 2)
        self.assertEqual(summaries[0]['n_admin_units'], 1)
        self.assertEqual(summaries[0]['admin_level'], 0)
        self.assertEqual(summaries[0]['effective_resolution_km'], rows[1]['scale_km'])
        self.assertAlmostEqual(summaries[0]['dispersion_at_native_cell'], 2**.5)
        self.assertEqual(summaries[0]['crosswalk_exactness'], 'aggregated')
        self.assertEqual(curves[0]['curve'], rows)
        self.assertTrue(all(r['admin_unit_id'] == 'AAA' for r in rows))

    def test_fractional_admin_remapping_preserves_mass_without_crossing_boundary(self):
        from fetch_crop_allocation import remap_unit
        import rasterio
        from rasterio.transform import from_origin
        from shapely.geometry import box
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'global.tif'
            values=np.zeros((2160,4320),dtype='float32')
            values[1079,2160]=10
            with rasterio.open(path,'w',driver='GTiff',width=4320,height=2160,count=1,
                               dtype='float32',crs='EPSG:4326',transform=from_origin(-180,90,1/12,1/12),
                               compress='deflate') as out:
                out.write(values,1)
            cache = {}
            left=remap_unit([path],[1],box(0,0,1/24,1/12),3000,cache)
            right=remap_unit([path],[1],box(1/24,0,1/12,1/12),3000,cache)
            self.assertAlmostEqual(left.values.sum(),5,places=4)
            self.assertAlmostEqual(right.values.sum(),5,places=4)
            self.assertAlmostEqual(left.values.sum()+right.values.sum(),10,places=4)
            scaled=remap_unit([path],[3],box(0,0,1/24,1/12),3000,cache)
            np.testing.assert_allclose(scaled.values, left.values*3)

    def test_invalid_values_and_one_product_fail(self):
        for a in [np.zeros((1,2,2)),np.full((2,1,1),np.nan),np.full((2,1,1),-1),np.zeros((2,1,1))]:
            with self.assertRaises(DataError):self.curve(a)


class ContractTests(unittest.TestCase):
    def test_missing_intermediates_are_reported_before_any_raster_access(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output, raw = root / 'output', root / 'raw'
            with patch('fetch_crop_allocation.Cache'), patch('fetch_crop_allocation.reconcile_census') as reconcile, \
                    patch('fetch_crop_allocation.source_manifest') as manifest, patch('sys.stderr', new_callable=io.StringIO) as error:
                with self.assertRaises(SystemExit) as stopped:
                    main(['--allocation-basis', 'strict-totals', '--mirca-raw', str(raw), '--output-dir', str(output)])
                self.assertEqual(stopped.exception.code, MISSING_EVIDENCE_EXIT)
                reconcile.assert_called_once()
                manifest.assert_not_called()
                self.assertIn('not provider downloads', error.getvalue())
            status = json.loads((output / 'evidence_readiness.json').read_text())
            self.assertEqual(status['status'], 'blocked')
            self.assertEqual(status['missingInputs'], [str(raw / 'reporting_units.csv'), str(raw / 'analysis_units.geojson')])
            self.assertFalse(raw.exists())

    def test_explicit_evidence_paths_and_missing_units_are_reported_together(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            evidence, units = root / 'reviewed.csv', root / 'boundaries.geojson'
            evidence.write_text('sentinel')
            with patch('sys.stderr', new_callable=io.StringIO), self.assertRaises(SystemExit) as stopped:
                main(['--evidence', str(evidence), '--units', str(units), '--output-dir', str(root)])
            self.assertEqual(stopped.exception.code, MISSING_EVIDENCE_EXIT)
            status = json.loads((root / 'evidence_readiness.json').read_text())
            self.assertEqual(status['missingInputs'], [str(units)])
            self.assertEqual(evidence.read_text(), 'sentinel')

    def test_archive_inventory_is_not_proof_that_members_are_readable(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'census.zip'
            with zipfile.ZipFile(path, 'w') as archive:
                archive.writestr('observations.csv', 'year,value\n2000,12\n')
            validate_zip_headers(path)
            content = bytearray(path.read_bytes())
            content[:4] = b'FAIL'
            path.write_bytes(content)
            with zipfile.ZipFile(path) as archive:
                self.assertEqual(archive.namelist(), ['observations.csv'])
            with self.assertRaisesRegex(DataError, 'Unreadable archive census.zip'):
                validate_zip_headers(path)

    def test_local_gaez_labels_exclusions_and_offline_idempotent_import(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            raw = p/'raw'
            raw.mkdir()
            with zipfile.ZipFile(raw/'dataverse_files.zip', 'w') as archive:
                for crop in ('Rice', 'Oilpalmfruit', 'PotatoAndSweetpotato', 'Foddercrops'):
                    for mode in ('Irrigated', 'Rainfed', 'Total'):
                        archive.writestr(f'folder/GAEZAct2015_HarvArea_{crop}_{mode}.tif', b'test identity only')
            cache = Cache(p/'cache', offline=True)
            selected = ['rice', 'oil_palm', 'potato']
            original = {'layers': [], 'requestedCrops': [*selected, 'wheat'],
                        'unavailable': [{'product': 'gaez', 'year': 2015, 'reason': '403'}]}
            with patch.dict('sys.modules', {'requests': None}):
                imported = import_local_gaez2015(original, cache, raw, [2015], selected)
                self.assertEqual(len(imported['layers']), 4)
                self.assertEqual({e['source_crop'] for e in imported['layers']}, {'Rice', 'Oilpalmfruit'})
                self.assertEqual({e['unit'] for e in imported['layers']}, {'1000 ha'})
                self.assertEqual([e['crop'] for e in imported['unavailable']], ['wheat'])
                self.assertEqual(import_local_gaez2015(imported, Cache(p/'cache', True), raw, [2015], selected), imported)
            self.assertEqual(original['layers'], [])

    def test_local_gaez_missing_mode_or_duplicate_file_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            raw = p/'raw'
            raw.mkdir()
            name = 'GAEZAct2015_HarvArea_Wheat_Irrigated.tif'
            with zipfile.ZipFile(raw/'files.zip', 'w') as archive:
                archive.writestr(name, b'one')
            with self.assertRaisesRegex(DataError, 'Incomplete local'):
                local_gaez2015_layers(Cache(p/'cache', True), raw, ['wheat'])
            (raw/name).write_bytes(b'two')
            with self.assertRaisesRegex(DataError, 'Ambiguous duplicate'):
                local_gaez2015_layers(Cache(p/'cache', True), raw, ['wheat'])

    def test_partial_manifest_cannot_silently_pass_a_wider_request(self):
        layers = [dict(product=p, crop='potato', year=2000, system=s, name=f'{p}-{s}')
                  for p in ('mirca2000', 'mirca_os') for s in ('irrigated', 'rainfed')]
        self.assertEqual(manifest_coverage({'layers': layers}, [2000], ['potato']), [])
        self.assertEqual(len(manifest_coverage({'layers': layers}, [2000, 2010], ['potato'])), 2)
        self.assertTrue(manifest_coverage({'layers': layers + [layers[0]]}, [2000], ['potato']))

    def test_supplement_does_not_guess_country_across_empty_cell_or_page_break(self):
        row = lambda country: [country, 'Census', '2000', '1', 'Statistics office', 'https://example.org']
        rows = supplementary_rows([(2, [row('Country A'), row(None), row(''), row(None)]),
                                    (3, [row(None), row('Country B'), row(None)])])
        self.assertEqual([r['country'] for r in rows], ['Country A', 'Country A', None, None, None, 'Country B', 'Country B'])
        self.assertEqual(rows[-1]['pdf_page'], 3)

    def test_excluded_crops_and_pair_gating(self):
        for crop in ['millet','coffee','rye','fodder','other_cereals']:
            with self.assertRaises(DataError):crop_allowed(crop,['gaez','mirca_os'])
        with self.assertRaises(DataError):crop_allowed('potato',['gaez','mirca_os'])
        crop_allowed('potato',['mirca2000','mirca_os'])
        crop_allowed('cocoa',['mapspam','mirca2000'],True)
        with self.assertRaises(DataError):crop_allowed('cocoa',['gaez','mirca_os'],True)

    def test_counts_deduplicate_units_across_crops_and_require_observation_provenance(self):
        r=dict(product='mirca_os',country_iso3='AAA',year='2010',crop='wheat',admin_unit_id='1',
               admin_level='1',
               source_ref='census:table4',admin_level_ref='supplement:tableS1',status='reported')
        self.assertEqual(evidence_counts([r,r,{**r,'crop':'barley'}]),{'mirca_os':{'AAA':{'2010':1}}})
        for override in [dict(status='interpolated'),dict(source_ref=''),dict(year='2005'),dict(admin_level='-1')]:
            with self.assertRaises(DataError):evidence_counts([{**r,**override}])

    def test_build_reconstructs_evidence_and_refuses_tampered_counts(self):
        from build_data import load_crop_sources, CROP_DEFINITIONS
        from fetch_crop_allocation import METHOD, UNIT
        row=dict(product='mirca_os',country_iso3='AAA',year='2010',crop='wheat',admin_unit_id='1',
                 admin_level='0',source_ref='census:table4',admin_level_ref='supplement:tableS1',status='reported')
        report={'_meta':{'schemaVersion':1,'countingMethod':METHOD,'unit':UNIT,
                         'countryWeighting':'mean of nonzero blocks within map country','tolerance':.1},
                'evidence':[row], 'crosswalk':[{'product':'mirca_os','crop':'wheat','year':2010,
                                               'crosswalk_exactness':'exact'}],
                'effective_resolution':[{'country_iso3':'AAA','year':2010,'crop':'wheat',
                                         'effective_resolution_km':30}]}
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)
            self.assertEqual(load_crop_sources(p),({},{}))
            (p/'crop_allocation_report.json').write_text(json.dumps(report))
            for key in CROP_DEFINITIONS:
                (p/(key+'.json')).write_text(json.dumps({'AAA':{'2010':1}} if key=='mirca_os' else {}))
            definitions, metadata=load_crop_sources(p)
            self.assertEqual(list(definitions),['mirca_os'])
            self.assertEqual(metadata['mirca_os']['effective_resolution_km']['AAA']['2010']['wheat'],30)
            (p/'mirca_os.json').write_text(json.dumps({'AAA':{'2010':999}}))
            with self.assertRaisesRegex(ValueError,'do not match'):
                load_crop_sources(p)

    def test_extra_spam_vintages_need_crop_membership_provenance(self):
        r=dict(product='mapspam',country_iso3='AAA',year='2000',crop='wheat',admin_unit_id='1',
               admin_level='1',
               source_ref='census:table4',admin_level_ref='supplement:tableS1',status='reported')
        with self.assertRaises(DataError):evidence_counts([r])
        self.assertEqual(evidence_counts([{**r,'crop_membership_ref':'provider:documented wheat class'}]),
                         {'mapspam':{'AAA':{'2000':1}}})

    def test_latitude_clipped_grid_fails_immediately(self):
        with self.assertRaisesRegex(DataError,'4320 x 2160'):
            validate_grid(SimpleNamespace(width=4320,height=1800,name='clipped'))

    def test_grid_identity_includes_transform(self):
        a=SimpleNamespace(shape=(2,2),transform=(1,0,0),crs='laea')
        b=SimpleNamespace(shape=(2,2),transform=(1,0,1),crs='laea')
        with self.assertRaises(DataError):assert_same_grid([a,b])

    def test_warm_cache_is_network_free_and_corruption_never_redownloads(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'file';p.write_bytes(b'original')
            cache=Cache(d,offline=True)
            cache.file('file','https://example.org/source','v1','2000')
            with patch.dict('sys.modules',{'requests':None}):
                self.assertEqual(Cache(d).file('file','https://example.org/source','v1','2000'),p)
                p.write_bytes(b'changed')
                with self.assertRaisesRegex(DataError,'corrupt'):
                    Cache(d).file('file','https://example.org/source','v1','2000')

    def test_interrupted_download_resumes_only_with_matching_etag(self):
        def response(status, headers, chunks):
            r = MagicMock(status_code=status, headers=headers)
            r.__enter__.return_value = r
            r.iter_content.return_value = chunks
            return r
        def broken_stream():
            yield b'abc'
            raise OSError('interrupted')
        first = response(200, {'ETag': 'v1', 'Content-Length': '6'}, broken_stream())
        second = response(206, {'ETag': 'v1', 'Content-Length': '3', 'Content-Range': 'bytes 3-5/6'}, [b'def'])
        with tempfile.TemporaryDirectory() as directory, patch('requests.get', side_effect=[first, second]) as get:
            with self.assertRaisesRegex(OSError, 'interrupted'):
                Cache(directory).file('file', 'https://example.org/data', 'v1', '2000')
            result = Cache(directory).file('file', 'https://example.org/data', 'v1', '2000')
            self.assertEqual(result.read_bytes(), b'abcdef')
            self.assertEqual(get.call_args.kwargs['headers']['Range'], 'bytes=3-')
            self.assertEqual(get.call_args.kwargs['headers']['If-Range'], 'v1')
        with tempfile.TemporaryDirectory() as directory:
            p = Path(directory)
            (p / 'file.part').write_bytes(b'abc')
            (p / 'file.part.json').write_text(json.dumps({'url': 'https://example.org/data', 'etag': 'v1'}))
            changed = response(206, {'ETag': 'v2', 'Content-Range': 'bytes 3-5/6'}, [b'xyz'])
            with patch('requests.get', return_value=changed), self.assertRaisesRegex(DataError, 'Server changed'):
                Cache(p).file('file', 'https://example.org/data', 'v1', '2000')
            self.assertEqual((p / 'file.part').read_bytes(), b'abc')


if __name__ == '__main__':
    unittest.main()
