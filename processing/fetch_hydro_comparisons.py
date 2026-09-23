#!/usr/bin/env python3
"""Fetch auditable inputs for the approved hydro-map comparisons.

Only precipitation (ERA5-Land/CHIRPS), cropland extent (ESA CCI/MIRCA), and
irrigated extent (ESA CCI/MIRCA) are admitted.  Rainfed ESA CCI comparison is
explicitly excluded: CCI MRLC has no defensible rainfed class.
"""
from __future__ import annotations

import argparse
import calendar
import csv
import hashlib
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
RAW = HERE / 'data' / 'raw' / 'hydro-comparisons'
OUT = HERE / 'data' / 'hydro_comparisons'
YEARS = (2000, 2010, 2015)
CHIRPS = 'https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/tifs/chirps-v3.0.{year}.{month:02d}.tif'
PC_SEARCH = 'https://planetarycomputer.microsoft.com/api/stac/v1/search'
PC_SIGN = 'https://planetarycomputer.microsoft.com/api/sas/v1/sign'
MAP = HERE / 'data' / 'world.raw.geojson'
CELL_M = 10_000
TOLERANCE = .10


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


class Cache:
    def __init__(self, root: Path, offline: bool):
        self.root, self.offline = root, offline
        root.mkdir(parents=True, exist_ok=True)
        self.path = root / 'cache.json'
        self.entries = json.loads(self.path.read_text()) if self.path.exists() else {}

    def save(self):
        self.path.write_text(json.dumps(self.entries, indent=2) + '\n')

    def download(self, name: str, url: str, version: str) -> Path:
        path = self.root / name
        old = self.entries.get(name)
        if old:
            if old['url'] != url or old['version'] != version or not path.is_file() or sha256(path) != old['sha256']:
                raise ValueError(f'cached identity/checksum failed: {path}')
            return path
        if self.offline:
            raise ValueError(f'offline cache miss: {name}')
        temporary = path.with_suffix(path.suffix + '.part')
        with requests.get(url, stream=True, timeout=(20, 180)) as response:
            response.raise_for_status()
            with temporary.open('wb') as handle:
                for block in response.iter_content(1024 * 1024):
                    if block:
                        handle.write(block)
        temporary.replace(path)
        self.entries[name] = {'url': url, 'version': version, 'accessed_at': datetime.now(timezone.utc).isoformat(),
                              'sha256': sha256(path), 'bytes': path.stat().st_size}
        self.save()
        return path

    def register_local(self, name: str, source: Path, url: str, version: str) -> Path:
        """Audit a supplied MIRCA archive without copying or silently replacing it."""
        if not source.is_file():
            raise ValueError(f'required local source is missing: {source}')
        checksum = sha256(source)
        old = self.entries.get(name)
        if old and old['sha256'] != checksum:
            raise ValueError(f'local source changed after caching: {source}')
        self.entries[name] = {'url': url, 'version': version, 'accessed_at': datetime.now(timezone.utc).isoformat(),
                              'sha256': checksum, 'bytes': source.stat().st_size, 'path': str(source.resolve())}
        self.save()
        return source


def era5(cache: Cache, year: int, month: int) -> Path:
    """Request one monthly ERA5-Land total-precipitation NetCDF from CDS.

    CDS jobs are deliberately one month each: they are small, independently cached,
    and a transient queue failure cannot invalidate another year of inputs.
    """
    target = cache.root / f'era5-land-monthly-total-precipitation-{year}-{month:02d}.nc'
    name = target.name
    annual_name = f'era5-land-monthly-total-precipitation-{year}.nc'
    if annual_name in cache.entries:
        old = cache.entries[annual_name]
        return cache.download(annual_name, old['url'], old['version'])
    if name in cache.entries:
        return cache.download(name, cache.entries[name]['url'], cache.entries[name]['version'])
    if cache.offline:
        raise ValueError(f'offline cache miss: {name}')
    try:
        import cdsapi
    except ImportError as exc:
        raise ValueError('Install processing requirements: cdsapi is required for ERA5-Land') from exc
    if not Path.home().joinpath('.cdsapirc').is_file():
        raise ValueError('Missing ~/.cdsapirc; copy processing/cdsapirc.example and add your CDS token')
    client = cdsapi.Client()
    client.retrieve('reanalysis-era5-land-monthly-means', {
        'product_type': ['monthly_averaged_reanalysis'], 'variable': ['total_precipitation'],
        'year': [str(year)], 'month': [f'{month:02d}'],
        'time': ['00:00'], 'data_format': 'netcdf'}, str(target))
    cache.entries[name] = {'url': 'cds:reanalysis-era5-land-monthly-means', 'version': 'CDS monthly means',
                           'accessed_at': datetime.now(timezone.utc).isoformat(), 'sha256': sha256(target),
                           'bytes': target.stat().st_size}
    cache.save()
    return target


