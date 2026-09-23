#!/usr/bin/env python3
"""Fetch harvested-area rasters and measure map-country allocation dispersion.

Source files live in an immutable, checksummed raw cache. Country curves use the exact
country polygons displayed by both apps. Reporting-unit counts
require observed census evidence; neither pixels, calendar rows, nor provenance
scores establish reporting counts. See the harvested-area section in processing/README.md.
"""
from __future__ import annotations

import argparse
import csv
from datetime import datetime, timezone
import gzip
import hashlib
import io
import itertools
import json
import math
from pathlib import Path
import re
import shutil
import subprocess
import sys
import zipfile
import unicodedata
from collections import Counter, defaultdict

HERE = Path(__file__).resolve().parent
RAW = HERE / 'data/raw/crop-allocation'
MIRCA_RAW = HERE / 'data/raw/mirca-os'
GAEZ2015_RAW = HERE / 'data/raw/gaez2015'
MAP_BOUNDARIES = HERE / 'data/world.raw.geojson'
METHOD = 'map-country-allocation-shares-v3'
STRICT_METHOD = 'map-country-harvested-area-cv-v2'
UNIT = 'reporting admin units'
# The full fetch pipeline can defer missing prerequisites without swallowing data errors.
MISSING_EVIDENCE_EXIT = 3
DEFAULT_YEARS = (2000, 2010, 2015)
EXTRA_SPAM_YEARS = (2000, 2005, 2015, 2020)
YEARS = {2005: (), 2020: (), 2000: ('gaez', 'mirca2000', 'mirca_os'),
         2010: ('mapspam', 'gaez', 'mirca_os'), 2015: ('gaez', 'mirca_os')}
# Canonical crop, SPAM2010 code, MIRCA2000 class, MIRCA-OS label, FAO label.
CROPS = {
    'wheat': ('WHEA', 1, 'Wheat', 'Wheat'),
    'rice': ('RICE', 3, 'Rice', 'Wetland rice'),
    'maize': ('MAIZ', 2, 'Maize', 'Maize'),
    'barley': ('BARL', 4, 'Barley', 'Barley'),
    'sorghum': ('SORG', 7, 'Sorghum', 'Sorghum'),
    'potato': ('POTA', 10, 'Potatoes', None),
    'cassava': ('CASS', 11, 'Cassava', 'Cassava'),
    'soybean': ('SOYB', 8, 'Soybeans', 'Soybean'),
    'groundnut': ('GROU', 16, 'Groundnuts', 'Groundnut'),
    'oil_palm': ('OILP', 14, 'Oil palm', 'Oil palm'),
    'sunflower': ('SUNF', 9, 'Sunflower', 'Sunflower'),
    'rapeseed': ('RAPE', 15, 'Rapeseed', 'Rapeseed'),
    'sugarcane': ('SUGC', 12, 'Sugar cane', 'Sugarcane'),
    'sugarbeet': ('SUGB', 13, 'Sugar beet', 'Sugarbeet'),
    'cotton': ('COTT', 21, 'Cotton', 'Cotton'),
}
FAO_CATALOG = ('https://gaez-services.fao.org/server/rest/services/res06/ImageServer/query'
               '?where=1%3D1&outFields=*&returnGeometry=false&f=json')
MIRCA_CATALOG = 'https://www.hydroshare.org/hsapi/resource/e4582ca0042148338bb5e0148b749ed6/files/'
SPAM_URL = 'https://s3.amazonaws.com/mapspam-data/2010/v2.0/geotiff/spam2010v2r0_global_harv_area.geotiff.zip'
M2000_URL = 'https://zenodo.org/records/7422506/files/harvested_area_grids.zip?download=1'
GAEZ2015_CATALOG = 'https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/KAGRFI'
# GAEZ+_2015 metadata.pdf, Table 1 (p. 5), and technical details (p. 4).
# These are provider labels, not a spelling transformation of GAEZ v4 labels.
GAEZ2015_CROPS = {
    'wheat': 'Wheat', 'rice': 'Rice', 'maize': 'Maize', 'barley': 'Barley',
    'sorghum': 'Sorghum', 'cassava': 'Cassava', 'soybean': 'Soybean',
    'groundnut': 'Groundnut', 'oil_palm': 'Oilpalmfruit', 'sunflower': 'Sunflower',
    'rapeseed': 'Rapeseed', 'sugarcane': 'Sugarcane', 'sugarbeet': 'Sugarbeet', 'cotton': 'Cotton',
}
GAEZ2015_DOI = 'https://doi.org/10.7910/DVN/KAGRFI'
DISPERSION_FIELDS = ('country_iso3 admin_unit_id admin_level crop year products n_products '
                     'scale_km scale_km_normalised mean_cv n_blocks crosswalk_exactness').split()
RESOLUTION_FIELDS = ('country_iso3 crop year admin_level tolerance effective_resolution_km '
                     'dispersion_at_native_cell allocation_similarity source_availability '
                     'n_products crosswalk_exactness n_admin_units').split()
AVAILABILITY_FIELDS = ('country_iso3 crop year products n_products expected_products '
                       'source_availability status census_evidence_available').split()


class DataError(ValueError):
    """An input contract failed; never substitute inferred data."""


def require(condition, message):
    # Explicit exceptions remain active when Python runs with -O.
    if not condition:
        raise DataError(message)


def digest(path, algorithm='sha256'):
    h = hashlib.new(algorithm)
    with Path(path).open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    tmp.replace(path)


