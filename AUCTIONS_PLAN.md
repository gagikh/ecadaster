# Auctions feature — implementation plan

Goal: periodically collect **open auctions** from `e-auctions.am`, keep the ones that
reference a **cadastral code**, and show them on the map (with the parcel outline we
already derive), filterable by area.

---

## 1. What the source actually offers (verified 2026-08-12)

**No public JSON API.** `/api/lot` returns nothing; the site is server-rendered PHP.
Everything must come from HTML. Available surfaces:

| URL | Purpose |
|---|---|
| `/lot?page=N` | all lots, paginated (~103 pages × 6 = ~620 lots) |
| `/current-lot` | auctions currently running |
| `/finished-lot` | completed |
| `/lot-inner/{id}` | lot detail page |
| `/lot?name=<text>` | free-text filter (query param confirmed) |
| `/lot?sort=price|expired|auctionCount&direction=asc` | sorting |

The search form also filters by **region/community** (Տարածաշրջան, all marzes listed),
**category** (`Անշարժ գույքի օտարում`, `Անշարժ գույքի վարձակալություն`, vehicles, …),
**auction type** and price range. Exact parameter names for those still need to be read
off the form markup — a 2-minute job with DevTools (see §6).

### Where the cadastral code lives

Confirmed on `/lot-inner/4116`:

```
Title: Վաճառվում է Արագածոտնի մարզ գյուղ Շենավան 20-րդ փ., 1/1
       /վկայական N 17062025-02-0010  02-082-0060-0020 /
Բնութագրիչներ:
  Հողամասի մակերեսը (հա)   0,05436          → 543.6 m²
  Տեղադիրքը քարտեզում      40.481006, 44.378991
Աճուրդի մեկնարկ            2026-09-16 11:00:00
Հաշվարկային ավարտ          2026-09-22 11:00:00
Աճուրդի կազմակերպիչ        Ապարան համայնք
```

So the code sits in the **title** (sometimes description) and can be pulled with
`/\b\d{2}-\d{3}-\d{4}-\d{4}\b/`. Coordinates appear either as decimal
(`40.481006, 44.378991`) or DMS (`40°10'13.3"N 44°30'26.8"E`) — both in the
characteristics table and in an embedded Google Maps link.

**Important caveat:** not every lot has a code. Rentals of floor space inside buildings
(e.g. `/lot-inner/3914`) have coordinates but no cadastral code; vehicles have neither.
Some codes may only exist inside the attached `Հրապարակային ծանուցում` **.docx** notice —
parsing those is possible but out of scope for v1.

---

## 2. Architecture

```
Cron (every 6h)
   │
   ▼
Cloudflare Worker  ──►  e-auctions.am   (crawl list + new detail pages)
   │                       │
   │                       └─ parse: code, coords, area, price, dates, organizer
   ▼
Cloudflare D1 (SQLite)  ── auctions table
   │
   ▼
GET /auctions?bbox=…&open=1   ──►  map UI (new "Auctions" layer)
                                     └─ code ⇒ reuse /parcel + boundary tracing
```

Everything runs on the **existing Worker** — no new infrastructure, all free tier.

### Storage decision: Cloudflare D1 — everything stays in Cloudflare

| | Free tier | This project |
|---|---|---|
| Storage | 5 GB | ~600 rows ≈ **<1 MB** |
| Rows read | 5 M/day | a few thousand |
| Rows written | 100 k/day | 4 crawls × ~600 upserts ≈ **2,400** |

Rejected alternatives:
- **KV** — key-value only; no `WHERE ends_at > now() AND lat BETWEEN …`, so every
  request would scan the whole set.
- **R2** — object storage; useful later for caching `.docx` notices or photos, not for queries.
- **Durable Objects** — overkill for a few hundred rows.
- **JSON committed to GitHub** — explicitly ruled out; the data belongs in Cloudflare.

Setup (once):
```bash
wrangler d1 create ecadaster-auctions          # prints database_id
# paste the id into wrangler.toml, uncomment the [[d1_databases]] block, then:
wrangler d1 execute ecadaster-auctions --file=schema.sql --remote
```
Schema lives in `worker/schema.sql`; the binding is `env.DB`.

