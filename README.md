# Miro Games

A Svelte/Vite airline quiz app with modes for airline groups, alliances, hubs,
logos, countries, liveries, airport carriers, and route trivia.

## Run Locally

Install dependencies:

```sh
npm install
```

Start the dev server:

```sh
npm run dev
```

Vite prints the local URL in the terminal. If `5173` is busy, it will choose the
next available port, for example `http://localhost:5175/games/`.

## Checks

Run Svelte and TypeScript checks:

```sh
npm run check
```

Build for production:

```sh
npm run build
```

## Route Data

Airport route answers live in `src/data/airport-routes.json`. The game only uses
entries marked `destinationRanked: true` for Airport Routes.

Regenerate and validate airline route data:

```sh
python data-pipeline/airline_from_hub_routes.py
python data-pipeline/validate_route_sources.py
```

The airline route mode is a sourced public-data approximation. Order comes from
hub-airport route rankings, and destinations are checked against airline
destination pages.
