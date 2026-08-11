/**
 * e-cadastre proxy — Cloudflare Worker
 * ====================================
 * Public, stateless proxy to Armenia's official cadastre geoportal.
 *
 * NO login, NO credentials, NO session to babysit: the ARPIS data servlet
 * accepts anonymous requests as long as the Referer looks like the geoportal
 * with uid=0 (the viewer itself runs anonymously — `if (params.uid > 0)` merely
 * unlocks extra editing tools).
 *
 * Pipeline (reverse-engineered from the ExtJS viewer):
 *   1. infoShowData        code -> row   (attr id 2260 = cadastre_code; rows in `results`)
 *   2. infoGetGeom         row  -> centroid POINT
 *   3. infoGetDataAndGeom  centroid -> FULL POLYGON  (p_x_i = northing, p_y_i = easting)
 *   4. EPSG:2400000 -> WGS84
 *
 * Endpoints:
 *   /parcel?code=RR-BBB-SSSS-UUUU   main API -> {success, area, coords:[[lat,lng]]}
 *   /health                          quick liveness check
 *   /attrs?class=parcels             searchable attributes of a layer
 *   /sample?q=01*                    raw sample rows (explore the data)
 *   /raw?p=/gf/File.js&off=0         read a geoportal file (debugging)
 */

const BASE = "https://gp.e-cadastre.am:8443/arpis-geoportal";
const UID  = "0";                       // anonymous; override with env.UID if ever needed
const CODE_ATTR = "2260";               // parcels.cadastre_code
const LAYER = "parcels";

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

const headers = (env) => ({
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36",
  "Accept": "*/*",
  "Accept-Language": "hy,en;q=0.9",
  "X-Requested-With": "XMLHttpRequest",
  "Referer": `${BASE}/?uid=${env.UID || UID}&lang=am`,   // the only thing the server checks
});

async function post(env, path, params) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { ...headers(env), "Content-Type": "application/x-www-form-urlencoded",
               Origin: "https://gp.e-cadastre.am:8443" },
    body: new URLSearchParams(params),
  });
  return { status: r.status, text: await r.text() };
}
async function get(env, path) {
  const r = await fetch(BASE + path, { headers: headers(env) });
  return { status: r.status, ct: r.headers.get("content-type") || "", text: await r.text() };
}

// ---- WKT + projection ----------------------------------------------------
function parseWkt(wkt) {
  const m = String(wkt).match(/^\s*(\w+)\s*\((.*)\)\s*$/s);
  if (!m) return null;
  const pts = m[2].replace(/[()]/g, " ").split(",")
    .map(p => p.trim().split(/\s+/).map(Number))
    .filter(a => a.length >= 2 && a.every(n => !Number.isNaN(n)));
  return { type: m[1].toUpperCase(), pts };
}
// EPSG:2400000 — Armenian GK zone 8: TM, CM 45E, FE 8,500,000, k0=1, Krassovsky 1940
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

// ---- Core lookup ---------------------------------------------------------
async function lookup(env, code) {
  // 1) code -> row
  const r1 = await post(env, "/data/info", {
    action: "infoShowData",
    data: JSON.stringify({ p_className: LAYER, p_prm_id: CODE_ATTR, p_prm_val: code }),
    start: "0", limit: "5",
  });
  let j; try { j = JSON.parse(r1.text); } catch { throw new Error("upstream unavailable"); }
  const row = (j.results || [])[0];
  if (!row) return null;

  // 2) row -> centroid
  const r2 = await post(env, "/data/info", {
    action: "infoGetGeom",
    data: JSON.stringify({ p_className: LAYER, p_id: String(row["{rowid}"]) }),
  });
  let cg = {}; try { cg = JSON.parse(r2.text); } catch {}
  const cpt = cg.wkt ? parseWkt(cg.wkt) : null;
  if (!cpt || !cpt.pts.length) return null;
  const [X, Y] = cpt.pts[0];

  // 3) centroid -> full polygon
  let wkt = cg.wkt, source = "centroid";
  for (const buff of ["1", "10", "100"]) {
    const r3 = await post(env, "/data/info?action=infoGetDataAndGeom", {
      p_layer_i: LAYER, p_x_i: String(Y), p_y_i: String(X), p_buff_i: buff, p_loc_i: "am",
    });
    let g; try { g = JSON.parse(r3.text); } catch { continue; }
    if (g && g.success && g.wkt && !/^\s*POINT/i.test(g.wkt)) { wkt = g.wkt; source = "polygon"; break; }
  }

  const parsed = parseWkt(wkt);
  return {
    code, source,
    area: row.area, updated: row.ins_time_of_execution,
    geometryType: parsed ? parsed.type : null,
    coords: parsed ? parsed.pts.map(([x, y]) => toWgs(x, y)) : [],
  };
}

