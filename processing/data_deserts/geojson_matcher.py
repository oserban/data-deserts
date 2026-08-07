"""Shared GeoJSON loading and point-to-country matching for data pipelines."""

import json
import math
from collections import defaultdict
from functools import lru_cache


DEFAULT_GRID_SIZE = 5


def load_geojson(path):
    """Load and return a GeoJSON document from ``path``."""
    with open(path, encoding="utf-8") as source:
        return json.load(source)


def polygon_parts(geometry):
    """Yield polygon ring collections from Polygon or MultiPolygon geometry."""
    if geometry["type"] == "Polygon":
        yield geometry["coordinates"]
    elif geometry["type"] == "MultiPolygon":
        yield from geometry["coordinates"]


def point_in_ring(lon, lat, ring):
    """Return whether a longitude/latitude point is inside a GeoJSON ring."""
    inside = False
    previous = len(ring) - 1
    for current, (x_current, y_current) in enumerate(ring):
        x_previous, y_previous = ring[previous]
        if ((y_current > lat) != (y_previous > lat) and
                lon < (x_previous - x_current) * (lat - y_current) /
                (y_previous - y_current) + x_current):
            inside = not inside
        previous = current
    return inside


class CountryMatcher:
    """Match coordinates to GeoJSON feature IDs using a coarse spatial index."""

    def __init__(self, geojson, grid_size=DEFAULT_GRID_SIZE):
        if grid_size <= 0:
            raise ValueError("grid_size must be positive")
        self.grid_size = grid_size
        self.polygons = []
        self.grid = defaultdict(list)
        for feature in geojson["features"]:
            country_id = str(feature["id"])
            for rings in polygon_parts(feature["geometry"]):
                outer = rings[0]
                xs = [point[0] for point in outer]
                ys = [point[1] for point in outer]
                bbox = (min(xs), min(ys), max(xs), max(ys))
                polygon_index = len(self.polygons)
                self.polygons.append((country_id, rings, bbox))
                min_col = math.floor(bbox[0] / grid_size)
                max_col = math.floor(bbox[2] / grid_size)
                min_row = math.floor(bbox[1] / grid_size)
                max_row = math.floor(bbox[3] / grid_size)
                for col in range(min_col, max_col + 1):
                    for row in range(min_row, max_row + 1):
                        self.grid[(col, row)].append(polygon_index)

    @classmethod
    def from_file(cls, path, grid_size=DEFAULT_GRID_SIZE):
        """Build a matcher directly from a GeoJSON file."""
        return cls(load_geojson(path), grid_size=grid_size)

    @lru_cache(maxsize=250_000)
    def country_at(self, lon, lat):
        """Return the containing feature ID, or ``None`` outside all polygons."""
        cell = (math.floor(lon / self.grid_size), math.floor(lat / self.grid_size))
        for polygon_index in self.grid.get(cell, ()):
            country_id, rings, (min_x, min_y, max_x, max_y) = self.polygons[polygon_index]
            if not (min_x <= lon <= max_x and min_y <= lat <= max_y):
                continue
            if point_in_ring(lon, lat, rings[0]) and not any(
                    point_in_ring(lon, lat, hole) for hole in rings[1:]):
                return country_id
        return None