def chirps(cache: Cache, year: int, month: int) -> Path:
    return cache.download(f'chirps-v3.0-{year}-{month:02d}.tif', CHIRPS.format(year=year, month=month), 'CHIRPS v3.0 final')


def esa_cci(cache: Cache, year: int, limit: int = 4) -> list[Path]:
    """Discover every annual ESA CCI MRLC COG tile from its public STAC catalogue."""
    if cache.offline and not any(name.startswith(f'esa-cci-mrlc-{year}-') for name in cache.entries):
        raise ValueError(f'offline cache miss: ESA CCI MRLC {year} tiles')
    response = requests.post(PC_SEARCH, json={'collections': ['esa-cci-lc'],
        'datetime': f'{year}-01-01T00:00:00Z/{year}-12-31T23:59:59Z', 'limit': 1000}, timeout=60)
    response.raise_for_status()
    features = response.json().get('features', [])
    if not features:
        raise ValueError(f'ESA CCI MRLC STAC has no annual item for {year}')
    output, downloaded = [], 0
    for feature in features:
        assets = feature.get('assets', {})
        asset = next((value for value in assets.values() if value.get('href', '').lower().endswith(('.tif', '.tiff'))), None)
        if not asset:
            continue
        name = f"esa-cci-mrlc-{year}-{feature['id']}.tif"
        if name in cache.entries:
            old = cache.entries[name]
            output.append(cache.download(name, old['url'], old['version']))
            continue
        if downloaded >= limit:
            break
        for attempt in range(5):
            signed = requests.get(PC_SIGN, params={'href': asset['href']}, timeout=60)
            if signed.status_code != 429:
                break
            time.sleep(min(2 ** attempt, 16))
        signed.raise_for_status()
        href = signed.json().get('href')
        if not href:
            raise ValueError(f"Planetary Computer did not return a signed ESA CCI URL for {feature['id']}")
        path, temporary = cache.root / name, (cache.root / name).with_suffix('.tif.part')
        with requests.get(href, stream=True, timeout=(20, 180)) as response:
            response.raise_for_status()
            with temporary.open('wb') as handle:
                for block in response.iter_content(1024 * 1024):
                    if block:
                        handle.write(block)
        temporary.replace(path)
        cache.entries[name] = {'url': asset['href'], 'version': 'ESA CCI Medium Resolution Land Cover 300 m',
                               'accessed_at': datetime.now(timezone.utc).isoformat(), 'sha256': sha256(path), 'bytes': path.stat().st_size}
        cache.save(); output.append(path); downloaded += 1
    return output


def mirca_inputs(cache: Cache) -> None:
    crop = HERE / 'data' / 'raw' / 'crop-allocation'
    os = HERE / 'data' / 'raw' / 'mirca-os'
    cache.register_local('mirca2000-harvested.zip', crop / 'mirca2000-harvested.zip',
                         'https://zenodo.org/records/7422506', 'MIRCA2000 v1.1')
    cache.register_local('mirca-os-annual-harvested-area.rar', os / 'Annual Harvested Area Grids.rar',
                         'https://doi.org/10.1038/s41597-024-04313-w', 'MIRCA-OS v2')


def single_stream_inventory() -> dict:
    return {'schemaVersion': 1, 'single_stream': {
        'era5_land_only': ['evapotranspiration', 'runoff', 'soil_moisture', 'soil_temperature', 'skin_temperature',
                            'snow', 'radiation', 'transpiration', 'bare_soil_evaporation', 'lake_temperature', 'lai'],
        'no_map': ['river_discharge', 'groundwater_level', 'reservoir_storage']},
        'excluded_comparison': {'rainfed_area_extent': 'ESA CCI Medium Resolution Land Cover has no defensible rainfed class.'}}


