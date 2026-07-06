#!/usr/bin/env python3
"""
Armenian cadastre client.

Fetches parcel boundary polygons by cadastral code from the open, unauthenticated
proxy at map.astat.am, which in turn queries the official State Cadastre Committee
map (e-cadastre.am / maparmenia.am).

Endpoint (verified working, no auth / no cookies / no CSRF token required):
    GET https://map.astat.am/Map/Home/GetCadastralPolygon?cadastralCode=RR-BBB-SSSS-UUUU

Response (200, application/json):
    success  -> {"success": true,  "coords": [[lat, lng], ...]}
    notfound -> {"success": false, "message": "Cadastral code not found on"}
    bad code -> empty body (server exception)

Note: coords are returned as [latitude, longitude] pairs (note the order),
in WGS84 (EPSG:4326). Since a recent portal change the cadastre map returns the
parcel's central point; the polygon here is an approximate outline slightly
offset from the true legal boundary.

Usage:
    python cadastre_client.py 01-001-0658-0020 01-001-0658-0017 01-001-0658-0021
    python cadastre_client.py --geojson 01-001-0658-0020 > parcels.geojson
"""

import argparse
import json
import sys
import time
import urllib.request
import urllib.parse

BASE = "https://map.astat.am/Map/Home/GetCadastralPolygon"
CODE_RE = None  # format check kept loose; server is the source of truth


def get_polygon(code, timeout=15, retries=2):
    """Return {'code', 'success', 'coords'|None, 'message'|None} for one cadastral code."""
    url = BASE + "?" + urllib.parse.urlencode({"cadastralCode": code})
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={
                "Accept": "application/json",
                "User-Agent": "cadastre-client/1.0",
            })
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode("utf-8").strip()
            if not raw:
                return {"code": code, "success": False,
                        "coords": None, "message": "empty response (malformed code?)"}
            data = json.loads(raw)
            return {
                "code": code,
                "success": bool(data.get("success")),
                "coords": data.get("coords"),
                "message": data.get("message"),
            }
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(0.5 * (attempt + 1))
    return {"code": code, "success": False, "coords": None,
            "message": f"request failed: {last_err}"}


def to_geojson(results):
    """Convert a list of get_polygon() results into a GeoJSON FeatureCollection.

    GeoJSON requires [lng, lat] order and a closed ring, so we swap and close here.
    """
    features = []
    for r in results:
        if not r.get("success") or not r.get("coords"):
            continue
        ring = [[lng, lat] for lat, lng in r["coords"]]
        if ring and ring[0] != ring[-1]:
            ring.append(ring[0])  # close the ring
        features.append({
            "type": "Feature",
            "properties": {"cadastralCode": r["code"]},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        })
    return {"type": "FeatureCollection", "features": features}


def main():
    ap = argparse.ArgumentParser(description="Fetch Armenian cadastral parcel polygons by code.")
    ap.add_argument("codes", nargs="+", help="Cadastral codes, e.g. 01-001-0658-0020")
    ap.add_argument("--geojson", action="store_true", help="Emit a GeoJSON FeatureCollection")
    ap.add_argument("--delay", type=float, default=0.3, help="Seconds between requests (politeness)")
    args = ap.parse_args()

    results = []
    for i, code in enumerate(args.codes):
        if i:
            time.sleep(args.delay)
        results.append(get_polygon(code))

    if args.geojson:
        print(json.dumps(to_geojson(results), ensure_ascii=False, indent=2))
        return

    for r in results:
        if r["success"]:
            print(f"{r['code']}: {len(r['coords'])} vertices  first={r['coords'][0]}")
        else:
            print(f"{r['code']}: FAILED - {r['message']}", file=sys.stderr)


if __name__ == "__main__":
    main()