## 3. Data model

```sql
CREATE TABLE auctions (
  id            INTEGER PRIMARY KEY,     -- lot-inner id
  lot_no        TEXT,                    -- Լոտի համար
  title         TEXT,
  cadastre_code TEXT,                    -- NULL when absent
  lat REAL, lng REAL,                    -- from the characteristics table
  area_m2       REAL,
  price_start   INTEGER,
  price_current INTEGER,
  deposit       INTEGER,
  organizer     TEXT,
  region        TEXT,
  starts_at     TEXT,                    -- ISO
  ends_at       TEXT,
  url           TEXT,
  first_seen    TEXT,
  last_seen     TEXT,
  status        TEXT                     -- open | finished
);
CREATE INDEX idx_open ON auctions(status, ends_at);
CREATE INDEX idx_code ON auctions(cadastre_code);
CREATE INDEX idx_geo  ON auctions(lat, lng);
```

---

## 4. The periodic job

`wrangler.toml`:
```toml
[triggers]
crons = ["0 */6 * * *"]        # every 6 hours
```

`scheduled()` handler:

1. Fetch `/current-lot?page=1..N` until a page repeats/empties (cheap: ~10–20 pages).
2. Extract lot ids + summary fields from the listing HTML.
3. For **ids not already in D1** (or whose price/bid changed), fetch `/lot-inner/{id}`.
4. Parse detail → cadastral code, coordinates, area, dates.
5. `UPSERT` into D1; mark rows not seen this run and past `ends_at` as `finished`.
6. Politeness: ~1 request/second, `User-Agent` identifying the app, stop on repeated 5xx.

**Cost estimate:** first full crawl ~620 detail fetches (~10 min at 1 rps, run once);
subsequent runs only fetch new lots — typically a handful. Well inside free limits.

---

## 5. API + UI

**Worker**
```
GET /auctions?open=1&bbox=minLng,minLat,maxLng,maxLat&withCode=1
→ [{ id, title, code, lat, lng, area, priceStart, priceCurrent, endsAt, url }]
```

**Map (index.html)**
- New collapsible "Աճուրդներ / Auctions" section with: only-open toggle, only-with-code
  toggle, price range, and "search in current view" (uses the map bbox).
- Lots with a code → plot the parcel (existing `/parcel` + boundary tracing), coloured
  distinctly from user-plotted parcels.
- Lots without a code → simple marker at the published coordinates.
- Popup: title, start/current price, deposit, dates, organizer, link to the lot.
- Optional badge "ends in 3 days" driven by `ends_at`.

---

## 6. Open questions to settle first

1. **Filter parameter names** — read them off the search form (`/lot`, DevTools →
   Elements → the `<form>`), so we can crawl only real-estate categories instead of all
   620 lots. Biggest efficiency win.
2. **`robots.txt`** returned empty in my fetch — confirm in a browser whether one exists
   and what it allows. If crawling is disallowed, we respect it and reconsider.
3. **Terms of use** — it's a government portal; a low-rate, attributed crawler that links
   back is normally fine, but worth a look at `/page/4` (Ուղեցույց).
4. **Code coverage** — sample ~30 real-estate lots and measure what share expose a code in
   the title vs only in the .docx. Determines whether v2 needs .docx parsing.

---

## 7. Suggested build order

1. Parser module + unit tests against saved HTML (offline, no network).
2. D1 schema + `/auctions` read endpoint (seeded manually).
3. Cron crawler, run once manually via `wrangler dev` to backfill.
4. Map UI layer.
5. Optional: .docx notice parsing; "new auctions since yesterday" notification.

Estimated effort: parser ½ day, storage+API ½ day, UI ½ day.

---

# 8. Page design — two tabs

Decided 2026-08-15.

## Layout

One map, one panel. The panel gets a tab strip; everything below the tabs is
tab-specific, everything under "shared" applies to both.