def write_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, allow_nan=False) + '\n')
    temporary.replace(path)


def target_grid(geometry):
    import rasterio.features
    import rasterio.warp
    from affine import Affine
    projected = rasterio.warp.transform_geom('EPSG:4326', 'EPSG:6933', geometry)
    coordinates = []
    def visit(value):
        if value and isinstance(value[0], (int, float)):
            coordinates.append(value)
        else:
            for item in value: visit(item)
    visit(projected['coordinates'])
    xs, ys = zip(*coordinates)
    left, right = math.floor(min(xs)/CELL_M)*CELL_M, math.ceil(max(xs)/CELL_M)*CELL_M
    bottom, top = math.floor(min(ys)/CELL_M)*CELL_M, math.ceil(max(ys)/CELL_M)*CELL_M
    width, height = max(1, round((right-left)/CELL_M)), max(1, round((top-bottom)/CELL_M))
    transform = Affine(CELL_M, 0, left, 0, -CELL_M, top)
    mask = rasterio.features.rasterize([(projected, 1)], out_shape=(height,width), transform=transform,
                                        fill=0, dtype='uint8').astype(bool)
    return transform, mask


def reproject_array(data, src_transform, src_crs, dst_transform, shape, resampling):
    import numpy as np
    from rasterio.warp import reproject
    result = np.zeros(shape, dtype='float64')
    reproject(data.astype('float64'), result, src_transform=src_transform, src_crs=src_crs,
              dst_transform=dst_transform, dst_crs='EPSG:6933', resampling=resampling,
              src_nodata=None, dst_nodata=0)
    result[~np.isfinite(result)] = 0
    result[np.abs(result) < np.finfo('float32').tiny] = 0
    return result


def precipitation_sources(year):
    import numpy as np
    import rasterio
    from affine import Affine
    import zipfile
    def netcdf(path, label):
        if not zipfile.is_zipfile(path):
            return path
        directory=RAW/'era5-extracted'/str(year)/label
        existing=list(directory.glob('*.nc'))
        if not existing:
            directory.mkdir(parents=True,exist_ok=True)
            with zipfile.ZipFile(path) as archive:
                members=[name for name in archive.namelist() if name.lower().endswith('.nc')]
                if len(members)!=1: raise ValueError(f'Expected one NetCDF in {path}; found {len(members)}')
                archive.extract(members[0],directory)
            existing=list(directory.glob('**/*.nc'))
        return existing[0]
    annual=RAW/f'era5-land-monthly-total-precipitation-{year}.nc'
    if annual.exists():
        path=netcdf(annual,'annual')
        with rasterio.open(path) as source:
            if source.count != 12 or source.shape != (1801,3600):
                raise ValueError(f'Unexpected ERA5-Land annual stack: {path}')
            era=np.zeros(source.shape,dtype='float64')
            for month in range(1,13):
                era += np.nan_to_num(source.read(month),nan=0)*calendar.monthrange(year,month)[1]
    else:
        era=None
        for month in range(1,13):
            path=netcdf(RAW/f'era5-land-monthly-total-precipitation-{year}-{month:02d}.nc',f'{month:02d}')
            with rasterio.open(path) as source:
                if source.count != 1 or source.shape != (1801,3600):
                    raise ValueError(f'Unexpected ERA5-Land monthly grid: {path}')
                values=np.nan_to_num(source.read(1),nan=0)*calendar.monthrange(year,month)[1]
                era=values if era is None else era+values
    era = np.roll(era, 1800, axis=1)
    era_transform = Affine(.1,0,-180.05,0,-.1,90.05)
    era = era.astype('float32')
    chirps = None
    for month in range(1,13):
        with rasterio.open(RAW / f'chirps-v3.0-{year}-{month:02d}.tif') as source:
            values = source.read(1, masked=True).filled(0).astype('float32')
            values[values < 0] = 0
            chirps = values if chirps is None else chirps + values
            chirps_profile = (source.transform, source.crs)
    return (era, era_transform, 'EPSG:4326'), (chirps, *chirps_profile)