def write_csv(path, rows, fields):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix('.tmp')
    with tmp.open('w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    tmp.replace(path)


class Cache:
    """No HEAD/GET requests for verified cached files; interrupted GETs resume."""
    def __init__(self, root, offline=False):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        self.index_path = self.root / 'cache.json'
        self.index = json.loads(self.index_path.read_text()) if self.index_path.exists() else {}
        self.offline = offline
        self.checked = set()

    def file(self, name, url, version, vintage, checksum=None, local=None):
        require(Path(name).name == name, 'Cache filenames must be basenames')
        path = Path(local).resolve() if local else self.root / name
        entry = self.index.get(name)
        if entry:
            require((entry['url'], entry['version'], entry['vintage'], entry['path']) ==
                    (url, version, vintage, str(path.resolve())), f'Cache identity changed: {name}')
            if name not in self.checked:
                require(path.is_file() and digest(path) == entry['sha256'],
                        f'Cache missing/corrupt: {path}; inspect it explicitly before replacing')
                self.checked.add(name)
            return path
        if not path.exists():
            require(not local, f'Local source missing: {path}')
            require(not self.offline, f'Offline cache miss: {name}')
            import requests
            partial = path.with_suffix(path.suffix + '.part')
            resume_meta = partial.with_suffix(partial.suffix + '.json')
            previous = json.loads(resume_meta.read_text()) if resume_meta.exists() else {}
            offset = partial.stat().st_size if partial.exists() else 0
            if offset:
                require(previous.get('url') == url and previous.get('etag'),
                        f'Cannot safely resume unversioned partial: {partial}')
            headers = {'Accept-Encoding': 'identity'}
            if offset:
                headers.update({'Range': f'bytes={offset}-', 'If-Range': previous['etag']})
            print(f'Downloading {name} (resume offset {offset:,})', flush=True)
            with requests.get(url, headers=headers, stream=True, timeout=(20, 60)) as response:
                response.raise_for_status()
                if offset:
                    require(response.status_code == 206 and
                            response.headers.get('Content-Range', '').startswith(f'bytes {offset}-') and
                            response.headers.get('ETag') == previous['etag'],
                            f'Server changed file or cannot resume {name}; partial retained')
                else:
                    require(response.status_code == 200, f'Unexpected download status for {name}')
                write_json(resume_meta, {'url': url, 'etag': response.headers.get('ETag')})
                with partial.open('ab' if offset else 'wb') as f:
                    for chunk in response.iter_content(1024 * 1024):
                        f.write(chunk)
                if response.headers.get('Content-Length'):
                    require(partial.stat().st_size == offset + int(response.headers['Content-Length']),
                            f'Truncated download: {name}')
            if checksum:
                algorithm, expected = checksum.split(':', 1)
                require(digest(partial, algorithm) == expected, f'Provider checksum mismatch: {name}')
            partial.replace(path)
            resume_meta.unlink(missing_ok=True)
        if checksum:
            algorithm, expected = checksum.split(':', 1)
            require(digest(path, algorithm) == expected, f'Provider checksum mismatch: {name}')
        self.index[name] = {'url': url, 'version': version, 'vintage': vintage,
                            'path': str(path.resolve()), 'accessDate': datetime.now(timezone.utc).isoformat(),
                            'sha256': digest(path), 'bytes': path.stat().st_size,
                            'providerChecksum': checksum, 'origin': 'local' if local else 'download'}
        write_json(self.index_path, self.index)
        self.checked.add(name)
        return path


def validate_grid(grid):
    require((grid.width, grid.height) == (4320, 2160),
            f'Expected full global 4320 x 2160, got {grid.width} x {grid.height}: {grid.name}')
    require(grid.count == 1, f'Expected single harvested-area band: {grid.name}')
    # ESRI ASCII uses an implicit geographic CRS; its adapter must supply it explicitly.
    require(grid.crs and (grid.crs.to_epsg() == 4326 or grid.crs.to_string() == 'OGC:CRS84'), f'Expected WGS84: {grid.name}')
    t = grid.transform
    require(t.b == t.d == 0 and abs(t.a - 1/12) < 1e-6 and abs(t.e + 1/12) < 1e-6,
            f'Not a north-up five-arcminute grid: {grid.name}')
    require(max(abs(a-b) for a,b in zip(grid.bounds, (-180, -90, 180, 90))) < .002,
            f'Global grid extent shifted or clipped: {grid.name}')


def assert_same_grid(grids):
    first = grids[0]
    require(all(g.shape == first.shape and g.transform == first.transform and g.crs == first.crs
                for g in grids[1:]), 'Harmonised shape/transform/CRS differ')


def crop_allowed(crop, products, cocoa=False):
    require(crop in CROPS or (cocoa and crop == 'cocoa'), f'Excluded crop: {crop}')
    if crop == 'cocoa':
        require(set(products) <= {'mapspam', 'mirca2000'}, 'Cocoa requires dedicated-layer product pair')
    if crop == 'potato':
        require('gaez' not in products, 'GAEZ potato includes sweet potato; potato-only comparison excluded')


def dispersion_curve(values, cell_km, admin_area_km2, metadata, *, totals_rtol=.10,
                     zero_rtol=1e-6, zero_atol_ha=.01, growth=2):
    """Area arrays [product,row,column], already restricted to ONE unit.

    Widths double, with a final single block covering the unit raster extent.
    Partial edge blocks retain their sums. Zero-mean blocks are omitted.
    """
    import numpy as np
    a = np.asarray(values, dtype=np.float64)
    require(a.ndim == 3 and a.shape[0] >= 2 and min(a.shape[1:]) > 0, 'Need >=2 nonempty product grids')
    require(np.isfinite(a).all() and (a >= 0).all(), 'Missing or negative harvested-area input')
    require(cell_km > 0 and admin_area_km2 > 0 and growth > 1, 'Invalid spatial scale')
    crop_allowed(metadata['crop'], metadata['products'].split('|'), metadata['crop'] == 'cocoa')
    totals = a.sum(axis=(1, 2))
    require(totals.mean() > 0, 'No harvested area in this analysis region')
    total_details = ', '.join(f'{product}={total:.8g} ha'
                              for product, total in zip(metadata['products'].split('|'), totals))
    require((totals.max()-totals.min()) <= totals_rtol * totals.mean(),
            f'Different statistical base: totals ({total_details})')
    # A permissive totals screening tolerance must not weaken the conservation assertion.
    for i,j in itertools.combinations(range(len(totals)), 2):
        residual = float((a[i] - a[j]).sum())
        require(abs(residual) <= zero_atol_ha + zero_rtol * max(totals[i], totals[j]),
                f'Different statistical base: pairwise residual {residual:.8g} ha ({total_details})')
    extent = max(a.shape[1:])
    widths = {1, extent}
    w = 1
    while w < extent:
        w = min(extent, max(w+1, math.ceil(w*growth)))
        widths.add(w)
    rows = []
    for w in sorted(widths):
        sums = np.add.reduceat(np.add.reduceat(a, np.arange(0, a.shape[1], w), axis=1),
                               np.arange(0, a.shape[2], w), axis=2).reshape(a.shape[0], -1)
        means = sums.mean(axis=0)
        keep = means > 0
        cv = sums[:, keep].std(axis=0, ddof=1) / means[keep]
        rows.append({**metadata, 'n_products': a.shape[0], 'scale_km': w*cell_km,
                     'scale_km_normalised': w*cell_km/math.sqrt(admin_area_km2),
                     'mean_cv': float(cv.mean()), 'n_blocks': int(keep.sum())})
    require(rows[-1]['mean_cv'] <= zero_rtol + zero_atol_ha/totals.mean(),
            'Dispersion did not vanish at whole-region scale')
    return rows


def read_table(path, columns):
    require(Path(path).is_file(), f'Missing verified evidence table: {path}')
    with Path(path).open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        require(set(columns) <= set(reader.fieldnames or []), f'Missing columns in {path}: {columns}')
        return list(reader)


def evidence_counts(rows):
    """Deduplicate units across crops and irrigation modes, never count scores."""
    result, audit = {}, {}
    for row in rows:
        require(row['status'] == 'reported', 'Evidence rows must be direct reported observations')
        require(row['source_ref'] and row['admin_level_ref'], 'Evidence needs census and admin-table citations')
        require(re.fullmatch(r'\d+', str(row.get('admin_level', ''))), 'Evidence needs an explicit nonnegative admin level')
        product, iso, year, crop = row['product'], row['country_iso3'], int(row['year']), row['crop']
        require(year in YEARS and (product in YEARS[year] or
                (product == 'mapspam' and year in EXTRA_SPAM_YEARS and row.get('crop_membership_ref'))),
                'Evidence product/year outside selected scope or unconfirmed crop membership')
        crop_allowed(crop, [product], crop == 'cocoa')
        require(re.fullmatch('[A-Z]{3}', iso) and row['admin_unit_id'], 'Invalid reporting identity')
        key = (product, iso, str(year))
        audit.setdefault(key, set()).add(row['admin_unit_id'])
    for (product, iso, year), ids in audit.items():
        result.setdefault(product, {}).setdefault(iso, {})[year] = len(ids)
    return result


def extract_member(archive, member, cache):
    """Extract only an explicitly named member; never trust archive paths."""
    require(not Path(member).is_absolute() and '..' not in Path(member).parts, 'Unsafe archive member')
    folder = cache.root / 'extracted' / hashlib.sha256(str(archive).encode()).hexdigest()[:16]
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / Path(member).name
    check = target.with_suffix(target.suffix + '.sha256')
    if target.exists() and check.exists():
        require(digest(target) == check.read_text().strip(), f'Corrupt extraction: {target}')
        return target
    tmp = target.with_suffix(target.suffix + '.part')
    if archive.suffix.lower() == '.zip':
        with zipfile.ZipFile(archive) as z, z.open(member) as src, tmp.open('wb') as out:
            shutil.copyfileobj(src, out)
    elif archive.suffix.lower() == '.rar':
        with tmp.open('wb') as out:
            subprocess.run(['bsdtar', '-xOf', str(archive), member], stdout=out, check=True)
    else:
        raise DataError(f'Unsupported archive: {archive}')
    tmp.replace(target)
    check.write_text(digest(target))
    return target


def native_path(entry, cache):
    path = cache.file(entry['name'], entry['url'], entry['version'], entry['vintage'],
                      entry.get('checksum'), entry.get('local'))
    if entry.get('member'):
        path = extract_member(path, entry['member'], cache)
    if path.suffix.lower() == '.gz':
        target = path.with_suffix('')
        checksum_path = target.with_suffix(target.suffix + '.sha256')
        if target.exists():
            require(checksum_path.exists() and digest(target) == checksum_path.read_text().strip(),
                    f'Unverified decompressed source: {target}')
        else:
            with gzip.open(path, 'rb') as src, target.with_suffix('.part').open('wb') as out:
                shutil.copyfileobj(src, out)
            target.with_suffix('.part').replace(target)
            checksum_path.write_text(digest(target))
        path = target
    if path.suffix.lower() == '.asc':
        # MIRCA2000 documentation explicitly specifies WGS84; ASCII has no CRS field.
        require(entry['product'] == 'mirca2000', 'Undocumented ASCII CRS')
        path.with_suffix('.prj').write_text('GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]')
    return path


def local_gaez2015_layers(cache, folder, crops):
    """Adopt manual Dataverse downloads with explicit, documented crop labels.

    Leave source archives intact. A supplied archive is checksummed like other
    raw sources; each extracted raster also receives its own SHA-256 sidecar.
    Total files and crops outside the dedicated-layer concordance never enter.
    """
    folder = Path(folder)
    wanted = {f'GAEZAct2015_HarvArea_{GAEZ2015_CROPS[c]}_{mode}.tif': (c, system)
              for c in crops if c in GAEZ2015_CROPS
              for mode, system in [('Irrigated', 'irrigated'), ('Rainfed', 'rainfed')]}
    if not folder.is_dir() or not wanted:
        return []
    found = {}
    for source in sorted(folder.rglob('*')):
        if not source.is_file():
            continue
        if source.suffix.lower() == '.zip':
            with zipfile.ZipFile(source) as archive:
                members = [i.filename for i in archive.infolist() if not i.is_dir()]
            matches = [(Path(m).name, m) for m in members if Path(m).name in wanted]
        else:
            matches = [(source.name, None)] if source.name in wanted else []
        if not matches:
            continue
        name = 'gaez2015-local-' + hashlib.sha256(str(source.resolve()).encode()).hexdigest()[:16] + source.suffix.lower()
        common = dict(name=name, url=GAEZ2015_DOI, local=str(source.resolve()),
                      version='GAEZ+2015', vintage='2015', product='gaez', year=2015,
                      measure='harvested_area', unit='1000 ha', produced='May 2020',
                      metadata_ref='GAEZ+_2015 metadata.pdf pp. 4–5; https://doi.org/10.1038/s41597-021-01115-2')
        cache.file(name, GAEZ2015_DOI, 'GAEZ+2015', '2015', local=source)
        for basename, member in matches:
            require(basename not in found, f'Ambiguous duplicate local GAEZ+2015 layer: {basename}')
            crop, system = wanted[basename]
            found[basename] = {**common, 'crop': crop, 'system': system,
                               'source_crop': GAEZ2015_CROPS[crop],
                               'crosswalk_exactness': 'approximate' if crop in ('maize', 'sorghum') else 'exact'}
            if member:
                found[basename]['member'] = member
    if found:
        require(set(found) == set(wanted), 'Incomplete local GAEZ+2015 download; missing: ' +
                ', '.join(sorted(set(wanted)-set(found))))
    return list(found.values())


def import_local_gaez2015(manifest, cache, folder, years, crops):
    """Fill missing 2015 crop pairs, retaining every already pinned layer."""
    if 2015 not in years:
        return manifest
    existing = [e for e in manifest['layers'] if e['product'] == 'gaez' and e['year'] == 2015]
    missing = [c for c in crops if c in GAEZ2015_CROPS and not any(e['crop'] == c for e in existing)]
    layers = local_gaez2015_layers(cache, folder, missing)
    if not layers:
        return manifest
    added = {e['crop'] for e in layers}
    remaining = []
    for failure in manifest.get('unavailable', []):
        if failure.get('product') != 'gaez' or failure.get('year') != 2015:
            remaining.append(failure)
        elif failure.get('crop'):
            if failure['crop'] not in added:
                remaining.append(failure)
        else:
            # A general API failure must not mask still-missing, unimported crops.
            for crop in manifest.get('requestedCrops', crops):
                if crop in GAEZ2015_CROPS and crop not in added and not any(e['crop'] == crop for e in existing):
                    remaining.append({**failure, 'crop': crop})
    return {**manifest, 'layers': [*manifest['layers'], *layers], 'unavailable': remaining,
            'localImports': [*manifest.get('localImports', []),
                             {'source': GAEZ2015_DOI, 'crops': sorted(added),
                              'accessDate': datetime.now(timezone.utc).isoformat()}]}


def source_manifest(cache, years, crops, mirca_raw, gaez2015_raw=GAEZ2015_RAW):
    """Discover file identities from provider catalogs; frozen in the raw cache."""
    path = cache.root / 'sources.json'
    if path.exists():
        original = json.loads(path.read_text())
        manifest = import_local_gaez2015(original, cache, gaez2015_raw, years, crops)
        if manifest != original:
            write_json(path.with_name('sources-before-local-' + digest(path)[:16] + '.json'), original)
            write_json(path, manifest)
        return manifest
    fao = cache.file('gaez-theme5-catalog.json', FAO_CATALOG, 'GAEZ v4 Theme 5', '2000,2010')
    rows = [f['attributes'] for f in json.loads(fao.read_text())['features']]
    hydro = cache.file('mirca-os-v2-files.json', MIRCA_CATALOG, 'MIRCA-OS v2', '2000,2010,2015')
    files = json.loads(hydro.read_text())
    require(not files.get('next'), 'Paginated MIRCA-OS catalog must be ingested completely')
    mirca_archive = next(x for x in files['results'] if x['file_name'] == 'Annual Harvested Area Grids.rar')
    output = {'schemaVersion': 1, 'layers': [], 'excluded': [], 'unavailable': [],
              'references': {'mirca2000': 'https://zenodo.org/records/7422506',
                             'mapspam': 'https://doi.org/10.7910/DVN/PRFF8V',
                             'gaez': 'https://www.fao.org/gaez/gaezv4/en',
                             'mirca_os': 'https://doi.org/10.1038/s41597-024-04313-w'}}
    # Catalog records, never guessed download URLs, supply the 2015 layers.
    gaez2015 = []
    local2015 = local_gaez2015_layers(cache, gaez2015_raw, crops) if 2015 in years else []
    if 2015 in years and not local2015:
        try:
            catalog = cache.file('gaez2015-catalog.json', GAEZ2015_CATALOG, 'GAEZ+2015', '2015')
            gaez2015 = json.loads(catalog.read_text())['data']['latestVersion']['files']
        except Exception as exc:
            output['unavailable'].append({'product': 'gaez', 'year': 2015, 'reason': str(exc)})
    for year in years:
        for crop in crops:
            spam_code, mirca_class, os_label, fao_label = CROPS.get(crop, ('COCO',22,'Cocoa',None))
            for product in YEARS[year]:
                if crop == 'cocoa' and product not in ('mapspam','mirca2000'):
                    continue
                if product == 'gaez' and fao_label is None:
                    output['excluded'].append({'product': product, 'crop': crop, 'year': year,
                                              'reason': 'Potato-only requested; GAEZ layer also contains sweet potato'})
                    continue
                common = {'product': product, 'crop': crop, 'year': year, 'vintage': str(year),
                          'measure': 'harvested_area', 'crosswalk_exactness': 'exact'}
                # Differences in maize/sorghum category membership must remain visible.
                if crop in ('maize', 'sorghum'):
                    common['crosswalk_exactness'] = 'approximate'
                if product == 'mapspam':
                    for tech, system in [('I', 'irrigated'), ('H', 'rainfed'), ('L', 'rainfed'), ('S', 'rainfed')]:
                        output['layers'].append({**common, 'name': 'spam2010-harvested.zip',
                            'url': SPAM_URL, 'version': 'SPAM2010 v2r0', 'unit': 'ha', 'system': system,
                            'member': f'spam2010V2r0_global_H_{spam_code}_{tech}.tif'})
                elif product == 'mirca2000':
                    for code, system in [('IRC', 'irrigated'), ('RFC', 'rainfed')]:
                        output['layers'].append({**common, 'name': 'mirca2000-harvested.zip',
                            'url': M2000_URL, 'version': 'MIRCA2000 v1.1', 'unit': 'ha', 'system': system,
                            'checksum': 'md5:73d703a508170d9a8bea79ca0ea08ce1',
                            'member': f'harvested_area_grids/ANNUAL_AREA_HARVESTED_{code}_CROP{mirca_class}_HA.ASC.gz'})
                elif product == 'mirca_os':
                    for code, system in [('ir', 'irrigated'), ('rf', 'rainfed')]:
                        output['layers'].append({**common, 'name': 'mirca-os-annual-v2.rar',
                            'local': str((mirca_raw / mirca_archive['file_name']).resolve()),
                            'url': mirca_archive['url'].replace('http:', 'https:'), 'version': 'MIRCA-OS v2', 'vintage': '2000,2005,2010,2015,2020',
                            'checksum': 'md5:' + mirca_archive['checksum'], 'unit': 'ha', 'system': system,
                            'member': f'{str(year)[-2:]}/5-arcminute/MIRCA-OS_{os_label}_{year}_{code}_v2.tif'})
                elif year != 2015:
                    for mode, system in [('Irrigated', 'irrigated'), ('Rainfed', 'rainfed')]:
                        found = [x for x in rows if x['crop'] == fao_label and x['year'] == str(year)
                                 and x['variable'] == 'Harvested area' and x['water_supply'] == mode]
                        require(len(found) == 1 and found[0]['units'] == '1000 ha', f'Unknown FAO layer: {crop}/{year}/{mode}')
                        x = found[0]
                        output['layers'].append({**common, 'name': f'gaez-{year}-{crop}-{system}.tif',
                            'url': x['download_url'].strip(), 'version': 'GAEZ v4 Theme 5',
                            'unit': '1000 ha', 'system': system, 'source_crop': fao_label})
                elif gaez2015:
                    # Only catalog-described harvested-area files, no physical/production/yield substitutions.
                    for mode, system in [('Irrigated', 'irrigated'), ('Rainfed', 'rainfed')]:
                        matches = [f['dataFile'] for f in gaez2015 if
                                   re.search(r'Harv(?:est)?Area', f['dataFile']['filename'], re.I)
                                   and f'_{GAEZ2015_CROPS[crop]}_{mode}.tif'.lower()
                                   in f['dataFile']['filename'].lower()]
                        if len(matches) != 1:
                            output['unavailable'].append({'product': product, 'crop': crop, 'year': year,
                                                        'reason': f'No unambiguous harvested-area catalog entry: {mode}'})
                            continue
                        x = matches[0]
                        output['layers'].append({**common, 'name': f'gaez-2015-{crop}-{system}.tif',
                            'url': f'https://dataverse.harvard.edu/api/access/datafile/{x["id"]}',
                            'version': 'GAEZ+2015', 'unit': '1000 ha', 'system': system,
                            'checksum': x['checksum']['type'].lower()+':'+x['checksum']['value']})
    output['requestedYears'] = list(years)
    output['requestedCrops'] = list(crops)
    output['layers'].extend(local2015)
    write_json(path, output)
    return output


def supplementary_rows(tables):
    """Preserve table provenance without guessing blank or split country cells.

    None means a vertically merged cell within a page. An empty string is a
    distinct cell, which can contain an as-yet-unprinted country name across a
    page break. Neither may be filled from a different page automatically.
    """
    rows = []
    for page, table in tables:
        country = None
        for index, row in enumerate(table, 1):
            if len(row) != 6 or row[0] == 'Country':
                continue
            if row[0] is not None:
                country = ' '.join(row[0].split()) or None
            fields = [' '.join((s or '').split()) for s in row]
            if not any(fields[1:]):
                continue
            rows.append(dict(country=country, report=fields[1], coverage_period=fields[2],
                             admin_level_raw=fields[3], data_source=fields[4], source_links=fields[5],
                             pdf_page=page, table_row=index,
                             country_assignment='explicit_page_cell' if country else 'unresolved_page_break'))
    return rows


def validate_zip_headers(path):
    """Reject missing/truncated members even when the central directory is readable.

    Does not claim to verify decompressed CRCs; those are checked when members are read.
    """
    try:
        with zipfile.ZipFile(path) as archive:
            for member in archive.infolist():
                with archive.open(member):
                    pass
    except (zipfile.BadZipFile, EOFError, OSError) as exc:
        raise DataError(f'Unreadable archive {Path(path).name}: {exc}') from exc


def audit_mirca_inputs(cache, mirca_raw, output, *, strict=True):
    """Ingest the released admin-level table and inventory original archives.

    This audit deliberately does not turn a source listing, quality indicator,
    or a calendar table into a reporting observation.
    """
    import pdfplumber
    catalog = cache.file('mirca-os-v2-files.json', MIRCA_CATALOG, 'MIRCA-OS v2', '2000,2010,2015')
    files = json.loads(catalog.read_text())['results']
    item = next(f for f in files if f['file_name'] == 'MIRCA-OS_Supplematray_information_v2.pdf')
    # HydroShare can return a multipart storage ETag, which is not a file MD5.
    checksum = item.get('checksum', '')
    checksum = 'md5:' + checksum if re.fullmatch('[0-9a-f]{32}', checksum) else None
    local = mirca_raw / item['file_name']
    pdf = cache.file(item['file_name'], item['url'].replace('http:', 'https:'),
                     'MIRCA-OS v2', '2000,2005,2010,2015,2020', checksum,
                     local if local.is_file() else None)
    tables, notes = [], []
    with pdfplumber.open(pdf) as document:
        in_notes = False
        for number, page in enumerate(document.pages, 1):
            content = page.extract_text() or ''
            if content.lstrip().startswith('Supplementary Note 1:'):
                in_notes = True
            if in_notes:
                notes.append({'pdf_page': number, 'text': content})
            else:
                tables.extend((number, t) for t in page.extract_tables() if t and len(t[0]) == 6)
    rows = supplementary_rows(tables)
    require(rows, 'No administrative-level supplementary table extracted')
    for row in rows:
        row['admin_level_ref'] = f"{item['url'].replace('http:', 'https:')}#page={row['pdf_page']}"
    write_json(output / 'mirca_admin_source_table.json', {'source_sha256': digest(pdf), 'rows': rows})
    write_json(output / 'mirca_country_notes.json', {'source_sha256': digest(pdf), 'pages': notes})
    inventory, archive_errors = [], []
    for archive in sorted(mirca_raw.iterdir()):
        if archive.suffix.lower() not in ('.zip', '.rar'):
            continue
        checksum = digest(archive)
        listing = cache.root / f'archive-members-{checksum}.json'
        if listing.exists():
            members = json.loads(listing.read_text())
        else:
            if archive.suffix.lower() == '.zip':
                with zipfile.ZipFile(archive) as z:
                    members = [i.filename for i in z.infolist() if not i.is_dir()]
            else:
                members = subprocess.check_output(['bsdtar', '-tf', str(archive)], text=True).splitlines()
                members = [m for m in members if not m.endswith('/')]
            write_json(listing, members)
        integrity = 'not_checked'
        if archive.suffix.lower() == '.zip':
            try:
                validate_zip_headers(archive)
                integrity = 'member_headers_verified'
            except DataError as exc:
                integrity = 'failed'
                archive_errors.append(str(exc))
        inventory.append({'local_path': str(archive.resolve()), 'sha256': checksum,
                          'members': members, 'integrity': integrity})
    write_json(output / 'mirca_raw_inventory.json', inventory)
    report = {'sourceTableRows': len(rows), 'unresolvedCountryRows': sum(r['country'] is None for r in rows),
              'localArchives': len(inventory), 'reportingCountsInferred': False,
              'archiveErrors': archive_errors,
              'remaining': ['Verify crop/year-specific source notes and census levels, then link evidence to map countries',
                            'Identify actual reported observations in original census files',
                            'Document each product statistical base before sharing observation counts']}
    write_json(output / 'evidence_audit.json', report)
    if strict:
        require(not archive_errors, '\n'.join(archive_errors))
    return report


# Explicit provider item labels: no fuzzy crop matching or parent-total splitting.
FAOSTAT_CROPS = {
    'wheat': ('Wheat',), 'rice': ('Rice', 'Rice, paddy'),
    'maize': ('Maize', 'Maize (corn)'), 'barley': ('Barley',), 'sorghum': ('Sorghum',),
    'potato': ('Potatoes',), 'cassava': ('Cassava', 'Cassava, fresh'),
    'soybean': ('Soybeans', 'Soya beans'),
    'groundnut': ('Groundnuts, with shell', 'Groundnuts, excluding shelled'),
    'oil_palm': ('Oil palm fruit',), 'sunflower': ('Sunflower seed',),
    'rapeseed': ('Rapeseed', 'Rape or colza seed'), 'sugarcane': ('Sugar cane',),
    'sugarbeet': ('Sugar beet',), 'cotton': ('Seed cotton', 'Seed cotton, unginned'),
}
EVIDENCE_FIELDS = ('product country_iso3 admin_unit_id admin_level crop year status source_ref '
                   'admin_level_ref area_ha source_flag crosswalk_exactness boundary_ref source_admin_name').split()
SIAP_CROPS = {
    'Wheat Grain': 'wheat', 'Seed of Wheat Grain': 'wheat', 'Rice': 'rice',
    'Maize Grain': 'maize', 'Seed of Maize Grain': 'maize', 'Popcorn': 'maize',
    'Barley Grain': 'barley', 'Seed of Barley Grain': 'barley',
    'Sorghum': 'sorghum', 'Seed of Sorghum': 'sorghum',
    'Potato': 'potato', 'Seed of Potato': 'potato', 'Cassava': 'cassava',
    'Soybean': 'soybean', 'Seed of Soybean': 'soybean', 'Groundnut/Peanut': 'groundnut',
    'Oil Palm': 'oil_palm', 'Sunflower': 'sunflower', 'Rapeseed': 'rapeseed',
    'Sugarcane': 'sugarcane', 'Seed of Sugarcane': 'sugarcane', 'Cotton': 'cotton',
}


def name_key(value):
    text = unicodedata.normalize('NFKD', str(value or '').replace('’', "'"))
    return ' '.join(''.join(c for c in text if not unicodedata.combining(c)).casefold().split()).rstrip(':')


def country_names():
    """ISO names and explicit source spelling aliases; never fuzzy geography joins."""
    import pycountry
    names = {}
    for country in pycountry.countries:
        for field in ('name', 'official_name', 'common_name', 'alpha_3', 'alpha_2'):
            value = getattr(country, field, None)
            if value:
                names[name_key(value)] = country.alpha_3
    aliases = {
        'Brunei': 'BRN', 'Cameron': 'CMR', 'Cape Verde': 'CPV', 'Swaziland': 'SWZ',
        'Syria': 'SYR', 'Iran': 'IRN', 'Vietnam': 'VNM', 'Russia': 'RUS', 'Laos': 'LAO',
        'Democratic Republic of the Congo': 'COD', 'DR Congo': 'COD',
        "Democratic People's Republic of Korea": 'PRK', 'Republic of Korea': 'KOR',
        'United Republic of Tanzania': 'TZA', 'Tanzania': 'TZA', 'Bolivia': 'BOL',
        'Venezuela': 'VEN', 'China, mainland': 'CHN', 'Taiwan': 'TWN',
        'Republic of Moldova': 'MDA', 'Moldova': 'MDA', 'Türkiye': 'TUR', 'Turkey': 'TUR',
    }
    names.update({name_key(k): v for k, v in aliases.items()})
    return names


def country_notes(pages, names):
    """Keep notes together across PDF pages, using explicit country headings only."""
    result, current = {}, None
    for page in pages:
        for line in page['text'].splitlines():
            key = name_key(line)
            if key in names:
                current = names[key]
                result.setdefault(current, {'text': [], 'pages': set()})
            elif key in ('africa', 'asia', 'europe', 'oceania', 'north america', 'south america'):
                current = None
            elif current and not line.strip().isdigit():
                result[current]['text'].append(line)
                result[current]['pages'].add(page['pdf_page'])
    return {iso: {'text': ' '.join(v['text']), 'pages': sorted(v['pages'])} for iso, v in result.items()}


def period_includes(period, year):
    period = period.replace('–', '-').replace('−', '-').strip()
    if re.fullmatch(r'\d{4}\s*-\s*\d{4}', period):
        low, high = map(int, re.findall(r'\d{4}', period))
        return low <= year <= high
    return str(year) in re.findall(r'\b\d{4}\b', period)


def national_admin_reference(iso, year, sources, notes, names):
    rows = [r for r in sources if names.get(name_key(r.get('country'))) == iso]
    require(rows and all(r['admin_level_raw'] == '0' for r in rows),
            'Country has mixed, unresolved or subnational source levels; crop/year-specific review required')
    candidates = [r for r in rows if r['data_source'] == 'FAOSTAT' and
                  'Harvested Area' in r['report'] and period_includes(r['coverage_period'], year)]
    require(candidates, 'No explicit FAOSTAT harvested-area admin-0 source for this year')
    note = notes.get(iso)
    require(note and 'FAOSTAT' in note['text'], 'Country notes do not confirm the FAOSTAT source')
    require(not re.search(r'province|district|subnational|sub-national|regional|NUTS', note['text'], re.I),
            'Country notes contain subnational exceptions; crop/year-specific review required')
    return ';'.join(sorted({r['admin_level_ref'] for r in candidates} | {
        candidates[0]['admin_level_ref'].split('#')[0] + f'#page={p}' for p in note['pages']}))


def parse_faostat_observations(rows, source_ref, years, crops, sources, notes, names):
    """Only positive or explicit zero official harvested-area reports are observations."""
    import pycountry
    concordance = {label: crop for crop, labels in FAOSTAT_CROPS.items() for label in labels}
    accepted, unresolved, omitted = [], [], Counter()
    for line, row in enumerate(rows, 2):
        crop = concordance.get(row.get('Item'))
        if crop not in crops or row.get('Year') not in {str(y) for y in years}:
            omitted['outside_crop_or_year_scope'] += 1
            continue
        ref = f'{source_ref}#row={line}'
        try:
            require(row.get('Element') == 'Area harvested' and row.get('Element Code') == '5312' and
                    row.get('Unit') == 'ha', 'Not harvested area in hectares')
            flag = (row.get('Flag', '').strip(), row.get('Flag Description', '').strip())
            if flag not in {('A', 'Official figure'), ('', 'Official data')}:
                omitted['not_official_reported_observation'] += 1
                continue
            require(not row.get('Note', '').strip(), 'Observation has a source note requiring review')
            value = float(row['Value'])
            require(math.isfinite(value) and value >= 0, 'Invalid reported harvested area')
            iso = names.get(name_key(row.get('Area')))
            require(iso, 'Unresolved country name')
            if row.get('Area Code (M49)'):
                coded = pycountry.countries.get(numeric=row['Area Code (M49)'].strip().zfill(3))
                require(coded and coded.alpha_3 == iso, 'Country name and M49 code disagree')
            year = int(row['Year'])
            admin_ref = national_admin_reference(iso, year, sources, notes, names)
            accepted.append({'product': 'mirca_os', 'country_iso3': iso, 'admin_unit_id': f'{iso}:0',
                'admin_level': 0, 'crop': crop, 'year': year, 'status': 'reported',
                'source_ref': ref, 'admin_level_ref': admin_ref, 'area_ha': value,
                'source_flag': flag[1], 'crosswalk_exactness': 'exact'})
        except (DataError, ValueError, KeyError) as exc:
            unresolved.append({'source_ref': ref, 'country': row.get('Area'), 'crop': crop,
                               'year': row.get('Year'), 'reason': str(exc)})
    return accepted, unresolved, dict(omitted)


def reconcile_duplicates(rows):
    """Repeated source exports count once; conflicting official values remain unresolved."""
    grouped, accepted, conflicts = defaultdict(list), [], []
    for row in rows:
        grouped[(row['country_iso3'], row['admin_unit_id'], row['crop'], row['year'])].append(row)
    for key, values in sorted(grouped.items()):
        if len({r['area_ha'] for r in values}) != 1:
            conflicts.append({'country_iso3': key[0], 'admin_unit_id': key[1], 'crop': key[2],
                              'year': key[3], 'reason': 'Conflicting official harvested-area values',
                              'observations': values})
            continue
        accepted.append({**values[0], 'source_ref': ';'.join(sorted({r['source_ref'] for r in values}))})
    return accepted, conflicts


def parse_siap_observations(rows, source_ref, years, crops, sources, notes):
    """SIAP reports hectares explicitly; sum seasons/modes/municipalities within a state.

    Conflicting cells and mixed state/municipality totals invalidate the whole state/crop/year.
    Fodder, sweet potatoes, residual crops and unreviewed sugarcane uses stay excluded.
    """
    candidates = [r for r in sources if r.get('country') == 'Mexico' and
                  r['report'] == 'Agricultural Production Statistics' and r['admin_level_raw'] == '1' and
                  'siap.gob.mx' in r['source_links']]
    require(candidates and 'province-level total and irrigated harvested area' in notes.get('MEX', {}).get('text', ''),
            'Mexico SIAP admin level/source not confirmed in supplementary table and notes')
    groups, unresolved, omitted = defaultdict(list), [], Counter()
    for line, row in enumerate(rows, 2):
        crop = SIAP_CROPS.get(row.get('NameCrop_En'))
        if crop not in crops or row.get('Year') not in {str(y) for y in years}:
            omitted['outside_crop_or_year_scope'] += 1
            continue
        state = row.get('NameState', '').strip()
        if state == 'Ciudad de México / DF':
            state = 'Distrito Federal'  # Explicit provider label includes its former DF name.
        groups[(state, int(row['Year']), crop)].append((line, row))
    accepted = []
    for (state, year, crop), cells in sorted(groups.items()):
        try:
            require(state, 'Missing state name')
            refs = [r['admin_level_ref'] for r in candidates if period_includes(r['coverage_period'], year)]
            require(refs, 'SIAP source year absent from supplementary table')
            refs.extend(refs[0].split('#')[0] + f'#page={p}' for p in notes['MEX']['pages'])
            require(len({bool(r.get('NameMunicipality', '').strip()) for _, r in cells}) == 1,
                    'Mixed state totals and municipality components; cannot sum both')
            values, references, labels = {}, [], set()
            for line, row in cells:
                require(row.get('NameSeason') in ('Spring-Summer', 'Fall-Winter', 'Perennial') and
                        row.get('IrrigationStyle') in ('Irrigated', 'Rainfed'), 'Unknown season or irrigation component')
                value = float(row['Harvested(Ha)'])
                require(math.isfinite(value) and value >= 0, 'Invalid reported harvested area')
                key = (row['NameMunicipality'], row['NameSeason'], row['IrrigationStyle'], row['NameCrop_Sp'])
                require(key not in values or values[key] == value, 'Conflicting SIAP cells; no total inferred')
                values[key] = value
                references.append(f'{source_ref}#row={line}')
                labels.add(row['NameCrop_En'])
            accepted.append({'product': 'mirca_os', 'country_iso3': 'MEX',
                'admin_unit_id': f'MEX:1:{name_key(state)}', 'admin_level': 1, 'source_admin_name': state,
                'year': year, 'crop': crop, 'status': 'reported', 'area_ha': math.fsum(values.values()),
                'source_ref': ';'.join(references), 'admin_level_ref': ';'.join(sorted(set(refs))),
                'source_flag': 'SIAP Agricultural Production Statistics',
                'crosswalk_exactness': 'aggregated' if len(labels) > 1 else 'exact'})
        except (DataError, KeyError, ValueError) as exc:
            unresolved.append({'country_iso3': 'MEX', 'source_admin_name': state, 'crop': crop,
                               'year': year, 'reason': str(exc), 'source_ref': source_ref})
    return accepted, unresolved, dict(omitted)


def extract_census_member(archive, member, archive_sha, cache):
    """Content-addressed namespace includes the member's parent to prevent basename collisions."""
    member_path = Path(member)
    require(not member_path.is_absolute() and '..' not in member_path.parts, 'Unsafe archive member')
    directory = cache.root / 'reconciliation' / archive_sha / hashlib.sha256(str(member_path.parent).encode()).hexdigest()[:16]
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / member_path.name
    checksum = path.with_suffix(path.suffix + '.sha256')
    if path.exists():
        require(checksum.exists() and digest(path) == checksum.read_text().strip(), f'Corrupt census extraction: {path}')
        return path
    tmp = path.with_suffix(path.suffix + '.part')
    try:
        if archive.suffix.lower() == '.zip':
            with zipfile.ZipFile(archive) as source, source.open(member) as stream, tmp.open('wb') as target:
                shutil.copyfileobj(stream, target)  # Reading to EOF also verifies the member CRC.
        else:
            with tmp.open('wb') as target:
                subprocess.run(['bsdtar', '-xOf', str(archive), member], stdout=target, check=True, capture_output=False)
        tmp.replace(path)
        checksum.write_text(digest(path))
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    return path


def map_boundaries(path=MAP_BOUNDARIES):
    """Canonical map geometry, with coordinates preserved exactly as published."""
    data = json.loads(Path(path).read_text())
    require(data.get('type') == 'FeatureCollection', 'Map must be a GeoJSON FeatureCollection')
    result = {}
    for feature in data['features']:
        iso = str(feature.get('id', ''))
        if not re.fullmatch(r'[A-Z]{3}', iso):
            continue  # Disputed polygons with the repeated -99 ID are not countries.
        require(iso not in result, f'Duplicate map country: {iso}')
        result[iso] = feature['geometry']
    return result


def reconcile_map_boundaries(observations, map_path=MAP_BOUNDARIES):
    """Join source evidence to one map country/year, retaining census IDs and levels."""
    from shapely.geometry import shape
    boundaries = map_boundaries(map_path)
    sha = digest(map_path)
    grouped, accepted, features, unresolved = defaultdict(list), [], [], []
    for row in observations:
        grouped[(row['country_iso3'], int(row['year']))].append(row)
    for (iso, year), rows in sorted(grouped.items()):
        try:
            require(iso in boundaries, 'Country absent from dashboard map')
            geometry = shape(boundaries[iso])
            require(geometry.geom_type in ('Polygon', 'MultiPolygon') and geometry.is_valid and
                    not geometry.is_empty, 'Invalid map country boundary')
            require(geometry.bounds[2] - geometry.bounds[0] < 180,
                    'Antimeridian country requires explicit split handling')
            ref = f'{Path(map_path).resolve()}@sha256:{sha}#{iso}'
            features.append({'type': 'Feature', 'id': iso, 'properties': {
                'country_iso3': iso, 'year': year, 'admin_unit_id': iso, 'admin_level': 0,
                'analysis_scope': 'map country', 'boundary_ref': ref, 'map_sha256': sha,
                'source_admin_levels': sorted({int(r['admin_level']) for r in rows}),
                'source_admin_level_refs': sorted({r['admin_level_ref'] for r in rows})},
                'geometry': boundaries[iso]})
            accepted.extend({**r, 'boundary_ref': ref} for r in rows)
        except DataError as exc:
            unresolved.append({'country_iso3': iso, 'year': year, 'reason': str(exc)})
    return accepted, features, unresolved


def reconcile_census(cache, mirca_raw, output, evidence_path, units_path, years, crops):
    """Reconcile supported original observations; retain a machine-readable review queue."""
    report_path = output / 'reconciliation_report.json'
    previous = json.loads(report_path.read_text()) if report_path.exists() else {}
    for label, path in [('evidence', evidence_path), ('units', units_path)]:
        if path.exists():
            require(previous.get('outputs', {}).get(label, {}).get('sha256') == digest(path),
                    f'Refusing to replace an unmanaged or edited reconciliation input: {path}')
    audit_mirca_inputs(cache, mirca_raw, output, strict=False)
    inventory = json.loads((output / 'mirca_raw_inventory.json').read_text())
    sources = json.loads((output / 'mirca_admin_source_table.json').read_text())
    note_source = json.loads((output / 'mirca_country_notes.json').read_text())
    names = country_names()
    notes = country_notes(note_source['pages'], names)
    report = {'schemaVersion': 1, 'adapters': ['faostat-national-v1', 'siap-mexico-states-v1'], 'status': 'partial',
              'supplementSha256': sources['source_sha256'], 'years': years, 'crops': crops,
              'analysisMethod': METHOD, 'mapSha256': digest(MAP_BOUNDARIES),
              'sources': [], 'unresolved': [], 'excludedArchives': [], 'unsupportedSources': [],
              'scope': 'Official national FAOSTAT reports and Mexican SIAP harvested-area reports with documented MIRCA-OS levels'}
    observations = []
    for archive in inventory:
        if archive['integrity'] == 'failed':
            report['excludedArchives'].append({'path': archive['local_path'], 'sha256': archive['sha256'],
                                               'reason': 'Unreadable archive member headers; archive excluded in full'})
            continue
        for member in archive['members']:
            siap = member == 'Mexico/SIAP_1980-2019_ForKyle.csv'
            if not siap and (not member.lower().endswith('.csv') or not Path(member).name.startswith('FAOSTAT')):
                if member.lower().endswith(('.csv', '.xlsx', '.xls', '.pdf')):
                    report['unsupportedSources'].append({'archive': archive['local_path'], 'member': member,
                        'reason': 'No reviewed adapter; calendar, derived and unparsed tables are not observations'})
                continue
            ref = f"{Path(archive['local_path']).name}!{member}@sha256:{archive['sha256']}"
            entry = {'source_ref': ref}
            report['sources'].append(entry)
            try:
                path = extract_census_member(Path(archive['local_path']), member, archive['sha256'], cache)
                entry['memberSha256'] = digest(path)
                with path.open(encoding='cp1252' if siap else 'utf-8-sig', newline='') as stream:
                    reader = csv.DictReader(stream)
                    required = ({'Year', 'NameSeason', 'NameCrop_Sp', 'NameCrop_En', 'NameState', 'IrrigationStyle',
                                 'NameMunicipality', 'Harvested(Ha)'} if siap else
                                {'Area', 'Item', 'Year', 'Element', 'Element Code', 'Unit', 'Value', 'Flag', 'Flag Description'})
                    require(required <= set(reader.fieldnames or []), 'Unsupported census schema; no values inferred')
                    if siap:
                        rows, unresolved, omitted = parse_siap_observations(reader, ref, years, crops, sources['rows'], notes)
                    else:
                        rows, unresolved, omitted = parse_faostat_observations(reader, ref, years, crops, sources['rows'], notes, names)
                observations.extend(rows)
                report['unresolved'].extend(unresolved)
                entry.update(acceptedCandidates=len(rows), omitted=omitted)
            except (DataError, OSError, UnicodeError, zipfile.BadZipFile, subprocess.CalledProcessError) as exc:
                entry['error'] = str(exc)
    observations, conflicts = reconcile_duplicates(observations)
    report['unresolved'].extend(conflicts)
    observations, features, failures = reconcile_map_boundaries(observations)
    report['unresolved'].extend(failures)
    report.update(observations=len(observations), analysisUnits=len(features),
                  countries=sorted({r['country_iso3'] for r in observations}))
    if not observations:
        report['status'] = 'blocked'
        report['outputs'] = previous.get('outputs', {})
        write_json(report_path, report)
        raise DataError(f'No census observations could be reconciled; see {report_path}')
    evidence_counts(observations)
    # Validate the complete pair before replacing any previously generated inputs.
    units_tmp = output / 'reconciled_units.pending.geojson'
    write_json(units_tmp, {'type': 'FeatureCollection', 'features': features})
    try:
        load_units(units_tmp, observations)
    finally:
        units_tmp.unlink(missing_ok=True)
    write_csv(evidence_path, observations, EVIDENCE_FIELDS)
    write_json(units_path, {'type': 'FeatureCollection', 'features': features})
    report['outputs'] = {k: {'path': str(p), 'sha256': digest(p)} for k, p in [('evidence', evidence_path), ('units', units_path)]}
    write_json(report_path, report)
    print(f"Reconciled {len(observations)} observations in {len(features)} country/year units; see {report_path}")
    return report


def expected_products(crop, year, spam_vintages=(2010,)):
    products = list(YEARS[year])
    if year in spam_vintages and 'mapspam' not in products:
        products.insert(0, 'mapspam')
    if crop == 'potato':
        products = [p for p in products if p != 'gaez']
    if crop == 'cocoa':
        products = [p for p in products if p in ('mapspam', 'mirca2000')]
    return products


def manifest_coverage(manifest, years, crops, spam_vintages=(2010,)):
    """A frozen partial catalog must never silently pass a wider later request."""
    failures = []
    for year, crop in itertools.product(years, crops):
        for product in expected_products(crop, year, spam_vintages):
            entries = [e for e in manifest['layers'] if
                       (e['year'], e['crop'], e['product']) == (year, crop, product)]
            modes = sorted(e.get('system', '') for e in entries)
            expected = ['irrigated'] + ['rainfed'] * (3 if product == 'mapspam' else 1)
            identities = {(e['name'], e.get('member')) for e in entries}
            if modes != expected or len(identities) != len(entries):
                failures.append({'product': product, 'year': year, 'crop': crop,
                                 'reason': 'Manifest has missing/duplicate harvested-area technology layers; review the frozen manifest'})
    return failures


def prepare(manifest, cache, years, crops, spam_vintages=(2010,)):
    import rasterio
    layers, failures = [], [r for r in manifest.get('unavailable', [])
                            if r.get('year') in years and any(
                                (not r.get('crop') or r['crop'] == crop) and
                                r['product'] in expected_products(crop, r['year'], spam_vintages)
                                for crop in crops)]
    failures.extend(manifest_coverage(manifest, years, crops, spam_vintages))
    for entry in manifest['layers']:
        if entry['year'] not in years or entry['crop'] not in crops:
            continue
        crop_allowed(entry['crop'], [entry['product']], entry['crop'] == 'cocoa')
        require(entry['product'] in YEARS[entry['year']] or (entry['product']=='mapspam' and
                entry['year'] in spam_vintages and entry.get('crop_membership_ref')),
                'Unapproved product vintage or unconfirmed crop membership')
        require(entry['measure'] == 'harvested_area' and entry['unit'] in ('ha', '1000 ha'), 'Not harvested area')
        require(entry['crosswalk_exactness'] in ('exact', 'aggregated', 'approximate'), 'Missing crosswalk flag')
        try:
            path = native_path(entry, cache)
            with rasterio.open(path) as grid:
                validate_grid(grid)
            layers.append({**entry, 'path': str(path)})
        except Exception as exc:
            failures.append({'product': entry['product'], 'year': entry['year'], 'crop': entry['crop'],
                             'source': entry['name'], 'reason': str(exc)})
    return layers, failures


def remap_unit(paths, factors, geometry, cell_m, cache=None):
    """Conservative polygon-overlap remapping into one LAEA unit grid.

    Fractional native cells are intersected with the admin polygon BEFORE
    remapping. Intersections, not averaged raster samples, transfer hectares.
    No mass from another unit can enter this unit's block sums.
    """
    import numpy as np
    import rasterio
    from rasterio.windows import from_bounds, Window
    from rasterio.transform import from_origin
    from shapely.geometry import box
    from shapely.ops import transform
    from shapely.prepared import prep
    from pyproj import CRS, Transformer
    from types import SimpleNamespace
    cache = {} if cache is None else cache
    key = (hashlib.sha256(geometry.wkb).hexdigest(), cell_m)
    if key not in cache:
        centre = geometry.centroid
        require(geometry.is_valid and geometry.area > 0, 'Invalid admin geometry')
        require(geometry.bounds[2]-geometry.bounds[0] < 180, 'Antimeridian unit needs a documented split')
        crs = CRS.from_proj4(f'+proj=laea +lat_0={centre.y} +lon_0={centre.x} +datum=WGS84 +units=m')
        project = Transformer.from_crs(4326, crs, always_xy=True).transform
        unit = transform(project, geometry.segmentize(1/120))
        cache[key] = (crs, project, unit, prep(unit), {})
    crs, project, unit, prepared_unit, overlaps = cache[key]
    left, bottom, right, top = unit.bounds
    width, height = max(1, math.ceil((right-left)/cell_m)), max(1, math.ceil((top-bottom)/cell_m))
    require(width*height < 25_000_000, 'Admin projection exceeds memory budget; subdividing units is forbidden')
    values = np.zeros((height, width), dtype='float64')
    expected = 0.
    for path, factor in zip(paths, factors):
        with rasterio.open(path) as source:
            validate_grid(source)
            window = from_bounds(*geometry.bounds, source.transform)
            x0, y0 = max(0, math.floor(window.col_off)), max(0, math.floor(window.row_off))
            x1 = min(source.width, math.ceil(window.col_off+window.width))
            y1 = min(source.height, math.ceil(window.row_off+window.height))
            data = source.read(1, window=Window(x0,y0,x1-x0,y1-y0), masked=True)
            valid = ~np.ma.getmaskarray(data)
            invalid = valid & (~np.isfinite(data.data) | (data.data < 0))
            if invalid.any():
                samples = np.unique(data.data[invalid])[:5].tolist()
                raise DataError(f'Invalid harvested area: {path}; {int(invalid.sum())} unmasked invalid cells; '
                                f'values={samples}; declared nodata={source.nodata}')
            for row,col in np.argwhere(valid & (data.data > 0)):
                native_key = (tuple(source.transform), x0+int(col), y0+int(row))
                if native_key not in overlaps:
                    x,y = source.transform * (native_key[1], native_key[2])
                    cell = box(x, y+source.transform.e, x+source.transform.a, y).segmentize(1/120)
                    projected = transform(project, cell)
                    indices, weights, retained = [], [], 0.
                    if prepared_unit.intersects(projected):
                        clipped = projected if prepared_unit.covers(projected) else projected.intersection(unit)
                        if not clipped.is_empty and clipped.area > 0:
                            retained = clipped.area / projected.area
                            a,b,c,d = clipped.bounds
                            for iy in range(max(0,math.floor((top-d)/cell_m)), min(height,math.ceil((top-b)/cell_m))):
                                for ix in range(max(0,math.floor((a-left)/cell_m)), min(width,math.ceil((c-left)/cell_m))):
                                    block = box(left+ix*cell_m, top-(iy+1)*cell_m,
                                                left+(ix+1)*cell_m, top-iy*cell_m)
                                    indices.append(iy*width+ix)
                                    weights.append(clipped.intersection(block).area / projected.area)
                    overlaps[native_key] = (np.array(indices, dtype=np.int64), np.array(weights), retained)
                indices, weights, retained = overlaps[native_key]
                area = float(data[row,col])*factor
                expected += area*retained
                values.ravel()[indices] += area*weights
    require(math.isclose(float(values.sum()), expected, rel_tol=1e-9, abs_tol=1e-6), 'Reprojection lost harvested area')
    return SimpleNamespace(values=values, shape=values.shape, crs=crs,
                           transform=from_origin(left,top,cell_m,cell_m), area_km2=unit.area/1e6)


def load_units(path, evidence, map_path=MAP_BOUNDARIES):
    """Require the exact map countries; census levels remain evidence provenance."""
    from shapely.geometry import shape
    boundaries, sha = map_boundaries(map_path), digest(map_path)
    data = json.loads(Path(path).read_text())
    require(data.get('type') == 'FeatureCollection', 'Units must be a GeoJSON FeatureCollection')
    result = {}
    for f in data['features']:
        p = f['properties']
        iso, year = p['country_iso3'], int(p['year'])
        key = (iso, iso, year)
        require(key not in result, f'Duplicate map country/year: {key}')
        require(p.get('admin_unit_id') == iso and type(p.get('admin_level')) is int and
                p['admin_level'] == 0 and p.get('analysis_scope') == 'map country',
                'Analysis requires one map country, without sub-country divisions; rerun --reconcile-evidence')
        require(p.get('map_sha256') == sha and p.get('boundary_ref') and
                iso in boundaries and f['geometry'] == boundaries[iso],
                'Analysis geometry differs from dashboard map; rerun --reconcile-evidence')
        geometry = shape(f['geometry'])
        require(geometry.geom_type in ('Polygon', 'MultiPolygon') and geometry.is_valid and
                not geometry.is_empty and geometry.bounds[2] - geometry.bounds[0] < 180,
                'Invalid or unsplit antimeridian map country boundary')
        result[key] = {**p, 'geometry': geometry}
    for row in evidence:
        key = (row['country_iso3'], row['country_iso3'], int(row['year']))
        require(key in result, f'Evidence country absent from map analysis: {key}')
    return result


def aligned_country_operator(geometry, source, cell_m=None):
    """Conservative, reusable native-cell → equal-area block overlap operator.

    Vectorised polygon intersections preserve the original map boundary and hectares.
    No nearest-neighbour/bilinear resampling or whole-country mass correction is used.
    """
    import numpy as np
    import shapely
    from shapely.ops import transform
    from pyproj import CRS, Transformer, Geod
    from rasterio.windows import from_bounds, Window
    from rasterio.transform import from_origin
    from types import SimpleNamespace
    validate_grid(source)
    require(geometry.is_valid and not geometry.is_empty and geometry.bounds[2]-geometry.bounds[0] < 180,
            'Invalid or unsplit antimeridian map country boundary')
    centre = geometry.centroid
    if cell_m is None:
        area, _ = Geod(ellps='WGS84').polygon_area_perimeter(
            [centre.x-1/24, centre.x+1/24, centre.x+1/24, centre.x-1/24],
            [centre.y-1/24, centre.y-1/24, centre.y+1/24, centre.y+1/24])
        cell_m = math.sqrt(abs(area))
    crs = CRS.from_proj4(f'+proj=laea +lat_0={centre.y} +lon_0={centre.x} +datum=WGS84 +units=m')
    project = Transformer.from_crs(4326, crs, always_xy=True).transform
    unit = transform(project, geometry.segmentize(1/120))
    shapely.prepare(unit)
    left, bottom, right, top = unit.bounds
    width, height = max(1, math.ceil((right-left)/cell_m)), max(1, math.ceil((top-bottom)/cell_m))
    require(width*height < 25_000_000, 'Country projection exceeds memory budget')
    window = from_bounds(*geometry.bounds, source.transform)
    x0, y0 = max(0, math.floor(window.col_off)), max(0, math.floor(window.row_off))
    x1 = min(source.width, math.ceil(window.col_off+window.width))
    y1 = min(source.height, math.ceil(window.row_off+window.height))
    native_width, native_height = x1-x0, y1-y0
    src_ids, dst_ids, weights = [], [], []
    # Ten segments per side match the scalar remapper's 1/120-degree densification.
    t = np.arange(10)/10
    dx = np.concatenate((t, np.ones(10), 1-t, np.zeros(10), [0]))
    dy = np.concatenate((np.zeros(10), t, np.ones(10), 1-t, [0]))
    for start in range(0, native_width*native_height, 4096):
        ids = np.arange(start, min(start+4096, native_width*native_height))
        rr, cc = ids//native_width+y0, ids%native_width+x0
        x = source.transform.c + (cc[:,None]+dx)*source.transform.a
        y = source.transform.f + (rr[:,None]+dy)*source.transform.e
        px, py = project(x, y)
        cells = shapely.polygons(np.stack((px,py), axis=-1))
        hit = shapely.intersects(unit, cells)
        ids, cells = ids[hit], cells[hit]
        if not len(ids):
            continue
        cell_areas = shapely.area(cells)
        inside = shapely.contains(unit, cells)
        clipped = cells.copy()
        clipped[~inside] = shapely.intersection(cells[~inside], unit)
        bounds = shapely.bounds(clipped)
        ix0 = np.maximum(0, np.floor((bounds[:,0]-left)/cell_m).astype(int))
        ix1 = np.minimum(width, np.ceil((bounds[:,2]-left)/cell_m).astype(int))
        iy0 = np.maximum(0, np.floor((top-bounds[:,3])/cell_m).astype(int))
        iy1 = np.minimum(height, np.ceil((top-bounds[:,1])/cell_m).astype(int))
        for oy in range(max(0,int(np.max(iy1-iy0)))):
            for ox in range(max(0,int(np.max(ix1-ix0)))):
                xx, yy = ix0+ox, iy0+oy
                keep = (xx < ix1) & (yy < iy1)
                if not keep.any():
                    continue
                blocks = shapely.box(left+xx[keep]*cell_m, top-(yy[keep]+1)*cell_m,
                                     left+(xx[keep]+1)*cell_m, top-yy[keep]*cell_m)
                fractions = shapely.area(shapely.intersection(clipped[keep], blocks))/cell_areas[keep]
                positive = fractions > 0
                src_ids.append(ids[keep][positive]); dst_ids.append((yy[keep]*width+xx[keep])[positive])
                weights.append(fractions[positive])
    require(weights, 'Map country has no native raster overlap')
    source_index, destination_index, weight = np.concatenate(src_ids), np.concatenate(dst_ids), np.concatenate(weights)
    retained = np.bincount(source_index, weights=weight, minlength=native_width*native_height)
    require((retained <= 1+1e-8).all(), 'Remapping duplicated native-cell area')
    return SimpleNamespace(source_index=source_index, destination_index=destination_index, weights=weight,
        retained=retained, window=Window(x0,y0,native_width,native_height), shape=(height,width),
        transform=from_origin(left,top,cell_m,cell_m), crs=crs, cell_km=cell_m/1000,
        area_km2=unit.area/1e6, source_transform=source.transform, source_crs=source.crs,
        source_shape=source.shape)


def remap_available_product(entries, operator):
    """Sum technology layers; honour a checksum-pinned fill-value correction only."""
    import numpy as np
    import rasterio
    from types import SimpleNamespace
    data = np.zeros(len(operator.retained), dtype='float64')
    corrections = []
    for layer in entries:
        with rasterio.open(layer['path']) as source:
            validate_grid(source)
            require((source.shape, source.transform, source.crs) ==
                    (operator.source_shape, operator.source_transform, operator.source_crs),
                    'Source grid differs before harmonisation')
            pixels = source.read(1, window=operator.window, masked=True)
            valid = ~np.ma.getmaskarray(pixels)
            # This exact v2 file contains -9999 fill cells while its header declares NoData=0.
            # Treat the sentinel as missing, never as negative harvested area; retain the raw file.
            if Path(layer['path']).name == 'MIRCA-OS_Potatoes_2010_ir_v2.tif':
                require(digest(layer['path']) == '508a47ceacbc7949378c36d58f7434fd79da1fce3a87706f4cbc58f9e12815fd',
                        'Known MIRCA-OS fill correction needs review for changed source bytes')
                fill = valid & (pixels.data == -9999)
                if fill.any():
                    corrections.append({'file':Path(layer['path']).name, 'value':-9999,
                        'cellsInCountryWindow':int(fill.sum()), 'action':'mask undeclared fill value',
                        'sourceSha256':digest(layer['path'])})
                valid &= ~fill
            invalid = valid & (~np.isfinite(pixels.data) | (pixels.data < 0))
            require(not invalid.any(), f"Invalid harvested area: {layer['path']}")
            data += np.where(valid, pixels.data, 0).ravel() * (1000 if layer['unit']=='1000 ha' else 1)
    values = np.bincount(operator.destination_index,
        weights=operator.weights*data[operator.source_index], minlength=math.prod(operator.shape)).reshape(operator.shape)
    expected = float(np.dot(data,operator.retained))
    require(math.isclose(float(values.sum()), expected, rel_tol=1e-9, abs_tol=1e-6),
            'Reprojection lost harvested area')
    return SimpleNamespace(values=values, shape=operator.shape, transform=operator.transform,
                           crs=operator.crs, total_ha=expected, corrections=corrections)


def share_dispersion_curve(values, cell_km, area_km2, metadata, tolerance=.1):
    """Compare within-country allocation shares; original totals are not forced to agree."""
    import numpy as np
    a = np.asarray(values, dtype='float64')
    require(a.ndim == 3 and len(a) >= 2 and np.isfinite(a).all() and (a >= 0).all(),
            'Need at least two valid product grids')
    totals = a.sum(axis=(1,2))
    require((totals > 0).all(), 'Allocation shares need positive harvested area in each product')
    shares = a / totals[:,None,None]
    # The existing conservation checks now apply to explicitly normalised distributions.
    rows = dispersion_curve(shares, cell_km, area_km2, metadata,
                            zero_rtol=1e-9, zero_atol_ha=1e-12)
    overlap = float(np.mean([1 - .5*np.abs(shares[i]-shares[j]).sum()
                            for i,j in itertools.combinations(range(len(shares)),2)]))
    overlap = min(1., max(0., overlap))
    return rows, overlap, {p:float(v) for p,v in zip(metadata['products'].split('|'), totals)}


def compute_available_country(iso, layers, evidence, boundaries, grouped, args):
    """Evaluate one map country; safe to run independently of other countries."""
    import rasterio
    from shapely.geometry import shape
    rows, summaries, curves, availability = [], [], [], []
    if iso not in boundaries:
        for crop, year in itertools.product(args.crops,args.years):
            availability.append(dict(country_iso3=iso,crop=crop,year=year,products=[],n_products=0,
                expected_products=expected_products(crop,year,args.mapspam_vintages),
                source_availability=0.,status='missing_map_geometry',issues=[]))
        return rows, summaries, curves, availability
    print(f'Comparing allocation maps: {iso}',flush=True)
    geometry = shape(boundaries[iso])
    with rasterio.open(layers[0]['path']) as source:
        template = aligned_country_operator(geometry, source)
    operators = {}
    for crop, year in itertools.product(args.crops, args.years):
        expected = expected_products(crop, year, args.mapspam_vintages)
        grids, products, issues, corrections, flags, totals = [], [], [], [], set(), {}
        for product in expected:
            entries = grouped[(crop, year, product)]
            if len(entries) != (4 if product == 'mapspam' else 2) or {layer['system'] for layer in entries} != {'irrigated', 'rainfed'}:
                issues.append(dict(product=product, reason='Missing or invalid harvested-area layers'))
                continue
            try:
                with rasterio.open(entries[0]['path']) as source:
                    key = (source.shape, source.transform, str(source.crs))
                    operator = operators.setdefault(key, aligned_country_operator(
                        geometry, source, template.cell_km * 1000))
                grid = remap_available_product(entries, operator)
                totals[product] = grid.total_ha
                corrections.extend(grid.corrections)
                if grid.total_ha <= 0:
                    issues.append(dict(product=product, reason='No positive harvested area inside map country'))
                    continue
                grids.append(grid)
                products.append(product)
                flags.update(layer['crosswalk_exactness'] for layer in entries)
            except DataError as exc:
                issues.append(dict(product=product, reason=str(exc)))
        n = len(products)
        status = 'comparable' if n >= 2 else 'single_product' if n == 1 else 'no_positive_area'
        available = dict(country_iso3=iso, crop=crop, year=year, products=products, n_products=n,
            expected_products=expected, source_availability=n / len(expected) if expected else 0.,
            status=status, issues=issues, corrections=corrections, product_totals_ha=totals,
            census_evidence_available=any(row['country_iso3'] == iso and row['crop'] == crop and int(row['year']) == year for row in evidence))
        availability.append(available)
        if n < 2:
            continue
        assert_same_grid(grids)
        exactness = next(flag for flag in ('approximate', 'aggregated', 'exact') if flag in flags)
        metadata = dict(country_iso3=iso, admin_unit_id=iso, admin_level=0, crop=crop, year=year,
                        products='|'.join(products), crosswalk_exactness=exactness)
        curve_rows, similarity, native_totals = share_dispersion_curve(
            [grid.values for grid in grids], template.cell_km, template.area_km2, metadata, args.tolerance)
        summary = dict(country_iso3=iso, crop=crop, year=year, admin_level=0, tolerance=args.tolerance,
            effective_resolution_km=next((row['scale_km'] for row in curve_rows if row['mean_cv'] < args.tolerance), None),
            dispersion_at_native_cell=curve_rows[0]['mean_cv'], allocation_similarity=similarity,
            crosswalk_exactness=exactness, n_admin_units=1, complete=True,
            products=products, n_products=n, product_totals_ha=native_totals,
            basis='country-normalised harvested-area shares', source_availability=available['source_availability'])
        rows.extend(curve_rows)
        summaries.append(summary)
        curves.append(dict(summary=summary, curve=curve_rows, country_area_km2=template.area_km2))
    return rows, summaries, curves, availability


def compute_available(layers, evidence, boundaries, countries, args):
    """Evaluate all map countries independently of census-evidence availability."""
    from concurrent.futures import ThreadPoolExecutor
    grouped = defaultdict(list)
    for layer in layers:
        grouped[(layer['crop'],layer['year'],layer['product'])].append(layer)
    workers = min(args.workers, len(countries))
    if workers == 1:
        results = [compute_available_country(iso, layers, evidence, boundaries, grouped, args)
                   for iso in countries]
    else:
        with ThreadPoolExecutor(max_workers=workers, thread_name_prefix='crop-allocation') as executor:
            results = list(executor.map(
                lambda iso: compute_available_country(iso, layers, evidence, boundaries, grouped, args), countries))
    return tuple([item for result in results for item in result[index]] for index in range(4))


def compute(layers, evidence, units, args):
    import numpy as np
    from pyproj import Geod
    group, remap_cache = {}, {}
    for layer in layers:
        group.setdefault((layer['crop'], layer['year'], layer['product']), []).append(layer)
    all_rows, summaries, curves, skipped = [], [], [], []
    countries = sorted({r['country_iso3'] for r in evidence})
    for iso, crop, year in itertools.product(countries, args.crops, args.years):
        products = expected_products(crop, year, args.mapspam_vintages)
        if len(products) < 2:
            skipped.append({'country_iso3': iso, 'crop': crop, 'year': year, 'reason': 'Fewer than two dedicated products'})
            continue
        uid = iso
        if (iso, uid, year) not in units:
            continue
        relevant = [r for r in evidence if (r['country_iso3'], r['crop'], int(r['year'])) == (iso, crop, year)]
        try:
            unit = units[(iso, uid, year)]
            require(any(r['product'] == 'mirca_os' for r in relevant),
                    'No reported MIRCA-OS observation for this crop/country/year')
            print(f'Checking {iso} / {crop} / {year}: map country polygon', flush=True)
            entries = [group.get((crop,year,p), []) for p in products]
            require(all({l['system'] for l in ls} == {'irrigated','rainfed'} for ls in entries), 'Missing irrigation-mode layer')
            require(all(len(ls) == (4 if p == 'mapspam' else 2) for p,ls in zip(products,entries)),
                    'Missing or duplicate technology layers')
            centre = unit['geometry'].centroid
            geod = Geod(ellps='WGS84')
            # Square root of a geographic native cell's ellipsoidal area at the unit centroid.
            area, _ = geod.polygon_area_perimeter([centre.x-1/24,centre.x+1/24,centre.x+1/24,centre.x-1/24],
                [centre.y-1/24,centre.y-1/24,centre.y+1/24,centre.y+1/24])
            cell_m = math.sqrt(abs(area))
            harmonised = [remap_unit([l['path'] for l in ls], [1000 if l['unit']=='1000 ha' else 1 for l in ls],
                                    unit['geometry'], cell_m, remap_cache) for ls in entries]
            assert_same_grid(harmonised)
            flags = {l['crosswalk_exactness'] for ls in entries for l in ls}
            flags.update(r.get('crosswalk_exactness', 'exact') for r in relevant)
            exactness = next(f for f in ('approximate','aggregated','exact') if f in flags)
            metadata = {'country_iso3': iso, 'admin_unit_id': uid, 'admin_level': unit['admin_level'],
                        'crop': crop, 'year': year, 'products': '|'.join(products), 'crosswalk_exactness': exactness}
            curve = dispersion_curve(np.stack([g.values for g in harmonised]), cell_m/1000,
                                     harmonised[0].area_km2, metadata,
                                     totals_rtol=args.totals_tolerance, zero_rtol=args.zero_rtol,
                                     zero_atol_ha=args.zero_atol_ha)
            resolution = next((r['scale_km'] for r in curve if r['mean_cv'] < args.tolerance), None)
            summary = {'country_iso3': iso, 'crop': crop, 'year': year, 'complete': True,
                       'admin_level': 0, 'tolerance': args.tolerance,
                       'effective_resolution_km': resolution,
                       'dispersion_at_native_cell': curve[0]['mean_cv'],
                       'crosswalk_exactness': exactness, 'n_admin_units': 1}
            all_rows.extend(curve)
            summaries.append(summary)
            curves.append({'summary': summary, 'curve': curve,
                           'country_area_km2': harmonised[0].area_km2})
        except DataError as exc:
            skipped.append({'country_iso3': iso, 'admin_unit_id': uid, 'crop': crop, 'year': year, 'reason': str(exc)})
    return all_rows, summaries, curves, skipped


def draw_curves(curves, output):
    if not curves:
        return
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams.update({'pdf.fonttype':42, 'svg.fonttype':'none', 'font.size':9})
    output.mkdir(parents=True, exist_ok=True)
    for item in curves:
        s, rows = item['summary'], item['curve']
        fig, ax = plt.subplots(figsize=(6.8,4.2), layout='constrained')
        ax.plot([r['scale_km'] for r in rows],[r['mean_cv'] for r in rows],color='#176994',marker='o',ms=3)
        ax.axhline(s['tolerance'], color='#ad641b', ls='--', label=f"Tolerance {s['tolerance']:g}")
        if s['effective_resolution_km'] is not None:
            ax.axvline(s['effective_resolution_km'],color='#287b51',ls=':',label=f"Effective resolution {s['effective_resolution_km']:.1f} km")
        size = math.sqrt(item['country_area_km2'])
        ax.set(xscale='log',xlabel='Aggregation width (km)',ylabel='Mean block CV within map country',
               ylim=(0, max(s['tolerance'], *(r['mean_cv'] for r in rows)) * 1.08))
        ax.set_title(f"{s['country_iso3']} · {s['crop'].replace('_',' ')} · {s['year']}", pad=32)
        fig.supxlabel(f"Map country size (√area): {size:.1f} km · {s['crosswalk_exactness']} crosswalk",
                      fontsize=8)
        ax.legend(loc='lower left', bbox_to_anchor=(0, 1.01), ncol=2, frameon=False, fontsize=8)
        ax.spines[['top','right']].set_visible(False)
        for fmt in ('pdf','svg','png'):
            fig.savefig(output/f"{s['country_iso3']}_{s['crop']}_{s['year']}.{fmt}",dpi=300)
        plt.close(fig)


def print_run_summary(rows, summaries, skipped, reconciliation, output_dir):
    print(f'Wrote {len(rows)} scale rows and {len(summaries)} country/crop/year summaries')
    if reconciliation:
        countries = ', '.join(reconciliation['countries'])
        print(f"Census reconciliation: {reconciliation['status']}; countries: {countries}")
    if skipped:
        reasons = Counter(item['reason'].split(':', 1)[0] for item in skipped)
        print(f'Skipped {len(skipped)} comparisons:')
        for reason, count in reasons.most_common():
            print(f'  {count}: {reason}')
        print(f'Details: {output_dir / "skipped.json"}')
    if not summaries:
        print('No allocation dispersion or effective-resolution scores were produced. '
              'Published reporting-unit counts are separate from allocation scores.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-cache',type=Path,default=RAW)
    parser.add_argument('--mirca-raw',type=Path,default=MIRCA_RAW)
    parser.add_argument('--gaez2015-raw',type=Path,default=GAEZ2015_RAW,
                        help='Manual GAEZ+2015 Dataverse ZIPs or original GeoTIFFs; adopted without network requests')
    parser.add_argument('--manifest',type=Path,help='Pinned source manifest; default: discover official provider catalogs once')
    parser.add_argument('--evidence',type=Path,
                        help='Reviewed reporting observations; default: reporting_units.csv under --mirca-raw')
    parser.add_argument('--units',type=Path,
                        help='Exact map country boundaries; default: analysis_units.geojson under --mirca-raw')
    parser.add_argument('--output-dir',type=Path,default=HERE/'data/crop_allocation')
    parser.add_argument('--report', type=Path, default=HERE/'data/crop_allocation_report.json',
                        help='Published agriculture report; defaults to processing/data/crop_allocation_report.json')
    parser.add_argument('--figures-dir',type=Path,default=HERE.parent/'eda/figures/crop-allocation')
    parser.add_argument('--years',nargs='+',type=int,choices=sorted(YEARS),default=list(DEFAULT_YEARS))
    parser.add_argument('--crops',nargs='+',choices=sorted([*CROPS,'cocoa']),default=list(CROPS))
    parser.add_argument('--mapspam-vintages',nargs='+',type=int,choices=[2000,2005,2010,2015,2020],default=[2010],
                        help='Additional vintages require --manifest and a crop_membership_ref on each layer/evidence row')
    parser.add_argument('--allocation-basis', choices=['country-shares','strict-totals'], default='country-shares',
                        help='Compare within-country allocation shares, or require matching raw totals')
    parser.add_argument('--countries', nargs='+', help='ISO3 subset; default: every DHS country')
    parser.add_argument('--append-report', type=Path,
                        help='Replace selected countries in an existing country-share report and retain other cached country results')
    parser.add_argument('--workers', type=int, default=4,
                        help='Independent country calculations to run concurrently (default: 4)')
    parser.add_argument('--no-figures', action='store_true', help='Compute all scores without rendering decay figures')
    parser.add_argument('--tolerance',type=float,default=.10)
    parser.add_argument('--totals-tolerance',type=float,default=.10)
    parser.add_argument('--zero-rtol',type=float,default=1e-6)
    parser.add_argument('--zero-atol-ha',type=float,default=.01)
    parser.add_argument('--offline',action='store_true')
    parser.add_argument('--prepare-only',action='store_true',help='Download, cache, and validate source rasters without publishing counts')
    parser.add_argument('--audit-evidence-only', action='store_true',
                        help='Ingest supplementary admin-source tables and inventory local raw census archives; do not infer counts')
    parser.add_argument('--reconcile-only', action='store_true',
                        help='Generate reporting_units.csv and analysis_units.geojson from supported original census sources')
    parser.add_argument('--reconcile-evidence', action='store_true',
                        help='Refresh previously generated evidence from raw sources before computing')
    args = parser.parse_args(argv)
    custom_inputs = args.evidence is not None or args.units is not None
    args.evidence = args.evidence or args.mirca_raw / 'reporting_units.csv'
    args.units = args.units or args.mirca_raw / 'analysis_units.geojson'
    try:
        require(args.workers >= 1 and 0 < args.tolerance < 1 and 0 <= args.totals_tolerance < 1 and
                0 <= args.zero_rtol <= 1e-4 and 0 <= args.zero_atol_ha <= 1,
                'Invalid tolerances; zero checks must remain near numerical precision')
        require(set(args.mapspam_vintages) == {2010} or args.manifest,
                'Extra SPAM vintages require an explicit manifest with documented crop membership')
        require(sum((args.prepare_only, args.audit_evidence_only, args.reconcile_only)) <= 1,
                'Choose only one of --prepare-only, --audit-evidence-only and --reconcile-only')
        cache = Cache(args.raw_cache,args.offline)
        if args.audit_evidence_only:
            print(json.dumps(audit_mirca_inputs(cache, args.mirca_raw, args.output_dir), indent=2))
            return
        if not args.prepare_only and not args.audit_evidence_only:
            if (args.reconcile_only or args.reconcile_evidence or
                    (not custom_inputs and (not args.evidence.is_file() or not args.units.is_file()))):
                try:
                    reconcile_census(cache, args.mirca_raw, args.output_dir, args.evidence, args.units, args.years, args.crops)
                except (DataError, OSError) as exc:
                    if args.allocation_basis == 'strict-totals' or args.reconcile_only or custom_inputs:
                        raise
                    print(f'Census evidence unavailable: {exc}. Raster allocation analysis can proceed.', flush=True)
            missing = [str(path) for path in (args.evidence, args.units) if not path.is_file()]
            readiness = args.output_dir / 'evidence_readiness.json'
            write_json(readiness, {'status': 'blocked' if missing else 'inputs_present',
                                  'missingInputs': missing,
                                  'evidence': str(args.evidence), 'units': str(args.units)})
            if missing and (args.allocation_basis == 'strict-totals' or custom_inputs or args.reconcile_only):
                parser.exit(MISSING_EVIDENCE_EXIT,
                    'Crop allocation blocked: reviewed census-to-boundary inputs are unavailable.\n'
                    'Missing reviewed intermediate inputs:\n  ' + '\n  '.join(missing) + '\n'
                    'These are not provider downloads; the raw archives do not supply them.\n'
                    'Use --reconcile-only to generate supported inputs, or inspect reconciliation_report.json for unresolved sources.\n'
                    f'Status: {readiness}\nAgriculture outputs were not changed.\n')
        if args.reconcile_only:
            return
        reconciliation_path = args.output_dir / 'reconciliation_report.json'
        reconciliation = None
        if reconciliation_path.exists() and not args.prepare_only:
            candidate = json.loads(reconciliation_path.read_text())
            managed = candidate.get('outputs', {})
            if all(managed.get(key, {}).get('path') == str(path) for key, path in [('evidence', args.evidence), ('units', args.units)]):
                require(all(managed[key]['sha256'] == digest(path) for key, path in [('evidence', args.evidence), ('units', args.units)]),
                        'Generated reconciliation inputs changed; rerun reconciliation or use reviewed custom inputs')
                reconciliation = {k: candidate[k] for k in ('status', 'countries', 'observations', 'analysisUnits', 'adapters')}
                reconciliation['reportSha256'] = digest(reconciliation_path)
        manifest = (json.loads(args.manifest.read_text()) if args.manifest else
                    source_manifest(cache,args.years,args.crops,args.mirca_raw,args.gaez2015_raw))
        layers, failures = prepare(manifest,cache,args.years,args.crops,args.mapspam_vintages)
        preflight = {'method':METHOD,'layersValidated':len(layers),'failures':failures,
                     'excluded':manifest.get('excluded',[]),'complete':not failures,
                     'evidenceTableReady':args.evidence.is_file(), 'analysisUnitsReady':args.units.is_file()}
        write_json(args.output_dir/'preflight.json',preflight)
        if args.allocation_basis == 'strict-totals':
            require(not failures, f'{len(failures)} source checks failed; see {args.output_dir}/preflight.json')
        require(layers, 'No usable source layers; see preflight.json')
        if args.prepare_only:
            print(f'Validated {len(layers)} harvested-area layers; no dashboard counts published')
            return
        evidence_sha = digest(args.evidence) if args.evidence.is_file() else None
        units_sha = digest(args.units) if args.units.is_file() else None
        map_sha = digest(MAP_BOUNDARIES)
        evidence = (read_table(args.evidence, ['product','country_iso3','admin_unit_id','admin_level',
                              'crop','year','status','source_ref','admin_level_ref']) if evidence_sha else [])
        evidence = [r for r in evidence if int(r['year']) in args.years and r['crop'] in args.crops]
        records = evidence_counts(evidence)
        availability = []
        if args.allocation_basis == 'strict-totals':
            require(evidence, 'No verified reporting evidence for selected crops/years')
            units = load_units(args.units,evidence)
            rows, summaries, curves, skipped = compute(layers,evidence,units,args)
            requested_countries = sorted({r['country_iso3'] for r in evidence})
        else:
            dhs = json.loads((HERE/'data/dhs.json').read_text())
            requested_countries = sorted(set(args.countries or dhs))
            require(all(re.fullmatch('[A-Z]{3}', iso) for iso in requested_countries), 'Invalid ISO3 country selection')
            rows, summaries, curves, availability = compute_available(
                layers,evidence,map_boundaries(),requested_countries,args)
            skipped = [{**a,'reason':a['status']} for a in availability if a['status'] != 'comparable']
        require((digest(args.evidence) if args.evidence.is_file() else None) == evidence_sha and
                (digest(args.units) if args.units.is_file() else None) == units_sha and
                digest(MAP_BOUNDARIES) == map_sha,
                'Reconciliation inputs changed during computation; rerun before publishing')
        if args.append_report:
            old = json.loads(args.append_report.read_text())
            old_meta = old.get('_meta', {})
            require(args.allocation_basis == 'country-shares' and
                    old_meta.get('countingMethod') == METHOD and
                    old_meta.get('allocationBasis') == 'country-shares',
                    'Only country-share results can be appended')
            require(old_meta.get('sourceManifestSha256') == hashlib.sha256(
                    json.dumps(manifest, sort_keys=True).encode()).hexdigest(),
                    'Source manifest changed; recompute every country')
            replacing = set(requested_countries)
            def retain(items):
                return [item for item in items if item.get('country_iso3', item.get('summary', {}).get('country_iso3')) not in replacing]
            previous_curves = json.loads((args.output_dir / 'country_curves.json').read_text())
            curves = retain(previous_curves) + curves
            summaries = retain(old.get('effective_resolution', [])) + summaries
            availability = retain(old.get('source_availability', [])) + availability
            skipped = retain(old.get('skipped', [])) + skipped
            rows = [row for curve in curves for row in curve['curve']]
            requested_countries = sorted(set(old_meta.get('countriesRequested', [])) | replacing)
        write_csv(args.output_dir/'dispersion_by_scale.csv',rows,DISPERSION_FIELDS)
        write_csv(args.output_dir/'effective_resolution.csv',summaries,RESOLUTION_FIELDS)
        write_json(args.output_dir/'country_curves.json',curves)
        write_json(args.output_dir/'skipped.json',skipped)
        write_json(args.output_dir/'source_availability.json',availability)
        write_csv(args.output_dir/'source_availability.csv',availability,AVAILABILITY_FIELDS)
        if not args.no_figures:
            draw_curves(curves,args.figures_dir)
        require(rows or records or availability, 'No verified observations or qualifying comparisons; dashboard outputs were not replaced')
        report = {'_meta':{'schemaVersion':1,'countingMethod':METHOD if args.allocation_basis == 'country-shares' else STRICT_METHOD,'unit':UNIT,
                          'allocationBasis':args.allocation_basis,'countriesRequested':requested_countries,
                          'createdUtc':datetime.now(timezone.utc).isoformat(),
                          'countryWeighting':'mean of nonzero blocks within map country','tolerance':args.tolerance,
                          'normalisation':'block width / sqrt(map country area km2)',
                          'analysisGeometry':{'path':str(MAP_BOUNDARIES), 'sha256':map_sha, 'scope':'map country'},
                          'crops':args.crops,'years':args.years,'mapspamVintages':args.mapspam_vintages,
                          'evidenceSha256':evidence_sha,'unitsSha256':units_sha,
                          'sourceManifestSha256':hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()},
                  'evidence':evidence,'effective_resolution':summaries,'skipped':skipped,
                  'reconciliation': reconciliation,'source_availability':availability,
                  'source_failures':failures,
                  'crosswalk':[{k:l[k] for k in ('product','crop','year','crosswalk_exactness','system')} for l in layers]}
        # Per-source ISO3/year files follow the existing parsers. The audit validates their identities.
        for product in ('mapspam','gaez','mirca2000','mirca_os'):
            write_json(HERE/'data'/f'{product}.json', records.get(product, {}))
        write_json(args.report, report)
        print_run_summary(rows, summaries, skipped, reconciliation, args.output_dir)
        if availability:
            scored = {s['country_iso3'] for s in summaries}
            print(f'Allocation comparisons available for {len(scored)}/{len(requested_countries)} requested countries; '
                  'see source_availability.json for every country/crop/year.')
    except (DataError,OSError,KeyError,ValueError,subprocess.CalledProcessError) as exc:
        parser.exit(1,f'Crop allocation: {exc}\n')


if __name__ == '__main__':
    main()
