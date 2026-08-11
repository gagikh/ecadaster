/**
 * e-cadastre proxy — Cloudflare Worker
 * ====================================
 * Public, stateless proxy to Armenia's official cadastre geoportal
 * (ARPIS/Geofoto at gp.e-cadastre.am, GeoServer + Oracle behind it).
 *
 * No login, no credentials, no session: the servlets accept anonymous requests
 * as long as the Referer looks like the geoportal with uid=0. The browser can't
 * send that header cross-origin — which is the whole reason this proxy exists.
 *
 * Endpoints
 *   GET /parcel?code=RR-BBB-SSSS-UUUU   -> { success, area, coords:[[lat,lng]], ... }
 *   GET /wms?<standard WMS params>      -> map tile (reprojects 3857 -> 4326)
 *   GET /health                         -> upstream liveness
 */

const BASE  = "https://gp.e-cadastre.am:8443/arpis-geoportal";
const LAYER = "parcels";
const CODE_ATTR = "2260";                 // parcels.cadastre_code ("Կադաստրային կոդ")

const ALLOWED = new Set([
  "https://gagikh.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:5500",
]);
const cors = (o) => ({
  "Access-Control-Allow-Origin": ALLOWED.has(o) ? o : "https://gagikh.github.io",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
});
const json = (d, o, s = 200) => new Response(JSON.stringify(d), {
  status: s,
  headers: { "Content-Type": "application/json; charset=utf-8",
             "Cache-Control": "public, max-age=86400", ...cors(o) },
});

const headers = () => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "hy,en;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": `${BASE}/?uid=0&lang=am`,     // the only thing the server validates
});

const post = async (path, params) => {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/x-www-form-urlencoded",
               Origin: "https://gp.e-cadastre.am:8443" },
    body: new URLSearchParams(params),
  });
  return r.text();
};

// ---- WKT + projection ----------------------------------------------------
function parseWkt(wkt) {
  const m = String(wkt).match(/^\s*(\w+)\s*\((.*)\)\s*$/s);
  if (!m) return null;
  const pts = m[2].replace(/[()]/g, " ").split(",")
    .map(p => p.trim().split(/\s+/).map(Number))
    .filter(a => a.length >= 2 && a.every(n => !Number.isNaN(n)));
  return { type: m[1].toUpperCase(), pts };
}
// EPSG:2400000 -> WGS84. Armenian GK zone 8: TM, CM 45E, FE 8,500,000, k0=1, Krassovsky 1940.
function toWgs(x, y) {
  const a = 6378245.0, f = 1 / 298.3, e2 = f * (2 - f), FE = 8500000, lon0 = 45 * Math.PI / 180;
  const E = x - FE, N = y;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const mu = N / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
                + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
                + (151 * e1 ** 3 / 96) * Math.sin(6 * mu);
  const sp = Math.sin(p1), cp = Math.cos(p1), tp = Math.tan(p1), ep2 = e2 / (1 - e2);
  const C1 = ep2 * cp * cp, T1 = tp * tp;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * sp * sp, 1.5);
  const N1 = a / Math.sqrt(1 - e2 * sp * sp), D = E / N1;
  const lat = p1 - (N1 * tp / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
              + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = lon0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
              + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / cp;
  return [lat * 180 / Math.PI, lon * 180 / Math.PI];
}

// ---- code -> geometry ----------------------------------------------------
// 1) infoShowData: code -> row (rows arrive in `results`, id is `{rowid}`)
// 2) infoGetGeom: row -> centroid POINT
// 3) infoGetDataAndGeom: centroid -> full POLYGON (p_x_i = northing, p_y_i = easting)
async function lookup(code) {
  const t1 = await post("/data/info", {
    action: "infoShowData",
    data: JSON.stringify({ p_className: LAYER, p_prm_id: CODE_ATTR, p_prm_val: code }),
    start: "0", limit: "5",
  });
  let j; try { j = JSON.parse(t1); } catch { throw new Error("upstream unavailable"); }
  const row = (j.results || [])[0];
  if (!row) return null;

  const t2 = await post("/data/info", {
    action: "infoGetGeom",
    data: JSON.stringify({ p_className: LAYER, p_id: String(row["{rowid}"]) }),
  });
  let cg = {}; try { cg = JSON.parse(t2); } catch {}
  const cpt = cg.wkt ? parseWkt(cg.wkt) : null;
  if (!cpt || !cpt.pts.length) return null;
  const [X, Y] = cpt.pts[0];

  let wkt = cg.wkt, source = "centroid";
  for (const buff of ["1", "10", "100"]) {
    const t3 = await post("/data/info?action=infoGetDataAndGeom", {
      p_layer_i: LAYER, p_x_i: String(Y), p_y_i: String(X), p_buff_i: buff, p_loc_i: "am",
    });
    let g; try { g = JSON.parse(t3); } catch { continue; }
    if (g && g.success && g.wkt && !/^\s*POINT/i.test(g.wkt)) { wkt = g.wkt; source = "polygon"; break; }
  }

  const parsed = parseWkt(wkt);
  return {
    code, source, area: row.area, updated: row.ins_time_of_execution,
    geometryType: parsed ? parsed.type : null,
    coords: parsed ? parsed.pts.map(([x, y]) => toWgs(x, y)) : [],
  };
}

