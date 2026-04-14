# Work Canvas Test Fixtures

This folder stores local validation assets for the frontend work-canvas host.

The goal is not to build production UI here.
The goal is to prove that the frontend host can safely render:

- inline `html` artifacts via `srcdoc`
- same-origin `url` artifacts
- trusted cross-origin node/web app URLs
- external app-example URLs from the sibling `../app_examples` folder

## Current Example Coverage

### 1. Inline HTML examples

These already exist in the mock artifact data:

- `artifact-weekly-plan`
- `artifact-profile-summary`
- `artifact-mock-interview`
- `artifact-visual-learning`

They validate the `html` / `srcdoc` path and do not need a separate server.

### 2. Same-origin URL fixture

This already exists in:

- `public/mock-node-canvas/index.html`

It validates the `url` host path without introducing a second origin.
It is a legacy host fixture, not the source of truth for external app examples.

### 3. Cross-origin node fixture

Run:

```bash
npm run canvas:node-fixture
```

This starts a minimal node server on `http://127.0.0.1:4318`.

Then start the frontend with the fixture URL and allowlist already wired:

```bash
npm run dev:node-canvas-fixture -- --host 127.0.0.1 --port 4173
```

In that mode, the mock `career-roadmap` artifact automatically points to the
node fixture URL, so the frontend can load it directly in the right-side work
canvas.

The same fixture also supports scenario query params for richer examples:

- `scenario=career-roadmap`
- `scenario=coding-assessment`
- `scenario=visual-learning`

This wrapper is cross-platform because it injects the environment variables
through a node script rather than relying on POSIX-only `VAR=value command`
syntax.

## Why This Exists

The frontend only consumes URLs.
It does not own or boot the real node project used by the upstream team.

For local validation, we still need one small running app to represent a real
node/web canvas surface.
That is what `node-fixture/server.mjs` is for.

### 4. External app examples

These examples live outside this frontend repository:

- `../app_examples/bounce-game`
- `../app_examples/derivative-game`

The frontend only receives and embeds their URLs.
It does not copy their source code and does not manage their runtime.

For the static HTML example, serve the folder over HTTP:

```bash
APP_EXAMPLES_DIR="../app_examples"
python3 -m http.server 4320 --directory "$APP_EXAMPLES_DIR/bounce-game"
```

For the Node example, run the app from its own folder:

```bash
APP_EXAMPLES_DIR="../app_examples"
cd "$APP_EXAMPLES_DIR/derivative-game"
npm start
```

Then start the frontend with the app-example URLs and iframe allowlist:

```bash
npm run dev:app-examples -- --host 127.0.0.1 --port 4173
```

Open these mock threads:

- `/threads/thread-009`: static HTML app URL
- `/threads/thread-010`: Node app URL

If both examples need to be visible at the same time, run three terminals:

- one for the static HTML server
- one for the Node app server
- one for the frontend dev server

## What To Verify

When testing URL-hosted canvases, check:

- the page loads inside the iframe without opening a second browser tab
- conversation message actions can open the target artifact without page-level
  debug buttons
- the origin is included in `VITE_CAREER_AGENT_TRUSTED_CANVAS_ORIGINS`
- the iframe sandbox policy still allows the required behavior
- the app does not send `X-Frame-Options: DENY` or conflicting CSP frame rules
- future `postMessage` or event-channel needs are documented before integration
