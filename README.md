# e-cadaster

Interactive map of Armenian cadastral parcels — plot parcels by cadastral code over
OpenStreetMap, with official boundaries, areas and measurements.

**Live:** https://gagikh.github.io/ecadaster/

| File | Purpose |
|------|---------|
| `index.html` | The whole app (HTML + JS, no build step). |
| `worker/cadastre-worker.js` | Cloudflare Worker — proxy to the official cadastre. |

## Features

- Plot many cadastral codes at once, each in its own colour
- Official parcel **boundaries** and **area** straight from the cadastre
- Optional area / edge-length labels; adjustable fill opacity
- Official cadastre layers (parcels, labels, buildings) + 10 basemaps
- Shareable links (full state in the URL) with Back/Forward history
- Geolocation, Armenian / English / Russian UI

---

# The official API, reverse-engineered

The government map is an **ARPIS / Geofoto geoportal** (ExtJS 3.4 + OpenLayers) at
`gp.e-cadastre.am:8443/arpis-geoportal`, backed by GeoServer and an Oracle database.

## Access: anonymous

**No login, no credentials, no session.** The servlets serve anyone whose `Referer`
looks like the geoportal with a numeric uid — and **`uid=0` (anonymous) is accepted**:

```
Referer: https://gp.e-cadastre.am:8443/arpis-geoportal/?uid=0&lang=am
```

Browsers can't set that header cross-origin, which is the only reason a proxy is needed.
(The site's own login is Google reCAPTCHA-gated and is neither needed nor used here.)

## Servlet

Base `Ext.SERVLET_URL` = `/arpis-geoportal/data/`, servlet `info`
(POST, form-urlencoded).

**1. Attributes of a layer**
```
action=infoClassAttruibutes_SRCH
data={"p_className":"parcels"}
```
→ `cadastre_code` ("Կադաստրային կոդ") is **attribute id 2260**; also `area`, `ins_time_of_execution`.

**2. Find by cadastral code**
```
action=infoShowData
data={"p_className":"parcels","p_prm_id":"2260","p_prm_val":"01-004-0117-0003"}
start=0&limit=10
```
- rows arrive under **`results`** (not `data`), total in `totalRecords`
- codes are stored **hyphenated**: `RR-BBB-SSSS-UUUU`
- row id is `{rowid}` = `{ID}'7241478'`; trailing `*` works as a wildcard
- values are interpolated into SQL → **validate input** (digits and hyphens only)

**3. Centroid**
```
action=infoGetGeom
data={"p_className":"parcels","p_id":"{ID}'7241478'"}
```
→ `{ success:true, wkt:"POINT (...)" }` — only the centre point.

**4. Full polygon** (the useful one)
```
action=infoGetDataAndGeom
p_layer_i=parcels & p_x_i=<northing> & p_y_i=<easting> & p_buff_i=1 & p_loc_i=am
```
Feed it the centroid from step 3 and it returns the parcel's **full boundary** as WKT.
Note the axis naming: `p_x_i` is the *northing*, `p_y_i` the *easting*.

## Coordinates

Native CRS is **`EPSG:2400000`** — Armenian GK zone 8 (Transverse Mercator, central
meridian 45°E, false easting 8,500,000, k₀=1, Krassovsky 1940). The Worker converts to
WGS84; output matches the reference implementation to 8 decimal places.

## Map tiles (WMS)

`/arpis-geoportal/ows/wms` — layers `parcels`, `parcels_label_am`, `buildings`,
`marz_centers`, `ND_S1-2k_Y2002` (orthophoto).

- **`EPSG:3857` is silently ignored** (always the same empty tile) — request `EPSG:4326`
  or the native grid. The Worker reprojects Leaflet's mercator bboxes automatically.
- The service is slow (~0.4–1.7 s/tile), so the map uses 512 px tiles that load when
  panning stops, and tiles are sent with a 7-day `Cache-Control` (browser cache).
  The Worker also calls the Cache API, but that is a **no-op on `*.workers.dev`** —
  Cloudflare only enables edge cache on custom domains, so it would start working
  automatically if the Worker is ever moved to one.

## Not available

- **WFS** — every `/ows/wfs` path 404s.
- **`doExport`** — a *paid* draw-an-area shapefile export (`calculate` returns a price),
  not a lookup.

## Other layers

`blocks`, `buildings`, `constructions`, `geodetic_points`, `parcels`, `property_rights`.

---

## Worker

```bash
cd worker
wrangler deploy          # no secrets required
```

| Endpoint | Purpose |
|---|---|
| `/parcel?code=RR-BBB-SSSS-UUUU` | `{success, area, coords:[[lat,lng]], geometryType, updated}` |
| `/wms?<WMS params>` | tile passthrough (adds Referer, reprojects, caches) |
| `/health` | upstream liveness |

CORS is limited to the site origin. This is an undocumented internal API and may change
without notice.