def precipitation_grids(sources, transform, mask):
    from rasterio.enums import Resampling
    era, chirps = sources
    era_grid = reproject_array(*era, transform, mask.shape, Resampling.average)
    chirps = reproject_array(*chirps, transform, mask.shape, Resampling.average)
    era_grid[~mask] = 0; chirps[~mask] = 0
    return era_grid, chirps


def esa_grid(year, classes, geometry, transform, mask):
    import rasterio
    from rasterio.enums import Resampling
    from rasterio.windows import from_bounds
    import numpy as np
    result = np.zeros(mask.shape, dtype='float64')
    tiles = sorted(RAW.glob(f'esa-cci-mrlc-{year}-*.tif'))
    if len(tiles) != 32:
        raise ValueError(f'ESA CCI {year} needs 32 tiles; found {len(tiles)}')
    for path in tiles:
        with rasterio.open(path) as source:
            coordinates=[]
            def visit(value):
                if value and isinstance(value[0], (int,float)): coordinates.append(value)
                else:
                    for item in value: visit(item)
            visit(geometry['coordinates'])
            xs,ys=zip(*coordinates)
            left,bottom,right,top=min(xs),min(ys),max(xs),max(ys)
            if right < source.bounds.left or left > source.bounds.right or top < source.bounds.bottom or bottom > source.bounds.top:
                continue
            left=max(left,source.bounds.left); right=min(right,source.bounds.right)
            bottom=max(bottom,source.bounds.bottom); top=min(top,source.bounds.top)
            window=from_bounds(left,bottom,right,top,source.transform).round_offsets().round_lengths()
            binary=np.isin(source.read(1,window=window),tuple(classes)).astype('float32')
            result += reproject_array(binary, source.window_transform(window), source.crs, transform, mask.shape, Resampling.average)
    result = np.clip(result,0,1); result[~mask] = 0
    return result


def mirca_layers():
    from fetch_crop_allocation import Cache as CropCache, CROPS, prepare
    root = HERE / 'data/raw/crop-allocation'
    manifest = json.loads((root/'sources.json').read_text())
    manifest['layers'] = [row for row in manifest['layers'] if row['product']=='mirca_os']
    manifest['unavailable'] = [row for row in manifest.get('unavailable',[]) if row.get('product')=='mirca_os']
    layers, _ = prepare(manifest, CropCache(root,True), YEARS, tuple(CROPS), (2010,))
    expected = len(YEARS)*len(CROPS)*2
    if len(layers) != expected:
        raise ValueError(f'MIRCA-OS needs {expected} approved crop/system layers; found {len(layers)}')
    return layers


def mirca_sources(layers, year):
    import numpy as np
    import rasterio
    from rasterio.enums import Resampling
    selected = [row for row in layers if row['year']==year]
    total = None; irrigated = None; profile = None
    for row in selected:
        with rasterio.open(row['path']) as source:
            if source.shape != (2160,4320): raise ValueError(f'Latitude-clipped MIRCA raster: {row["path"]}')
            values = source.read(1, masked=True).filled(0).astype('float32')
            values[values < 0] = 0
            total = values if total is None else total + values
            if row['system']=='irrigated':
                irrigated = values.copy() if irrigated is None else irrigated + values
            profile = (source.transform, source.crs)
    if total is None or irrigated is None or total.sum() <= 0: raise ValueError(f'Missing MIRCA {year}')
    return (total,*profile),(irrigated,*profile)


def mirca_grid(source, transform, mask):
    from rasterio.enums import Resampling
    result = reproject_array(*source, transform, mask.shape, Resampling.sum)
    result[~mask] = 0
    return result


