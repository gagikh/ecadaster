# e-cadastre.am Map — Direct API Reference

**Live demo:** https://gagikh.github.io/ecadaster/

_Reverse-engineered from a live HAR of a logged-in `www.e-cadastre.am/map` session (2026-07-06). The official map is an **ARPIS geoportal**: a **GeoServer** (OGC WMS 1.1.1) fronted by an ExtJS 3.4 + OpenLayers app._

## The real backend

| Thing | Value |
|---|---|
| App shell | `https://gp.e-cadastre.am:8443/arpis-geoportal/?uid={SESSION}&lang=am` |
| **OGC service endpoint** | `https://gp.e-cadastre.am:8443/arpis-geoportal/ows/wms` |
| Service | GeoServer, **WMS 1.1.1** (WFS at `/ows/wfs` appears disabled) |
| Session keepalive | `GET /arpis-geoportal/ses.jsp?_dc={ts}` |
| Native CRS | **`EPSG:2400000`** (custom ARPIS grid — not a standard EPSG code) |

### Auth model — important

The WMS tile requests in the capture carry **no cookie and no `Authorization` header** — the only session marker is the `Referer` (`…/?uid=74935&lang=am`). The `uid` is minted after you log into `www.e-cadastre.am` via the ES-EM / National ID platform. In practice the WMS responds to `GetCapabilities` from an unauthenticated client, so the geoservice is effectively open for reads; the login mainly gates the app shell and the `uid`. Treat that as fragile — they can lock it down anytime.

### Layers (exact names, from the capture)

| Layer | Content |
|---|---|
| `parcels` | Land parcel polygons |
| `parcels_label_am` | Parcel labels (Armenian) |
| `buildings` | Building footprints |
| `marz_centers` | Marz (region) centers |
| `marz_centers_label_am` | Region-center labels |
| `ND_S1-2k_Y2002` | Orthophoto basemap (2002), served as JPEG |

Run `GetCapabilities` for the full, current list plus each layer's attributes and supported CRSs.

---

## 1. GetCapabilities — enumerate layers & fields

```
GET https://gp.e-cadastre.am:8443/arpis-geoportal/ows/wms?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetCapabilities
```
Returns the WMS capabilities XML (all layers, bounding boxes, CRSs). Confirmed to respond without auth.

## 2. GetMap — render map tiles

```
GET .../ows/wms
   ?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetMap
   &LAYERS=parcels                 # or buildings, ND_S1-2k_Y2002, ...
   &FORMAT=image/png               # jpeg for the orthophoto
   &TRANSPARENT=true
   &SRS=EPSG:2400000               # native grid (see note below)
   &BBOX=8456392,4452946.88,8456499.52,4453054.4
   &WIDTH=256&HEIGHT=256
```
Verified working (this is exactly what the map issues, hundreds of times, one per tile). `TRANSPARENT=false` + JPEG is used for the orthophoto layer.

> **Skip the custom CRS if you want.** GeoServer reprojects on the fly, so you can normally pass `SRS=EPSG:4326` (lat/lng) or `SRS=EPSG:3857` (web-mercator, for Leaflet/Mapbox/OpenLayers XYZ) with a matching `BBOX` and skip `EPSG:2400000` entirely. Confirm the layer advertises those CRSs in GetCapabilities first.

**Leaflet WMS example:**
```js
L.tileLayer.wms("https://gp.e-cadastre.am:8443/arpis-geoportal/ows/wms", {
  layers: "parcels,buildings",
  format: "image/png",
  transparent: true,
  version: "1.1.1"
}).addTo(map);   // Leaflet sends SRS=EPSG:3857 by default
```

## 3. GetFeatureInfo — identify a parcel at a location

Standard WMS identify. Returns the parcel's attributes (including its cadastral code and any value/area fields GeoServer exposes) at a pixel:

```
GET .../ows/wms
   ?SERVICE=WMS&VERSION=1.1.1&REQUEST=GetFeatureInfo
   &LAYERS=parcels&QUERY_LAYERS=parcels
   &SRS=EPSG:4326
   &BBOX={minLng},{minLat},{maxLng},{maxLat}
   &WIDTH=101&HEIGHT=101&X=50&Y=50          # X/Y = pixel to query (1.1.1)
   &INFO_FORMAT=application/json            # or text/html, text/plain, application/vnd.ogc.gml
   &FEATURE_COUNT=10
```
This is the query to use for **"what parcel / attributes are at this point."** `INFO_FORMAT=application/json` gives clean GeoJSON-style features. _(Standard GeoServer behavior; the exact attribute names come from GetCapabilities/DescribeFeatureType — I couldn't enumerate them from the HAR alone.)_

---

## The one missing piece: search **by cadastral code → location**

Your HAR shows the map zoomed straight to the searched parcel, but the request that **resolves a cadastral code to coordinates was not recorded** (only the resulting tile pans were). On a GeoServer this is normally one of:

- **WFS GetFeature with a CQL filter**, e.g.
  `.../ows/wfs?service=WFS&request=GetFeature&typeName=parcels&outputFormat=application/json&CQL_FILTER=cad_code='01-001-0658-0020'`
  — but `/ows/wfs` returned empty in my tests, so WFS may be turned off and the app likely uses a **custom search servlet** instead.

To capture it, do one more HAR **with the code typed after recording starts**:
1. On the logged-in map, open DevTools → Network, filter **Fetch/XHR**, tick **Preserve log**.
2. Type `01-001-0658-0020` in the search box and hit search **while recording**.
3. Watch for a single non-tile request (JSON/XML) to `gp.e-cadastre.am` — that's the search endpoint.
4. Save HAR → I'll document its URL, params, and the cadastral-code field name, and confirm the CQL/WFS path.

---

## Coordinate note

Native grid is `EPSG:2400000` (values ~`8.4M, 4.4M`). The example parcel `01-001-0658-0020` sits near BBOX `8456392,4452946` in that grid ≈ `40.2105°N, 44.4876°E` in WGS84. For most integrations, request in `EPSG:4326`/`EPSG:3857` and let GeoServer reproject rather than dealing with the custom grid.

---

## Appendix — quick code→polygon without login

If you only need **cadastral code → boundary polygon** and don't want to run an authenticated session, the third-party `map.astat.am` proxy wraps this same official map and needs no auth:

```
GET https://map.astat.am/Map/Home/GetCadastralPolygon?cadastralCode=01-001-0658-0020
→ {"success":true,"coords":[[lat,lng],...]}          # WGS84, [lat,lng] order, ring not closed
→ {"success":false,"message":"Cadastral code not found on"}   # unknown code
```
Verified for all three sample codes. `cadastre_client.py` in this folder uses it (handles the lat/lng swap, ring-closing, and `--geojson`). It's a third party, so treat as best-effort, not authoritative.
