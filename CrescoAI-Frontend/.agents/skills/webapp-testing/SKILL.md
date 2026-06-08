---
name: webapp-testing
description: Run and verify this repository's local web app with a temporary dev server and short Python Playwright scripts. Use only when repo-local server lifecycle, localhost browser checks, DOM reconnaissance, screenshots, or browser console capture are needed. Do not use for general browser automation, public websites, Playwright CLI snapshot workflows, reusable Playwright test suites, UI design review, Vue architecture, or theme decisions.
---

# Local Webapp Test Harness

Use this skill only for browser-level verification of this repository's local web app.

## Responsibility

This skill owns:

- starting one or more local dev servers for a temporary browser check
- waiting for localhost ports before running verification scripts
- writing short Python Playwright scripts for task-specific checks
- collecting rendered DOM evidence, screenshots, and browser console logs
- validating one realistic local UI path after frontend edits

This skill does not own:

- generic browser automation against public URLs; use the global `playwright` skill
- Playwright CLI snapshot workflows with element refs; use the global `playwright` skill
- permanent `@playwright/test` suites unless the user explicitly asks for test files
- Vue app architecture, state, routing, API contracts, or component boundaries; use `Vue Agent Delivery`
- theme tokens, color systems, or visual identity; use `Career Theme Palette`
- broad visual design or accessibility audits; use the relevant design review skill

## Workflow

Prefer native Python Playwright scripts for exploratory checks and focused end-to-end verification.

1. Determine whether the target is static HTML or a dev-server app.
2. If static HTML, inspect the HTML for selectors and use a `file://` URL.
3. If a server is needed and is not already running, run `python .agents/skills/webapp-testing/scripts/with_server.py --help` first.
4. Start the required server with `with_server.py`, then run a short Playwright script against `localhost`.
5. For dynamic apps, always navigate, wait for the rendered state, inspect, then act.

If the task can be handled with the global Playwright CLI skill without starting this repo's app or using the local server helper, prefer that skill instead.

## Helper Script

Use `scripts/with_server.py` as a black-box helper for local server lifecycle:

```bash
python .agents/skills/webapp-testing/scripts/with_server.py \
  --server "npm run dev" --port 5173 \
  -- python /tmp/check_app.py
```

For multi-process apps:

```bash
python .agents/skills/webapp-testing/scripts/with_server.py \
  --server "cd backend && python server.py" --port 3000 \
  --server "npm run dev" --port 5173 \
  -- python /tmp/check_app.py
```

Run `--help` before using the helper so the current options are visible.

## Playwright Pattern

Use synchronous Playwright for small verification scripts:

```python
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 1000})
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    page.screenshot(path="/tmp/app.png", full_page=True)
    browser.close()
```

## Reconnaissance Then Action

- First collect rendered evidence: screenshot, `page.content()`, visible buttons, links, inputs, headings, and console logs.
- Identify reliable selectors from rendered state. Prefer roles, visible text, labels, stable IDs, and semantic selectors.
- Then execute interactions and assertions.
- Keep scripts short and task-specific; delete or leave them in `/tmp` unless the repo already has a test location for them.

## Common Pitfalls

- Do not inspect a dynamic app before waiting for client-side rendering to settle.
- Do not rely on arbitrary timeouts when a selector or load state can be awaited.
- Do not put server startup logic inside the Playwright script when `with_server.py` can manage it.
- Always close the browser.

## Examples

Reference examples are available in `examples/`:

- `element_discovery.py` discovers buttons, links, inputs, and captures a page screenshot.
- `console_logging.py` captures browser console messages during interaction.
- `static_html_automation.py` demonstrates `file://` automation for static HTML.
