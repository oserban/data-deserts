#!/usr/bin/env python3
"""Parse local GRDC exports into country/year counts of observed station-years.

Defaults to all ZIPs in processing/data/raw/grdc. Also accepts a directory,
individual GRDC text exports, or repeated --input paths. Raw discharge values
are never exported. Each station contributes once per year with at least one
finite, non-missing observation, including zero flow. Daily/monthly files and
overlapping archives are merged by station ID and actual observation year.
"""

import argparse
import csv
from datetime import date, datetime, timezone
import hashlib
import io
import json
import math
from pathlib import Path
import re
import zipfile
from collections import Counter, defaultdict

from data_deserts import CountryMatcher


HERE = Path(__file__).resolve().parent
DEFAULT_INPUT = HERE / "data/raw/grdc"
DEFAULT_OUTPUT = HERE / "data/grdc.json"
DEFAULT_REPORT = HERE / "data/grdc_report.json"
SOURCE_URL = "https://portal.grdc.bafg.de/applications/public.html?publicuser=PublicUser#dataDownload/Home"
UNIT = "station-years"
COUNTING_METHOD = "distinct-station-id-observation-year-v1"


def read_station(stream):
    """Read GRDC ASCII metadata and actual daily/monthly observation rows.

    Supports current Value exports and legacy Original/Calculated columns.
    Monthly Calculated values are preferred, with Original as a fallback.
    Daily flag 99 means usage is not recommended; monthly flags are percentages.
    """
    metadata = {}
    missing = None
    columns = None
    for line in stream:
        text = line.strip().lstrip("\ufeff")
        if not text:
            continue
        if not text.startswith("#"):
            columns = [value.strip().lower() for value in next(csv.reader([text], delimiter=";"))]
            break
        text = text.lstrip("#").strip()
        sentinel = re.search(r"missing values are indicated by\s+([-+\d.eE]+)", text, re.I)
        if sentinel:
            missing = float(sentinel.group(1))
        if ":" in text:
            key, value = text.split(":", 1)
            metadata[key.strip().lower()] = value.strip()
    if columns is None or columns[0] != "yyyy-mm-dd":
        raise ValueError("Expected a GRDC time-series header, not a station catalogue or statistics file")
    station_id = metadata.get("grdc-no.", "")
    if not station_id.isdigit():
        raise ValueError("Missing or invalid GRDC-No.")
    content = metadata.get("data set content", "").upper()
    if "MEAN DAILY DISCHARGE" in content:
        resolution = "daily"
    elif "MEAN MONTHLY DISCHARGE" in content:
        resolution = "monthly"
    else:
        raise ValueError("Only daily/monthly mean discharge exports are supported")
    if missing is None or not math.isfinite(missing):
        raise ValueError("Missing or invalid GRDC missing-value declaration")
    latitude = next((v for k, v in metadata.items() if k.startswith("latitude")), None)
    longitude = next((v for k, v in metadata.items() if k.startswith("longitude")), None)
    try:
        lat, lon = float(latitude), float(longitude)
    except (TypeError, ValueError) as error:
        raise ValueError("Missing or invalid station coordinates") from error
    if not math.isfinite(lat) or not math.isfinite(lon) or not (-90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Station coordinates are outside geographic bounds")
    value_columns = [columns.index(key) for key in ("value", "calculated", "original") if key in columns]
    if not value_columns:
        raise ValueError("Missing Value or Original/Calculated observation columns")
    flag_column = columns.index("flag") if "flag" in columns else None
    years = set()
    counters = Counter()
    for row in csv.reader(stream, delimiter=";"):
        if not row or not any(cell.strip() for cell in row):
            continue
        counters["rows"] += 1
        if len(row) != len(columns):
            raise ValueError(f"Malformed row {counters['rows']} for station {station_id}")
        stamp = row[0].strip()
        if resolution == "monthly" and re.fullmatch(r"\d{4}-\d{2}(?:-00)?", stamp):
            stamp = stamp[:7] + "-01"
        try:
            observation_date = date.fromisoformat(stamp)
        except ValueError as error:
            raise ValueError(f"Invalid observation date {stamp!r} for station {station_id}") from error
        flag = row[flag_column].strip() if flag_column is not None else ""
        if resolution == "daily" and flag and float(flag) == 99:
            counters["excludedFlagRows"] += 1
            continue
        valid = False
        for index in value_columns:
            text = row[index].strip()
            if not text:
                continue
            try:
                value = float(text)
            except ValueError as error:
                raise ValueError(f"Invalid discharge value on {stamp} for station {station_id}") from error
            if math.isfinite(value) and value != missing:
                valid = True
                break
        if valid:
            years.add(observation_date.year)
            counters["validRows"] += 1
        else:
            counters["missingRows"] += 1
    declared = metadata.get("data lines")
    if declared is not None and int(declared) != counters["rows"]:
        raise ValueError(f"Truncated export for station {station_id}: expected {declared} rows, read {counters['rows']}")
    return {
        "stationId": station_id, "name": metadata.get("station", ""),
        "sourceCountry": metadata.get("country", ""), "latitude": lat, "longitude": lon,
        "resolution": resolution, "years": sorted(years), "rowCounts": dict(counters),
    }


def input_paths(inputs):
    paths = set()
    for raw in inputs:
        path = Path(raw).resolve()
        if path.is_dir():
            paths.update(p for p in path.rglob("*") if p.is_file() and p.suffix.lower() in (".zip", ".txt"))
        elif path.is_file() and path.suffix.lower() in (".zip", ".txt"):
            paths.add(path)
        else:
            raise ValueError(f"GRDC input is not a ZIP, text file or directory: {path}")
    if not paths:
        raise ValueError("No GRDC ZIP or text files found; download GRDC Export Format time series first")
    return sorted(paths)


def station_files(path):
    """Stream text members without extracting the large catchment GeoJSON files."""
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            members = [item for item in archive.infolist() if not item.is_dir()
                       and item.filename.lower().endswith(".txt")
                       and not item.filename.startswith("__MACOSX/")]
            if not members:
                raise ValueError(f"No GRDC text exports in {path.name}")
            for member in members:
                with archive.open(member) as raw, io.TextIOWrapper(raw, encoding="latin-1") as stream:
                    yield member.filename, stream
    else:
        with path.open(encoding="latin-1") as stream:
            yield path.name, stream


def merge_station(stations, station, matcher):
    station_id = station["stationId"]
    iso = matcher.country_at(station["longitude"], station["latitude"])
    iso = None if iso == "-99" else iso
    existing = stations.get(station_id)
    if existing is None:
        existing = {key: station[key] for key in ("stationId", "name", "sourceCountry", "latitude", "longitude")}
        existing.update(iso3=iso, years=set(), resolutions=set(), files=0)
        stations[station_id] = existing
    elif (existing["iso3"] != iso or existing["sourceCountry"] != station["sourceCountry"]
          or any(not math.isclose(existing[k], station[k], abs_tol=0.001) for k in ("latitude", "longitude"))):
        raise ValueError(f"Conflicting location metadata for GRDC station {station_id}")
    overlapping = len(existing["years"].intersection(station["years"]))
    existing["years"].update(station["years"])
    existing["resolutions"].add(station["resolution"])
    existing["files"] += 1
    return overlapping


def station_counts(stations):
    records = defaultdict(Counter)
    for station in stations.values():
        if station["iso3"] is not None:
            for year in station["years"]:
                records[station["iso3"]][str(year)] += 1
    return {iso: dict(sorted(years.items())) for iso, years in sorted(records.items())}


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    temporary.replace(path)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", action="append", type=Path, help="ZIP, directory or GRDC text file; repeatable")
    parser.add_argument("--boundaries", type=Path, default=HERE / "data/world.raw.geojson")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT)
    args = parser.parse_args(argv)
    try:
        paths = input_paths(args.input or [DEFAULT_INPUT])
        matcher = CountryMatcher.from_file(args.boundaries)
        stations, inputs, totals = {}, [], Counter()
        for path in paths:
            with path.open("rb") as stream:
                checksum = hashlib.file_digest(stream, "sha256").hexdigest()
            files = 0
            for name, stream in station_files(path):
                try:
                    station = read_station(stream)
                    totals["overlappingStationYears"] += merge_station(stations, station, matcher)
                except ValueError as error:
                    raise ValueError(f"{path.name}/{name}: {error}") from error
                totals.update(station["rowCounts"])
                files += 1
                if files % 250 == 0:
                    print(f"{path.name}: {files} station files parsed", flush=True)
            totals["files"] += files
            inputs.append({"file": path.name, "sha256": checksum, "stationFiles": files})
            print(f"Completed {path.name}: {files} station files", flush=True)
        records = station_counts(stations)
        if not records:
            raise ValueError("No mapped station-years with valid observations; outputs were not replaced")
        audit = []
        for station_id in sorted(stations):
            station = stations[station_id]
            audit.append({**station, "years": sorted(station["years"]), "resolutions": sorted(station["resolutions"])})
        report = {
            "_meta": {
                "schemaVersion": 1, "unit": UNIT, "countingMethod": COUNTING_METHOD,
                "source": SOURCE_URL, "createdUtc": datetime.now(timezone.utc).isoformat(),
                "inputs": inputs, "rowCounts": dict(totals), "uniqueStations": len(stations),
                "unmappedStations": sum(s["iso3"] is None for s in audit),
                "stationsWithoutObservations": sum(not s["years"] for s in audit),
                "stationYears": sum(sum(y.values()) for y in records.values()),
            },
            "stations": audit,
        }
        write_json(args.report, report)
        write_json(args.output, records)
        print(f"Wrote {report['_meta']['stationYears']:,} station-years across {len(records)} countries; "
              f"{report['_meta']['unmappedStations']} stations outside mapped polygons. Raw discharge values are not exported.")
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f"GRDC: {error}\n")


if __name__ == "__main__":
    main()
