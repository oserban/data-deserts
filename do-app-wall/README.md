# Data Deserts distributed DO wall

This is the template-native Data Deserts implementation for a physical **16-column × 4-row**
video wall. It uses the same architecture and technology choices as `template-app.zip`:

- a single Vite Plus application
- TanStack React Start and file-based SSR routes
- Nitro's Node server preset
- MapLibre GL through `@vis.gl/react-maplibre`
- deck.gl's `WebMercatorViewport` for per-display camera derivation
- TanStack Store plus separate control/screen engines
- CrossWS for collaborative state synchronization
- React 19 and Tailwind CSS

It does not import, serve, or resolve files from the repository's static `app/` directory.
The build bundles its own `src/lib/score-model.ts` and `score-logic.js`, so
the production server needs no external source files.

DHS uses the same Python-generated survey counts and nutrition metadata as the static app.
Map and chart calculations count each available survey once. Country details list survey years
and highlight any confirmed nutrition topic, including feeding practices and micronutrients.
Both grouped and individual dataset views respect the selected principal-year window.
Run `python3 processing/fetch_dhs.py` from the repository root before building old participant data.

The controller's **Include LSMS estimates** switch is on by default and synchronizes to all wall
screens. It adds estimated household members from the [offline reviewed-study dictionary](../processing/resources/lsms_household_estimates.json)
to LSMS counts, yearly bins, histograms and aggregate/category scores. Country details distinguish
observed records from estimates. The switch is disabled in detailed agriculture mode and retains
its setting when returning to the dataset view.

PREDICTS combines the 2016 V1.1 site summaries and the November 2022 additions through the
shared Python pipeline, counting unique source/study/block/site IDs by sampling midpoint year.

The shared timeline begins at the earliest available DHS survey (currently 1985). Earlier
records are excluded from both apps’ generated coverage data, summaries and chart scales.
The cutoff is global, not the first DHS survey in each individual country.

## Agriculture controls

The overview includes one Crop agriculture sector. Its aggregate filter selects map availability
across crops (default) or reporting-unit coverage. **Detailed agriculture scores**
replaces the overview sectors with the 15 crops and offers dispersion (default), effective
resolution in km, or reporting-unit coverage. Category grouping and overview dataset filters
are disabled until this mode is switched off; previous selections are preserved.