def comparison_metrics(first, second, mask, area_km2, tolerance=TOLERANCE):
    import numpy as np
    arrays = np.stack([first,second]).astype('float64')
    arrays[:,~mask] = 0
    totals = arrays.sum(axis=(1,2))
    available = int((totals > 0).sum())
    if available < 2:
        return {'dispersion':None,'resolution':None,'allocationSimilarity':None,
                'sourceAvailability':available/2,'complete':False,'curve':[],
                'missingReason':'Both positive-area map streams are required for a spatial comparison.'}
    shares = arrays / totals[:,None,None]
    similarity = float(max(0,min(1,1-.5*np.abs(shares[0]-shares[1]).sum())))
    rows=[]; width=1; h,w=mask.shape
    while True:
        ph,pw = math.ceil(h/width)*width, math.ceil(w/width)*width
        padded=np.zeros((2,ph,pw)); padded[:,:h,:w]=shares
        blocks=padded.reshape(2,ph//width,width,pw//width,width).sum(axis=(2,4))
        means=blocks.mean(axis=0); keep=means>0
        cvs=(blocks[:,keep].std(axis=0,ddof=1)/means[keep]) if keep.any() else np.array([])
        rows.append({'scale_km':width*CELL_M/1000,'scale_km_normalised':width*CELL_M/1000/math.sqrt(area_km2),
                     'mean_cv':float(cvs.mean()) if len(cvs) else 0.,'n_blocks':int(len(cvs))})
        if width >= max(h,w): break
        width=min(width*2,max(h,w))
    resolution=next((row['scale_km'] for row in rows if row['mean_cv']<tolerance),rows[-1]['scale_km'])
    return {'dispersion':rows[0]['mean_cv'],'resolution':resolution,'allocationSimilarity':similarity,
            'sourceAvailability':1.,'complete':True,'curve':rows}


def compute_report():
    from pyproj import Geod
    from shapely.geometry import shape
    world=json.loads(MAP.read_text())
    dhs=set(json.loads((HERE/'data/dhs.json').read_text()))
    features=[f for f in world['features'] if f.get('id') in dhs]
    layers=mirca_layers()
    definitions={'precipitation':('Precipitation',['ERA5-Land','CHIRPS']),
                 'cropland_extent':('Cropland extent',['ESA CCI LC','MIRCA-OS']),
                 'irrigated_area_extent':('Irrigated area extent',['ESA CCI LC','MIRCA-OS'])}
    variables={key:{'name':name,'products':products,'metrics':{}} for key,(name,products) in definitions.items()}
    curves=[]; scale_rows=[]; resolution_rows=[]
    geod=Geod(ellps='WGS84')
    for year in YEARS:
        precipitation=precipitation_sources(year)
        mirca_total,mirca_irrigated=mirca_sources(layers,year)
        for index,feature in enumerate(features,1):
            iso=feature['id']; transform,mask=target_grid(feature['geometry'])
            area=abs(geod.geometry_area_perimeter(shape(feature['geometry']))[0])/1e6
            pairs={'precipitation':precipitation_grids(precipitation,transform,mask),
                   'cropland_extent':(esa_grid(year,{10,11,12,20},feature['geometry'],transform,mask),mirca_grid(mirca_total,transform,mask)),
                   'irrigated_area_extent':(esa_grid(year,{20},feature['geometry'],transform,mask),mirca_grid(mirca_irrigated,transform,mask))}
            for key,pair in pairs.items():
                metric=comparison_metrics(*pair,mask,area)
                curve=metric.pop('curve'); exactness='exact' if key=='precipitation' else 'approximate'
                metric.update(products=definitions[key][1],nProducts=2,crosswalkExactness=exactness)
                variables[key]['metrics'].setdefault(iso,{})[str(year)]=metric
                curves.append({'country_iso3':iso,'variable':key,'year':year,'curve':curve})
                for row in curve: scale_rows.append({'country_iso3':iso,'variable':key,'year':year,'products':' vs '.join(definitions[key][1]),'n_products':2,'crosswalk_exactness':exactness,**row})
                resolution_rows.append({'country_iso3':iso,'variable':key,'year':year,'tolerance':TOLERANCE,'effective_resolution_km':metric['resolution'],'dispersion_at_native_cell':metric['dispersion'],'allocation_similarity':metric['allocationSimilarity'],'crosswalk_exactness':exactness})
            print(f'Computed hydro metrics {year}: {index}/{len(features)} {iso}',flush=True)
    aggregate = {'name': 'Hydrology overall', 'products': ['Precipitation', 'Cropland extent', 'Irrigated area extent'], 'metrics': {}}
    for iso in sorted({iso for value in variables.values() for iso in value['metrics']}):
        for year in YEARS:
            components = [value['metrics'].get(iso, {}).get(str(year)) for value in variables.values()]
            components = [value for value in components if value]
            complete = [value for value in components if value['complete']]
            availability = [value['sourceAvailability'] for value in components if value['sourceAvailability'] is not None]
            def average(field):
                values = [value[field] for value in complete if value[field] is not None]
                return sum(values) / len(values) if values else None
            aggregate['metrics'].setdefault(iso, {})[str(year)] = {
                'dispersion': average('dispersion'), 'resolution': max((value['resolution'] for value in complete if value['resolution'] is not None), default=None),
                'allocationSimilarity': average('allocationSimilarity'),
                'sourceAvailability': sum(availability) / len(availability) if availability else None,
                'complete': bool(complete), 'nComponents': len(complete), 'nExpectedComponents': len(variables),
                'crosswalkExactness': 'approximate'
            }
    report={'schemaVersion':1,'status':'available','reason':'Independent map streams compared as country-normalised spatial shares.',
            'defaultMetric':'dispersion','variableOrder':list(definitions),'variables':variables,'aggregate':aggregate,
            'excluded':{'rainfed_area_extent':'ESA CCI Medium Resolution Land Cover has no defensible rainfed class.'},
            'meta':{'years':list(YEARS),'tolerance':TOLERANCE,'cellKm':CELL_M/1000,'countryCount':len(features)}}
    write_json(OUT/'hydro_report.json',report); write_json(OUT/'country_curves.json',curves)
    for name,rows in [('dispersion_by_scale.csv',scale_rows),('effective_resolution.csv',resolution_rows)]:
        with (OUT/name).open('w',newline='') as handle:
            writer=csv.DictWriter(handle,fieldnames=list(rows[0]) if rows else [])
            if rows: writer.writeheader(); writer.writerows(rows)
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--years', default='2000,2010,2015')
    parser.add_argument('--months', default='01,02,03,04,05,06,07,08,09,10,11,12',
                        help='comma-separated calendar months; each CDS request is one year-month')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--esa-tile-batch', type=int, default=4,
                        help='maximum uncached ESA CCI tiles to fetch per year in one run')
    parser.add_argument('--prepare-only', action='store_true', help='write contracts without network requests')
    parser.add_argument('--compute-only', action='store_true', help='compute from a complete warm cache without network access')
    args = parser.parse_args()
    years = tuple(int(value) for value in args.years.split(','))
    if any(year not in YEARS for year in years):
        raise ValueError('Hydro comparisons support only the agreed years 2000, 2010, 2015')
    months = tuple(int(value) for value in args.months.split(','))
    if not months or any(month < 1 or month > 12 for month in months):
        raise ValueError('months must be between 01 and 12')
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'stream_inventory.json').write_text(json.dumps(single_stream_inventory(), indent=2) + '\n')
    contract = {'comparisons': ['precipitation: ERA5-Land vs CHIRPS', 'cropland_extent: ESA CCI LC vs MIRCA',
                                'irrigated_area_extent: ESA CCI LC class 20 vs MIRCA irrigated area'],
                'cci_cropland_classes': [10, 11, 12, 20], 'cci_irrigated_class': [20],
                'cci_excluded_mosaic_classes': [30, 40], 'years': years, 'months': months,
                'era5_resolution_note': '0.1 degree output is approximately 9 km land simulation driven by approximately 31 km ERA5 forcing.'}
    (OUT / 'contract.json').write_text(json.dumps(contract, indent=2) + '\n')
    if args.prepare_only:
        return
    if args.compute_only:
        report=compute_report()
        print(f"Wrote hydro calculations for {report['meta']['countryCount']} countries.")
        return
    cache = Cache(RAW, args.offline)
    mirca_inputs(cache)
    for year in years:
        esa_cci(cache, year, args.esa_tile_batch)
        for month in months:
            era5(cache, year, month)
            chirps(cache, year, month)
    print('ERA5-Land, CHIRPS, ESA CCI and MIRCA source inputs are cached or audit-registered.')
    complete=all(len(list(RAW.glob(f'esa-cci-mrlc-{year}-*.tif')))==32 for year in YEARS)
    if years==YEARS and months==tuple(range(1,13)) and complete:
        report=compute_report()
        print(f"Wrote hydro calculations for {report['meta']['countryCount']} countries.")


if __name__ == '__main__':
    main()