export default {
  async fetch(request, env) {
    const o = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { headers: cors(o) });
    const url = new URL(request.url);
    try {
      switch (url.pathname) {
        case "/parcel": {
          const code = (url.searchParams.get("code") || "").trim();
          if (!/^[0-9]{2}(-[0-9]+){3}$/.test(code))
            return json({ success: false, error: "bad code format (RR-BBB-SSSS-UUUU)" }, o, 400);
          const res = await lookup(env, code);
          if (!res) return json({ success: false, code, error: "not found" }, o, 404);
          return json({ success: true, ...res, srs: "EPSG:2400000" }, o);
        }
        case "/wms": {
          // Proxy WMS tiles, adding the Referer the cadastre server requires.
          // Browsers can't send that Referer themselves, hence this passthrough.
          const qs = new URLSearchParams(url.search);
          qs.delete("_");
          const r = await fetch(BASE + "/ows/wms?" + qs.toString(), { headers: headers(env) });
          const ct = r.headers.get("content-type") || "";
          if (!r.ok || !ct.startsWith("image")) {
            const t = await r.text();
            return json({ error: "wms failed", status: r.status, ct, body: t.slice(0, 400) }, o, 502);
          }
          return new Response(r.body, {
            status: 200,
            headers: { "Content-Type": ct, "Cache-Control": "public, max-age=86400",
                       "Access-Control-Allow-Origin": "*" },
          });
        }
        case "/wmstest": {
          // diagnostic: does WMS answer with the uid=0 referer?
          const q = new URLSearchParams({
            SERVICE: "WMS", VERSION: "1.1.1", REQUEST: "GetMap", LAYERS: "parcels",
            FORMAT: "image/png", TRANSPARENT: "true", STYLES: "", SRS: "EPSG:2400000",
            BBOX: "8447000,4483600,8447500,4484000", WIDTH: "256", HEIGHT: "256",
          });
          const r = await fetch(BASE + "/ows/wms?" + q, { headers: headers(env) });
          const ct = r.headers.get("content-type") || "";
          const buf = await r.arrayBuffer();
          const head = new Uint8Array(buf.slice(0, 8));
          const isPng = head[0] === 0x89 && head[1] === 0x50;
          return json({ status: r.status, ct, bytes: buf.byteLength, isPng,
                        note: isPng ? "WMS works anonymously via proxy" : "not an image",
                        peek: isPng ? null : new TextDecoder().decode(buf.slice(0, 300)) }, o);
        }
        case "/health": {
          const res = await lookup(env, "02-082-0026-0001").catch(() => null);
          return json({ ok: !!res, anonymous: true, sample: res ? res.area : null }, o);
        }
        case "/attrs": {
          const cls = url.searchParams.get("class") || LAYER;
          const r = await post(env, "/data/info", {
            action: "infoClassAttruibutes_SRCH", data: JSON.stringify({ p_className: cls }) });
          try { return json(JSON.parse(r.text), o); } catch { return json({ raw: r.text.slice(0, 2000) }, o); }
        }
        case "/sample": {
          const q = url.searchParams.get("q") || "01*";
          const r = await post(env, "/data/info", {
            action: "infoShowData",
            data: JSON.stringify({ p_className: LAYER, p_prm_id: CODE_ATTR, p_prm_val: q }),
            start: "0", limit: url.searchParams.get("limit") || "10" });
          let j; try { j = JSON.parse(r.text); } catch { return json({ raw: r.text.slice(0, 2000) }, o); }
          return json({ q, total: j.totalRecords, rows: j.results || [] }, o);
        }
        case "/raw": {
          const p = url.searchParams.get("p");
          if (!p) return json({ error: "missing ?p=" }, o, 400);
          const off = parseInt(url.searchParams.get("off") || "0", 10) || 0;
          const r = await get(env, p);
          return json({ status: r.status, ct: r.ct, len: r.text.length, off,
                        text: r.text.slice(off, off + 60000) }, o);
        }
        default:
          return json({ endpoints: ["/parcel?code=", "/wms", "/wmstest", "/health", "/attrs", "/sample?q=", "/raw?p="] }, o, 404);
      }
    } catch (err) {
      return json({ success: false, error: String(err.message || err) }, o, 502);
    }
  },
};