```
┌─ panel ────────────────────┐
│ [ Ծածկագրեր ] [ Աճուրդներ ]│   ← tabs
├────────────────────────────┤
│  tab content               │
│   • Codes:    textarea, Plot all, colour legend
│   • Auctions: filters, result cards
├────────────────────────────┤
│  shared: basemap · layers · opacity · measurements · language · share
└────────────────────────────┘
```

## Behaviour (chosen)

- **Both layers stay visible.** Plotted codes and auction results are separate
  Leaflet layer groups drawn simultaneously, distinct colours. Switching tabs
  changes only the panel, never the map contents.
- **Only auctions with a cadastral code go on the map** — drawn as real parcels
  through `/parcel` + boundary tracing, so they are exactly as precise as a
  manually plotted code. Lots without a code still appear in the list (greyed,
  no map pin) so nothing is silently dropped.
- **Auctions load automatically** when the tab is first opened, from
  `GET /auctions?open=1`. Cached in memory for the session; a refresh button
  re-fetches.

## Auctions tab

Filters: open only (default on) · in current map view · has code · price range ·
region. Sort: ending soonest (default), price, newest.

Result card: title · code (monospace, links to the parcel) · starting price ·
time remaining · organiser. Clicking a card zooms to the parcel and opens its
popup; hovering highlights it on the map.

Map popup for an auction parcel shows the **whole details table verbatim**
(organiser, lot no, min step, deposit, valuation, starting price, valuation fee,
auction count, bids, start, end) plus the characteristics block and a link to
the lot page. That is why the parser keeps `details` and `specs` as raw
label→value maps rather than a fixed set of fields.

## Colours

- User-plotted codes: existing 10-colour palette.
- Auction parcels: single distinct accent (amber), dashed if the boundary was
  traced rather than served.
- Ending within 48h: red outline to draw the eye.

## URL / sharing

`?tab=auctions&open=1&bbox=…` is added to the existing share state, so an
auction view is shareable exactly like a set of plotted codes.

## Build order

1. Tab shell + move existing controls into tab 1 (pure refactor, no new data).
2. `/auctions` endpoint reading D1 + the cron crawler.
3. Auctions tab: list, filters, map layer, popup.
4. Polish: hover sync, ending-soon styling, share params.

---

# 9. Mobile

The site is already used on phones (geolocation, share links), so mobile is a
first-class target, not an afterthought. Today's panel is a 300px box that covers
most of a phone screen; with a second tab it would cover all of it.

## Bottom sheet instead of a side panel

On screens ≤ 640px the panel becomes a **bottom sheet** — the pattern every map
app uses, because it keeps the map visible while the list is in reach of a thumb.

Three snap points, dragged by the handle or tapped on the header:

| State | Height | Use |
|---|---|---|
| Peek | ~72px | tab strip + result count only; map fully usable |
| Half | 45vh | browse the auction list while watching the map |
| Full | 90vh | typing codes, editing filters |

Default: **peek**. Opening a tab or plotting raises it to half; tapping a result
card drops it back to peek and zooms the map to that parcel.

## Adjustments for touch

- Tap targets ≥ 44px; tabs are full-width halves of the sheet header.
- **No hover interactions** — the desktop "hover a card to highlight on the map"
  becomes tap-to-select (highlight + zoom). Hover stays as a desktop enhancement.
- The result list scrolls **inside** the sheet; the page itself never scrolls.
- Map controls (zoom, ◎ locate) sit above the sheet's peek height so they are
  never covered.
- Popups on a phone open as a compact card anchored to the sheet rather than a
  Leaflet balloon, which would be clipped at this zoom.
- Long detail tables (11+ rows) collapse to the 4 key rows with a "more" toggle.

## Layout switch

One breakpoint at 640px, driven by `matchMedia`:
- **≥ 640px** — current left panel, tabs at its top, both layers visible.
- **< 640px** — bottom sheet, same DOM, different CSS class. No duplicate markup,
  so the tab logic and data code stay identical on both.

Rotation and resize re-evaluate the breakpoint, preserving tab + results.
