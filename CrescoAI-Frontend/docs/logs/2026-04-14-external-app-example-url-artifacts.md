# External App Example URL Artifacts

## Context

The previous URL canvas fixtures lived inside the frontend repository:

- `public/mock-node-canvas/index.html`
- `tests/work-canvas/node-fixture/server.mjs`

Those remain useful for host behavior tests, but they are not a good stand-in
for future generated app artifacts.

## Decision

Use the sibling examples under `../app_examples` as external URL fixtures:

- `bounce-game`: static HTML app
- `derivative-game`: Node / Web app

The frontend only consumes URLs and embeds them as trusted URL artifacts. It
does not copy source files, start Node projects, or manage external process
lifecycle.

## Implementation

- Added `VITE_CAREER_AGENT_HTML_APP_EXAMPLE_URL`.
- Added `VITE_CAREER_AGENT_NODE_APP_EXAMPLE_URL`.
- Added `npm run dev:app-examples` to start the frontend with local URL and
  iframe allowlist configuration.
- Added `thread-009` for the static HTML app example.
- Added `thread-010` for the Node app example.

## Local Validation Commands

Static HTML example:

```bash
APP_EXAMPLES_DIR="../app_examples"
python3 -m http.server 4320 --directory "$APP_EXAMPLES_DIR/bounce-game"
```

Node app example:

```bash
APP_EXAMPLES_DIR="../app_examples"
cd "$APP_EXAMPLES_DIR/derivative-game"
npm start
```

Frontend:

```bash
npm run dev:app-examples -- --host 127.0.0.1 --port 4173
```

## Boundary

Do not pass `file://` URLs or absolute local filesystem paths to the frontend.
If an upstream agent creates files, the backend should either return safe
`payload.html` content for simple single-file HTML or serve the output as a
trusted HTTP URL for multi-file apps and Node/Web projects.
