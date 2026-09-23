"""GRDC observation validity, station/year deduplication, and build provenance."""

import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock
import zipfile

from build_data import load_grdc_coverage, restrict_to_dhs_timeline
from fetch_grdc import COUNTING_METHOD, UNIT, input_paths, merge_station, read_station, station_counts, station_files


def export(rows, columns="YYYY-MM-DD;hh:mm; Value", resolution="DAILY", station_id="1234567"):
    return (
        "# Title: GRDC STATION DATA FILE\n# missing values are indicated by -999.000\n"
        f"# GRDC-No.: {station_id}\n# Station: Example\n# Country: KE\n"
        "# Latitude (DD): 0.2\n# Longitude (DD): 37.2\n"
        f"# Data Set Content: MEAN {resolution} DISCHARGE (Q)\n"
        f"# Time series: 1980 - 2026\n# Data lines: {len(rows)}\n# DATA\n{columns}\n"
        + "\n".join(rows) + "\n"
    )


class GrdcTests(unittest.TestCase):
    def parse(self, rows, **kwargs):
        return read_station(io.StringIO(export(rows, **kwargs)))

    def test_zero_flow_counts_and_gaps_are_not_filled_from_header(self):
        station = self.parse(["2000-01-01;--:--;0", "2001-01-01;--:--; -999.000",
                              "2002-01-01;--:--;nan", "2003-01-01;--:--;inf", "2004-01-01;--:--;10"])
        self.assertEqual(station["years"], [2000, 2004])
        self.assertEqual(station["rowCounts"]["missingRows"], 3)

    def test_finite_signed_flow_is_not_mistaken_for_missing(self):
        self.assertEqual(self.parse(["2000-01-01;--:--; -2.5"])["years"], [2000])

    def test_daily_legacy_flags_exclude_not_recommended_observations(self):
        station = self.parse(["2000-01-01;--:--; 1;2;99.000", "2001-01-01;--:--; -999;0;-999"],
                             columns="YYYY-MM-DD;hh:mm; Original; Calculated; Flag")
        self.assertEqual(station["years"], [2001])
        self.assertEqual(station["rowCounts"]["excludedFlagRows"], 1)

    def test_monthly_percentage_99_is_valid_and_original_can_supply_coverage(self):
        station = self.parse(["2000-01-00;--:--; -999;2;99", "2001-02;--:--; 4;-999;0"],
                             columns="YYYY-MM-DD;hh:mm; Original; Calculated; Flag", resolution="MONTHLY")
        self.assertEqual(station["years"], [2000, 2001])

    def test_daily_monthly_and_repeated_files_count_station_year_once(self):
        stations, matcher = {}, Mock()
        matcher.country_at.return_value = "KEN"
        daily = self.parse(["2000-01-01;--:--;1", "2000-01-02;--:--;2"])
        monthly = self.parse(["2000-02-00;--:--;1", "2001-01-00;--:--;1"], resolution="MONTHLY")
        self.assertEqual(merge_station(stations, daily, matcher), 0)
        self.assertEqual(merge_station(stations, daily, matcher), 1)
        self.assertEqual(merge_station(stations, monthly, matcher), 1)
        other = self.parse(["2000-01-01;--:--;1"], station_id="7654321")
        merge_station(stations, other, matcher)
        self.assertEqual(station_counts(stations), {"KEN": {"2000": 2, "2001": 1}})

    def test_unmapped_stations_remain_in_audit_not_country_counts(self):
        stations, matcher = {}, Mock()
        matcher.country_at.return_value = None
        merge_station(stations, self.parse(["2000-01-01;--:--;1"]), matcher)
        self.assertEqual(station_counts(stations), {})
        self.assertEqual(len(stations), 1)

    def test_conflicting_station_locations_are_rejected(self):
        stations, matcher = {}, Mock()
        matcher.country_at.return_value = "KEN"
        station = self.parse(["2000-01-01;--:--;1"])
        merge_station(stations, station, matcher)
        station["latitude"] += 1
        with self.assertRaisesRegex(ValueError, "Conflicting location"):
            merge_station(stations, station, matcher)

    def test_rejects_bad_dates_values_truncation_and_location_only_input(self):
        for row in ["2000-02-30;--:--;1", "2000-01-01;--:--;broken", "2000-01-01;1"]:
            with self.subTest(row=row), self.assertRaises(ValueError):
                self.parse([row])
        with self.assertRaisesRegex(ValueError, "Truncated"):
            read_station(io.StringIO(export(["2000-01-01;--:--;1"]).replace("Data lines: 1", "Data lines: 2")))
        with self.assertRaisesRegex(ValueError, "time-series"):
            read_station(io.StringIO("No,grdc_no,newlat,newlon,Area,Categorie\n"))

    def test_archive_reader_ignores_boundaries_without_extracting_them(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.zip"
            with zipfile.ZipFile(path, "w") as archive:
                archive.writestr("stationbasins.geojson", "not needed")
                archive.writestr("nested/1234567_Q_Day.Cmd.txt", export(["2000-01-01;--:--;1"]))
            self.assertEqual(input_paths([directory, path]), [path.resolve()])
            results = [read_station(stream) for _, stream in station_files(path)]
            self.assertEqual(results[0]["years"], [2000])
            self.assertEqual(list(Path(directory).iterdir()), [path])

    def test_build_validates_station_year_evidence_and_preserves_dhs_cutoff(self):
        report = {"_meta": {"schemaVersion": 1, "unit": UNIT, "countingMethod": COUNTING_METHOD,
                            "stationYears": 2},
                  "stations": [{"stationId": "1234567", "iso3": "KEN", "years": [1980, 2000]}]}
        records = {"KEN": {"1980": 1, "2000": 1}}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "report.json"
            path.write_text(json.dumps(report))
            self.assertEqual(load_grdc_coverage(path, records)["minimumObservationsPerYear"], 1)
            with self.assertRaisesRegex(ValueError, "do not match"):
                load_grdc_coverage(path, {"KEN": {"1980": 1, "2000": 2}})
            report["stations"].append(report["stations"][0])
            path.write_text(json.dumps(report))
            with self.assertRaisesRegex(ValueError, "Duplicate"):
                load_grdc_coverage(path, records)
        datasets = {"dhs": {"records": {"KEN": {"1985": 1}}}, "grdc": {"records": records}}
        restrict_to_dhs_timeline(datasets)
        self.assertEqual(datasets["grdc"]["records"], {"KEN": {"2000": 1}})


if __name__ == "__main__":
    unittest.main()
