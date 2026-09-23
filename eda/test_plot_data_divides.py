"""Verify figure denominators, scope, and normalization without plotting dependencies."""

import unittest

from plot_data_divides import analyse


class FigureAnalysisTests(unittest.TestCase):
    def fixture(self):
        datasets = {}
        for key, domain, records in [
            ("ecology", "Ecology", {"AAA": {"2000": 1000, "2001": 0}, "BBB": {"2000": 4000}}),
            ("agriculture", "Agriculture", {"AAA": {"2001": 500}}),
            ("dhs", "Public Health", {"AAA": {"2000": 1}, "BBB": {"2001": 1}}),
        ]:
            datasets[key] = {"name": key, "domain": domain, "records": records,
                             "unit": "surveys" if key == "dhs" else "records", "url": "https://example.org"}
        bundle = {"datasets": datasets, "meta": {
            "datasetOrder": list(datasets), "categoryOrder": ["Ecology", "Agriculture", "Public Health"],
            "scopeDatasets": ["dhs"], "yearMin": 2000, "yearMax": 2001,
        }}
        world = {"features": [{"id": iso, "properties": {"name": iso, "areaKm2": area}}
                               for iso, area in [("AAA", 1_000_000), ("BBB", 2_000_000)]]}
        return bundle, world

    def test_source_presence_does_not_pool_incompatible_counts(self):
        result = analyse(*self.fixture())
        self.assertEqual(result["sourceCountries"], {"ecology": 2, "agriculture": 1, "dhs": 2})
        self.assertEqual(result["annualSourceCountries"]["dhs"], [1, 1])
        self.assertEqual(result["activeYears"]["AAA"]["ecology"], 1)
        self.assertIsNone(result["intensity"]["BBB"]["agriculture"])

    def test_domains_must_overlap_in_the_same_country_and_year(self):
        bundle, world = self.fixture()
        result = analyse(bundle, world)
        self.assertEqual(result["breadth"]["AAA"], 3)
        self.assertEqual(result["allDomainCountryYears"], 0)
        bundle["datasets"]["agriculture"]["records"]["AAA"]["2000"] = 1
        result = analyse(bundle, world)
        self.assertEqual(result["allDomainCountryYears"], 1)
        self.assertEqual(result["countriesWithAllDomainOverlap"], 1)
        self.assertEqual([sum(row[i] for row in result["annualDomainCounts"]) for i in range(2)], [2, 2])

    def test_domain_presence_is_union_of_sources(self):
        bundle, world = self.fixture()
        bundle["datasets"]["another_ecology"] = dict(bundle["datasets"]["ecology"])
        bundle["meta"]["datasetOrder"].append("another_ecology")
        result = analyse(bundle, world)
        self.assertEqual(result["annualDomainCounts"], [[0, 0], [1, 2], [1, 0], [0, 0]])

    def test_subset_keeps_dashboard_density_reference_and_area_normalization(self):
        full = analyse(*self.fixture())
        subset = analyse(*self.fixture(), countries=["AAA"])
        self.assertEqual(subset["intensity"]["AAA"], full["intensity"]["AAA"])
        self.assertEqual(subset["densityMaxima"]["ecology"], 2000)
        self.assertLess(subset["intensity"]["AAA"]["ecology"], 1)
        self.assertEqual(full["intensity"]["BBB"]["ecology"], 1)

    def test_period_does_not_redefine_dhs_scope(self):
        result = analyse(*self.fixture(), year_from=2000, year_to=2000)
        self.assertEqual(set(result["countries"]), {"AAA", "BBB"})
        self.assertEqual(result["sourceCountries"]["dhs"], 1)
        self.assertEqual(result["years"], [2000])
        result = analyse(*self.fixture(), year_from=2001, year_to=2001)
        self.assertIsNone(result["intensity"]["AAA"]["ecology"])
        self.assertEqual(result["densityMaxima"]["ecology"], 0)

    def test_map_aggregates_use_precomputed_dispersion_not_record_counts(self):
        bundle, world = self.fixture()
        bundle["datasets"]["agriculture_maps"] = {
            "name": "Agricultural map support", "domain": "Agriculture",
            "records": {"AAA": {"2000": 99}}, "unit": "reporting admin units", "url": "https://example.org"
        }
        bundle["datasets"]["hydro_maps"] = {
            "name": "Hydrology map support", "domain": "Hydrology",
            "records": {"AAA": {"2000": 3}, "BBB": {"2000": 3}}, "unit": "map comparisons", "url": "https://example.org"
        }
        bundle["meta"]["datasetOrder"] += ["agriculture_maps", "hydro_maps"]
        bundle["meta"]["categoryOrder"].insert(2, "Hydrology")
        bundle["agriculture"] = {"aggregateMetrics": {"AAA": {"2000": {"dispersion": 0.4, "complete": True}}}}
        bundle["hydro"] = {"aggregate": {"metrics": {
            "AAA": {"2000": {"dispersion": 0.6, "complete": True}},
            "BBB": {"2000": {"dispersion": 0.8, "complete": True}},
        }}}
        result = analyse(bundle, world)
        self.assertNotIn("agriculture_maps", result["keys"])
        self.assertNotIn("hydro_maps", result["keys"])
        self.assertEqual(result["mapKeys"], ["agriculture_maps", "hydro_maps"])
        self.assertEqual(result["mapSummary"]["agriculture_maps"]["AAA"], 0.4)
        self.assertIsNone(result["mapSummary"]["agriculture_maps"]["BBB"])
        self.assertEqual(result["mapSummary"]["hydro_maps"]["BBB"], 0.8)

    def test_rejects_invalid_selections_areas_and_counts(self):
        for options in ({"year_from": 1999}, {"year_to": 2002}, {"year_from": 2001, "year_to": 2000},
                        {"countries": ["CCC"]}):
            with self.subTest(options=options), self.assertRaises(ValueError):
                analyse(*self.fixture(), **options)
        bundle, world = self.fixture()
        world["features"][0]["properties"]["areaKm2"] = 0
        with self.assertRaisesRegex(ValueError, "areaKm2"):
            analyse(bundle, world)
        bundle, world = self.fixture()
        bundle["datasets"]["dhs"]["records"]["AAA"]["2000"] = -1
        with self.assertRaisesRegex(ValueError, "non-negative integer"):
            analyse(bundle, world)


if __name__ == "__main__":
    unittest.main()