// 1x1 transparent PNG, used when the upstream refuses a tile
const BLANK = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

export default {
  async fetch(request, env, ctx) {
    const o = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(o) });
    const url = new URL(request.url);

    try {
      switch (url.pathname) {
        case "/parcel": {
          const code = (url.searchParams.get("code") || "").trim();
          if (!/^[0-9]{2}(-[0-9]+){3}$/.test(code))
            return json({ success: false, error: "bad code format (RR-BBB-SSSS-UUUU)" }, o, 400);
          const res = await lookup(code);
          if (!res) return json({ success: false, code, error: "not found" }, o, 404);
          return json({ success: true, ...res, srs: "EPSG:2400000" }, o);
        }

        case "/wms": {
          const qs = new URLSearchParams(url.search);
          qs.delete("_");
          // The cadastre WMS ignores EPSG:3857 (returns a fixed empty tile) but
          // honours EPSG:4326 — reproject Leaflet's mercator bbox to lon/lat.
          const keyOf = (n) => [...qs.keys()].find(k => k.toLowerCase() === n);
          const srsKey = keyOf("srs") || keyOf("crs"), bboxKey = keyOf("bbox");
          if (srsKey && bboxKey && /3857|900913/.test(qs.get(srsKey))) {
            const R = 6378137;
            const m2ll = (x, y) => [(x / R) * 180 / Math.PI,
                                    Math.atan(Math.sinh(y / R)) * 180 / Math.PI];
            const [a, b, c, d] = qs.get(bboxKey).split(",").map(Number);
            if ([a, b, c, d].every(n => !Number.isNaN(n))) {
              const [minx, miny] = m2ll(a, b), [maxx, maxy] = m2ll(c, d);
              qs.set(bboxKey, [minx, miny, maxx, maxy].map(n => n.toFixed(7)).join(","));
              qs.set(srsKey, "EPSG:4326");
            }
          }

          const upstream = BASE + "/ows/wms?" + qs.toString();
          const cache = caches.default, cacheKey = new Request(upstream);
          const hit = await cache.match(cacheKey);
          if (hit) return hit;

          let r = await fetch(upstream, { headers: headers() });
          const ok = (x) => x.ok && (x.headers.get("content-type") || "").startsWith("image");
          if (!ok(r)) r = await fetch(upstream, { headers: headers() });   // one retry

          if (!ok(r)) {   // degrade quietly; never cache a miss
            const blank = Uint8Array.from(atob(BLANK), c => c.charCodeAt(0));
            return new Response(blank, { status: 200, headers: {
              "Content-Type": "image/png", "Cache-Control": "no-store",
              "Access-Control-Allow-Origin": "*", "X-Upstream-Status": String(r.status) } });
          }
          const resp = new Response(await r.arrayBuffer(), { status: 200, headers: {
            "Content-Type": r.headers.get("content-type"),
            "Cache-Control": "public, max-age=604800",
            "Access-Control-Allow-Origin": "*" } });
          ctx.waitUntil(cache.put(cacheKey, resp.clone()));
          return resp;
        }

        case "/health": {
          const res = await lookup("02-082-0026-0001").catch(() => null);
          return json({ ok: !!res, anonymous: true, area: res ? res.area : null }, o);
        }

        default:
          return json({ endpoints: ["/parcel?code=", "/wms", "/health"] }, o, 404);
      }
    } catch (err) {
      return json({ success: false, error: String(err.message || err) }, o, 502);
    }
  },
};
