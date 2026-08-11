# e-cadaster

Interactive map of Armenian cadastral parcels.

**Live demo:** https://gagikh.github.io/ecadaster/

| File | Purpose |
|------|---------|
| `index.html` | The map app (pure HTML/JS — open in a browser, no build step). |
| `worker/cadastre-worker.js` | Cloudflare Worker: your own proxy to the official cadastre. |
| `cadastre_client.py` | CLI helper (Python 3, stdlib only). |

---

# Official e-cadastre API — reverse-engineered

The government map is an **ARPIS / Geofoto geoportal** (ExtJS 3.4 + OpenLayers)
at `gp.e-cadastre.am:8443/arpis-geoportal`, backed by GeoServer + an Oracle DB.

## Auth: UID mode (no captcha automation)

The e-cadastre login is **Google reCAPTCHA v3 gated**, so automated login is not
possible (and not attempted). Instead:

1. Log into `www.e-cadastre.am` in a browser (human solves the captcha).
2. Open **Քարտեզ / map**; the geoportal opens as `…/arpis-geoportal/?uid=NNNNN&lang=am`.
3. Copy that `uid` → `wrangler secret put UID`.

The `uid` alone authorizes the data servlets — confirmed working from Cloudflare
(no IP block). It **expires**, so refresh it periodically.

## The data servlet

Base: `Ext.SERVLET_URL` = **`/arpis-geoportal/data/`** → servlet **`info`**
(POST, `application/x-www-form-urlencoded`, `Referer: …/?uid=NNNNN&lang=am`).

### 1. List searchable attributes
```
action=infoClassAttruibutes_SRCH
data={"p_className":"parcels"}
```
Key result for parcels: **`cadastre_code`** ("Կադաստրային կոդ") = **attribute id 2260**,
plus `area`, `ins_time_of_execution`.

### 2. Find rows by cadastral code
```
action=infoShowData
data={"p_className":"parcels","p_prm_id":"2260","p_prm_val":"01-004-0117-0003"}
start=0&limit=10
```
- Rows come back under **`results`** (not `data`); count in `totalRecords`.
- Codes are stored **hyphenated**, exactly `RR-BBB-SSSS-UUUU`.
- Row id is `{rowid}` with value like `{ID}'7241478'`.
- A trailing `*` acts as a wildcard (`01*`).
- Values are interpolated into SQL — **validate input** (digits/hyphens only).

### 3. Get geometry
```
action=infoGetGeom
data={"p_className":"parcels","p_id":"{ID}'7241478'"}
```
→ `{ success:true, wkt:"POINT (8456694.69 4453801.24)" }`

**Important:** the cadastre now returns the parcel's **centroid POINT**, not a
boundary polygon. (This is why third-party viewers show an *approximate* outline.)
You still get the authoritative **area** from step 2.

### Coordinates
Native CRS is **`EPSG:2400000`** (Armenian GK zone 8: TM, central meridian 45°E,
false easting 8,500,000, Krassovsky 1940). The Worker converts to WGS84 lat/lng.

### Other layers
`blocks`, `buildings`, `constructions`, `geodetic_points`, `parcels`, `property_rights`.

### Map tiles (WMS)
`/arpis-geoportal/ows/wms` — `GetMap` works with the `uid` session.
Layers: `parcels`, `parcels_label_am`, `buildings`, `marz_centers`, `ND_S1-2k_Y2002` (ortho).
**WFS is not exposed** (all `/ows/wfs` paths 404). `doExport` is a *paid*
draw-an-area shapefile export (`calculate` returns a price), not a lookup.

---

## Worker

```bash
cd worker
wrangler secret put UID      # fresh uid from a browser session
wrangler deploy
```

Endpoints:

| Endpoint | Purpose |
|---|---|
| `/parcel?code=RR-BBB-SSSS-UUUU` | **Main API** → `{success, area, coords:[[lat,lng]], wkt}` |
| `/debug` | Is the `uid` session still alive? |
| `/attrs` | Searchable attributes for a layer |
| `/sample?q=01*` | Raw sample rows (explore real data) |
| `/find?code=` | Step-by-step lookup (debugging) |
| `/raw?p=/path&off=0` | Read a geoportal file (debugging) |

CORS is restricted to `https://gagikh.github.io`.

**Note:** this is an undocumented internal API; it can change without notice.
