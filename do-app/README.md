# Data Deserts controller and renderer

This version separates filter input from map rendering. The controller broadcasts its complete
filter state through a WebSocket relay; every connected renderer validates and applies that state to
the existing Leaflet map and radial donut charts.

## Development

From the repository root:

```sh
npm install
npm run do-app:dev
```

Open the controller at `http://localhost:8080/controller` and the renderer at
`http://localhost:8080/renderer`. Open the detached country-information panel at
`http://localhost:8080/details`. Open any page on multiple devices by replacing
`localhost` with the server's reachable hostname or IP address.

The static dataset reference is available at `http://localhost:8080/datasets`. Its
typography and two-column layout scale for the target 3820 × 4320 portrait display and collapse to
one column on small laptop windows.

The project and partner overview is available at `http://localhost:8080/project`. It
includes a responsive animated SVG explaining the Data Deserts concept and the possible role of AI.

The relay keeps the most recently received state and sends it to renderers when they connect or
reconnect. Both browser clients reconnect automatically. Set `PORT` to use another port. A custom
WebSocket endpoint can be supplied as a `ws` query parameter on either page.

Development mode restarts the Node process when server code changes. It also watches browser assets
under `app/` and `do-app/` and sends connected pages a live-reload event.

## Production package

Build the optimized standalone package:

```sh
npm run build:do-app
```

This creates `dist-do-app/` and `data-deserts-do-app-linux.zip`. Browser JavaScript and CSS are
minified, and the WebSocket dependency is compiled into `do-app/server.mjs`. The ZIP contains no
`node_modules` and needs no installation on the target server. Extract it on a Linux machine with
Node.js 20 or newer and run:

```sh
PORT=8080 node do-app/server.mjs
```

## Event protocol

Clients first identify themselves:

```json
{"type":"hello","role":"controller"}
```

The controller then emits complete, idempotent state snapshots:

```json
{
  "type": "state",
  "state": {
    "yearFrom": 1990,
    "yearTo": 2020,
    "selected": ["biotime", "gbif"],
    "yearlyHistograms": false,
    "groupedDonuts": true
  }
}
```

Only sockets identified as controllers may publish state. The relay sends state only to identified
renderers. This is an unauthenticated local/demo server; add authentication and TLS before exposing
control of a public display.

Zoom, pan, region, and country-search interactions are sent as transient `navigation` events.
Filter state and country navigation are delivered to both map renderers and detached details
panels. Multiple country selections are retained in controller state. The renderer fits the
smallest extent containing every selection, and details panels show alphabetically ordered country
columns. A country clicked directly on a renderer is sent back to the controller and toggled in the
shared selection.

The details page reserves a stable 16-column grid, so cards do not change width as countries are
added; selections beyond 16 wrap to another row. Each card retains an `18rem` minimum width, with
horizontal scrolling instead of compressed content when the configured grid is wider than the
display. Override the capacity with a value from 1 to 32, for example
`http://localhost:8080/details?columns=4` when testing on a laptop.
Renderers report their resulting map view to connected controllers so the displayed zoom level
matches Leaflet. Unlike filter state, navigation, selection, and view events are not retained or
replayed when a client reconnects.

The controller provides a stable, alphabetically displayed quick-navigation sample of 30
DHS-covered countries. Selection is deterministic and balanced across lower, middle, and upper
thirds of cross-dataset availability, so the set spans sparse, mixed, and broad coverage conditions
without changing on every reload. Each button shows the number of datasets with records for that
country.