Annual bins work in every mode. Selected-window dispersion averages available yearly country
values; resolution shows the coarsest available yearly value. Coverage uses 60% log-normalised
reporting-unit density plus 40% years with reports. Missing agriculture results are grey and
labelled unavailable, distinct from measured zero dispersion. The controller synchronises
these options across wall screens. Supported census tables are linked to the map’s exact
country polygons automatically, retaining source census-unit counts. Partial evidence and
unresolved results are identified explicitly; see the [processing documentation](../processing/README.md#harvested-area-allocation-analysis).

## Run

Node 22.13 or newer and pnpm 11 are required.

```sh
cd do-app-wall
pnpm install
pnpm dev
```

Build and run the production Nitro server:

```sh
pnpm build
PORT=8080 pnpm start
```

For deployment, copy `.env.template` to `.env`, adjust its values, and start either the source
build or the extracted dependency-free archive with Node's environment-file support:

```sh
cp .env.template .env
node --env-file=.env .output/server/index.mjs
# Extracted Linux archive: node --env-file=.env server/index.mjs
```

`nginx.data-deserts.conf.example` contains a complete prefix-proxy example for
`/data-deserts/`, including the `/bus` WebSocket upgrade and immutable asset caching.

### Presenter controller authentication

Set a long, random static controller token at runtime:

```sh
DO_WALL_CONTROL_TOKEN=replace-with-a-long-random-token
```

Pass it to the trusted presenter application as part of the controller URL:

```text
https://example.org/data-deserts/control?operator=A&token=replace-with-a-long-random-token
```

The server validates the token before rendering an operational controller and validates it again
on every WebSocket or HTTP state mutation. Development simulator controller URLs receive the
configured token automatically. The wall can run without a token for local use, but it logs a
prominent server warning and displays a warning in the controller because unauthenticated control
is unsafe on a public network.

### Runtime proxy prefix

One production build can be mounted below any URL prefix without rebuilding. Set the prefix when
starting the server (omit it, or set it to `/`, for root hosting):

```sh
APP_BASE_PATH=/do-wall PORT=8080 pnpm start
```

The value is normalized, so `do-wall`, `/do-wall`, and `/do-wall/` are equivalent. It prefixes
client-side routes, REST calls, public project assets, and the realtime WebSocket at runtime.

Nginx must strip the public prefix before forwarding to Nitro. The trailing slash on
`proxy_pass` is significant:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location = /do-wall {
    return 308 /do-wall/;
}

location /do-wall/ {
    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Prefix /do-wall;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;

    proxy_read_timeout 1d;
    proxy_send_timeout 1d;
    proxy_buffering off;
}
```

The public controller and screen URLs then become `/do-wall/control` and
`/do-wall/screen?c=0&r=0`; the synchronization endpoint becomes `/do-wall/bus`.

### Audience mini controller

The right edge of the map displays a rotating QR code for the mobile, add-only controller. Its
invitation and session lifetimes are configurable at server startup:

```sh
MINI_CONTROLLER_QR_TTL_SECONDS=30 \
MINI_CONTROLLER_SESSION_TTL_SECONDS=600 \
APP_BASE_PATH=/do-wall PORT=8080 pnpm start
```

Invitation links are signed, expire after 30 seconds by default, and can be exchanged only once.
The exchanged session is kept only in the current page's memory, so refreshing invalidates access;
it also expires after ten minutes by default. Guest controllers can add DHS countries only. Country
removal and all other display controls remain exclusive to the main controller.

## Physical display addressing

Each display opens exactly one coordinate-addressed route:

```text
/screen?c=<column>&r=<row>
```

Columns are `0`–`15`; rows are `0`–`3`. For example:

```text
/screen?c=0&r=0     top-left
/screen?c=15&r=0    top-right
/screen?c=0&r=3     bottom-left
/screen?c=15&r=3    bottom-right
```

In development, the `/` route lazy-loads the Mini-DO playground. It renders the 64 coordinate
routes in the same 16×4 arrangement, permits selecting subsets, and embeds independent operator
panels. Production builds replace it with a lightweight landing page, so display clients do not
load the simulator. A production display controller should point each physical player directly at
its assigned `/screen` URL.

Every screen renders in a fixed logical 1920×1080 viewport and scales that viewport to the attached
panel. Wall constants live in
`src/lib/wall-config.ts`.

## Wall composition

```text
columns 0–1    original project information and visual design
columns 2–3    eleven source-reference cards and global year histograms
columns 4–7    one seamless distributed MapLibre map
columns 8–15   detached country-detail comparison experience
rows 0–3       shared by all four regions
```

The map is not stretched across browsers. Each of its four columns creates its own MapLibre instance and
uses `WebMercatorViewport` to derive the correct local camera from the shared wall camera. Adjacent
tiles therefore display adjacent portions of the same geographic view while remaining independent
rendering clients.

## Realtime distribution

Open `/control?operator=A` on a tablet or operator computer. Multiple controls can operate at the
same time. Control engines publish complete `state/update` snapshots to `/bus`; screen engines on
all 64 nodes subscribe to the same CrossWS channel. The bus retains the latest state so a restarted
or late-joining screen is immediately synchronized.

Synchronized state includes:

- year window
- active datasets
- dataset/domain grouping mode
- selected countries
- shared map longitude, latitude, zoom, bearing, and pitch

## Server routes

- `GET /api/datasets`
- `GET /api/datasets/:id`
- `GET /api/countries`
- `GET /api/world`
- `GET /health`
- `GET /bus` — WebSocket upgrade route

Data generation is owned by `../processing/build_data.py`, which writes `src/data/datasets.json`
and `src/data/world.json` directly. A shared server data service exposes those files through the
REST routes. The same JSON modules are bundled into both the SSR and browser
graphs, so REST responses, control components, screen components, and the wall visualisation share
one data representation.

## Production notes

All 64 players must reach the same Nitro process (or a deployment with shared/sticky realtime
state). Put TLS in front of the server so `/bus` upgrades to WSS. Disable caching for `/bus` and
`/health`; hashed client assets can be cached normally. The current CrossWS state is in-process, as
in the template. For horizontally scaled server replicas, replace it with a shared pub/sub adapter.
