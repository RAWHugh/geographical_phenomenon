"""Prepare the static geography datasets. See docs/technical-design.md."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
import json
from pathlib import Path
from tempfile import gettempdir
from urllib.parse import urlencode

from netCDF4 import Dataset
import numpy as np
import requests
from scipy.interpolate import RegularGridInterpolator
from shapely.geometry import LineString


OUTPUT = Path(__file__).resolve().parents[1] / "public" / "data"
NOAA = "https://psl.noaa.gov/thredds/fileServer/Datasets/ncep.reanalysis/Monthlies"
DRIFTER = "https://erddap.aoml.noaa.gov/gdp/erddap/griddap/drifter_monthlymeans.nc"
ETOPO = "https://oceanwatch.pifsc.noaa.gov/erddap/griddap/ETOPO_2022_v1_60s.nc"
GPLATES = "https://gws.gplates.org"
AGES = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0]
LEVELS = [1000, 925, 850, 700, 600, 500, 400, 300, 250, 200, 150, 100]
PROVENANCE = {
    "ocean": {
        "attribution": "NOAA/AOML Global Drifter Program & University of Miami; Laurindo et al. (2017)",
        "release": "3.10; observations through 2023-02-28",
        "license": "https://creativecommons.org/licenses/by/4.0/",
    },
    "atmosphere": {
        "attribution": "NOAA Physical Sciences Laboratory, NOAA NCEP/NCAR Reanalysis 1",
        "release": "1991–2020 monthly long-term means",
        "usage": "https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html",
    },
    "climate": {
        "attribution": "NOAA Physical Sciences Laboratory (NCEP/NCAR R1); NOAA NCEI (ETOPO 2022)",
        "release": "1991–2020 monthly long-term means; ETOPO 2022 v1 ice surface",
        "usage": "https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html",
        "elevation_license": "https://creativecommons.org/publicdomain/zero/1.0/",
    },
    "mountains": {
        "attribution": "EarthByte, Müller et al. (2019), via GPlates Web Service",
        "release": "MULLER2019; frames every 10 Ma from 100 Ma to present",
        "coordinates": "longitude, latitude in the MULLER2019 reconstruction frame",
        "license": "https://creativecommons.org/licenses/by-sa/4.0/",
    },
}


def ncep(group, variable):
    return f"{NOAA}/{group}/{variable}.mon.ltm.1991-2020.nc"


def reconstruction(path, age, **parameters):
    return f"{GPLATES}/{path}/?" + urlencode({"time": age, "model": "MULLER2019", **parameters})


def sources(topic):
    if topic == "ocean":
        subset = ",".join(name + "[0:11][2:4:1439][2:4:631]" for name in ("U", "V", "SST"))
        return {"drifter.nc": f"{DRIFTER}?{subset}"}
    if topic == "atmosphere":
        result = {f"{var}.nc": ncep("pressure", var) for var in ("uwnd", "vwnd", "omega")}
        return {**result, "pres.sfc.nc": ncep("surface_gauss", "pres.sfc")}
    if topic == "climate":
        return {
            "air.2m.nc": ncep("surface_gauss", "air.2m"),
            "prate.sfc.nc": ncep("surface_gauss", "prate.sfc"),
            "etopo.nc": f"{ETOPO}?z[60:120:10799][60:120:21599]",
        }
    return {
        f"{key}-{age}.json": reconstruction(path, age, **parameters)
        for age in AGES
        for key, path, parameters in [
            ("coast", "reconstruct/coastlines", {}),
            ("boundary", "topology/plate_boundaries", {}),
            ("points", "reconstruct/reconstruct_points", {"lons": "78,90", "lats": "22,32"}),
        ]
    }


def download(item, cache):
    name, url = item
    path = cache / name
    if not path.exists():
        for attempt in range(3):
            try:
                with requests.get(url, timeout=(15, 105)) as response:
                    response.raise_for_status()
                    path.write_bytes(response.content)
                break
            except requests.RequestException:
                if attempt == 2:
                    raise
    print(f"{name}: {path.stat().st_size:,} bytes", flush=True)
    return name, path


def array(data, name):
    return np.ma.asarray(data[name][:], dtype=float).filled(np.nan)


def grid_points(step):
    lon = np.arange(-180 + step / 2, 180, step)
    lat = np.arange(90 - step / 2, -90, -step)
    x, y = np.meshgrid(lon, lat)
    return np.stack([y, x], axis=-1)


def regrid(lat, lon, fields, step, method="linear", fill_value=np.nan):
    wrapped = (lon + 180) % 360 - 180
    order = np.argsort(wrapped)
    wrapped = wrapped[order]
    longitudes = np.r_[wrapped[-1] - 360, wrapped, wrapped[0] + 360]
    fields = fields[..., order]
    periodic = np.concatenate([fields[..., -1:], fields, fields[..., :1]], axis=-1)
    grid = grid_points(step)
    result = [
        RegularGridInterpolator((lat, longitudes), field, method=method, bounds_error=False, fill_value=fill_value)(grid)
        for field in periodic.reshape((-1, len(lat), len(longitudes)))
    ]
    return np.stack(result).reshape(fields.shape[:-2] + grid.shape[:2])


def grid_output(name, *parts):
    assert all(not np.isinf(part).any() and np.isfinite(part).any() for part in parts)
    filename = f"{name}.f32"
    with (OUTPUT / filename).open("wb") as target:
        for part in parts:
            target.write(np.asarray(part, dtype="<f4").tobytes())
    return filename


def ocean(files):
    with Dataset(files["drifter.nc"]) as data:
        if str(data.version) != "3.10":
            raise ValueError(f"Unexpected Global Drifter Program version {data.version}")
        assert list(data["ClimatologicalMonth"][:]) == list(range(12))
        fields = np.stack([array(data, name).transpose(0, 2, 1) for name in ("U", "V", "SST")], axis=1)
        output = regrid(array(data, "latitude"), array(data, "longitude"), fields, 1, "nearest")
    return grid_output("ocean", output)


def surface(files, filename, variable, step):
    with Dataset(files[filename]) as data:
        return regrid(array(data, "lat"), array(data, "lon"), array(data, variable), step), data[variable].units


def atmosphere(files):
    fields = {}
    for variable in ("uwnd", "vwnd", "omega"):
        with Dataset(files[f"{variable}.nc"]) as data:
            slots = [list(data["level"][:]).index(level) for level in LEVELS]
            fields[variable] = regrid(
                array(data, "lat"), array(data, "lon"), array(data, variable)[:, slots], 2.5
            )
    pressure, unit = surface(files, "pres.sfc.nc", "pres", 2.5)
    if unit.lower() in ("pa", "pascals"):
        pressure /= 100
    assert 900 < np.nanmax(pressure) < 1100
    above_ground = pressure[:, None] >= np.array(LEVELS)[None, :, None, None]
    u, v, omega = [np.where(above_ground, fields[name], np.nan) for name in fields]
    horizontal = np.stack([u[:, [2, 9]], v[:, [2, 9]]], axis=2)
    zonal_fields = []
    for field in (v, omega):
        count = np.isfinite(field).sum(axis=-1)
        zonal_fields.append(np.divide(np.nansum(field, axis=-1), count,
                                      out=np.full(count.shape, np.nan), where=count > 0))
    zonal = np.stack(zonal_fields, axis=1)
    return grid_output("atmosphere", horizontal, zonal)


def climate(files):
    temperature, unit = surface(files, "air.2m.nc", "air", 2)
    if unit.lower() in ("k", "degk", "degrees_k", "kelvin"):
        temperature -= 273.15
    assert -100 < np.nanmin(temperature) < -20 and 25 < np.nanmax(temperature) < 75
    rate, unit = surface(files, "prate.sfc.nc", "prate", 2)
    assert "/s" in unit
    days = np.array([31, 28.2666666667, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31])
    precipitation = np.maximum(rate, 0) * days[:, None, None] * 86400
    with Dataset(files["etopo.nc"]) as data:
        elevation = regrid(array(data, "latitude"), array(data, "longitude"), array(data, "z"), 2,
                           "nearest", fill_value=None)
    return grid_output("climate", np.stack([temperature, precipitation], axis=1), elevation)


def geometry_lines(geometry):
    kind = geometry["type"]
    coordinates = geometry.get("coordinates")
    if kind == "LineString":
        yield coordinates
    elif kind in ("MultiLineString", "Polygon"):
        yield from coordinates
    elif kind == "MultiPolygon":
        for polygon in coordinates:
            yield from polygon
    elif kind == "GeometryCollection":
        for item in geometry["geometries"]:
            yield from geometry_lines(item)


def compact_lines(path, tolerance):
    lines = []
    for feature in json.loads(path.read_bytes())["features"]:
        if feature["geometry"] is None:
            continue
        for line in geometry_lines(feature["geometry"]):
            if len(line) < 2:
                continue
            lon, lat = np.asarray(line)[:, :2].T
            continuous = np.rad2deg(np.unwrap(np.deg2rad(lon)))
            simplified = LineString(np.column_stack([continuous, lat])).simplify(tolerance)
            coords = [[round((x + 180) % 360 - 180, 3), round(y, 3)] for x, y in simplified.coords]
            if len(set(map(tuple, coords))) > 1:
                lines.append(coords)
    assert lines, path
    return lines


def mountains(files):
    frames = []
    for age in AGES:
        points = json.loads(files[f"points-{age}.json"].read_bytes())["coordinates"]
        assert len(points) == 2 and all(len(point) == 2 for point in points)
        frames.append({
            "age": age,
            "coasts": compact_lines(files[f"coast-{age}.json"], 0.22),
            "boundaries": compact_lines(files[f"boundary-{age}.json"], 0.28),
            "india": points[0],
            "eurasia": points[1],
        })
    filename = "mountains.json"
    (OUTPUT / filename).write_text(json.dumps(frames, separators=(",", ":")), encoding="utf-8")
    return filename


def main():
    builders = {fn.__name__: fn for fn in (ocean, atmosphere, climate, mountains)}
    parser = argparse.ArgumentParser()
    parser.add_argument("topics", nargs="*", metavar="TOPIC")
    parser.add_argument("--cache", type=Path, default=Path(gettempdir()) / "geography-topic-sources")
    args = parser.parse_args()
    for topic in args.topics:
        if topic not in builders:
            parser.error(f"unknown topic: {topic}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    args.cache.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / "manifest.json"
    manifest = json.loads(path.read_bytes()) if path.exists() else {}
    for topic in args.topics or builders:
        urls = sources(topic)
        with ThreadPoolExecutor(max_workers=6) as pool:
            files = dict(pool.map(lambda item: download(item, args.cache), urls.items()))
        filename = builders[topic](files)
        payload = (OUTPUT / filename).read_bytes()
        manifest[topic] = {
            "file": filename,
            "bytes": len(payload),
            "sha256": sha256(payload).hexdigest(),
            "coordinates": "OGC:CRS84",
            **PROVENANCE[topic],
            "sources": [
                {"url": url, "sha256": sha256(files[name].read_bytes()).hexdigest()}
                for name, url in urls.items()
            ],
        }
        path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        print(f"{filename}: {len(payload):,} bytes", flush=True)


if __name__ == "__main__":
    main()
