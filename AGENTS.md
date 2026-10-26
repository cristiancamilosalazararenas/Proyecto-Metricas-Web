# Agent guidance

## Setup and commands

- Require Node.js 20+ and npm; run `npm install` from this directory and keep `package-lock.json` committed.
- Run `npm run validate:config` after editing `config/pages.js` or `config/schedule.js`. It intentionally fails until three distinct HTTP(S) URLs are configured in `config/pages.js`.
- Use Chrome/Chromium for real Lighthouse runs: `npm run cy:run -- --browser chrome` or `npm run audit -- --job mobile-diario --browser chrome`. The `cypress-audit` integration does not run Lighthouse in unsupported browsers such as Cypress Electron.
- Use `npm run cy:open` for interactive Cypress work and `npm run report` to serve the report at `http://localhost:4173`; do not open `report/index.html` with `file://` because it must fetch `data/results.json`.
- `npm run scheduler` starts a long-running local process. Jobs are disabled by default in `config/schedule.js`; enable and configure them before relying on scheduled execution.

## Architecture and data flow

- `config/pages.js`, `config/devices.js`, `config/schedule.js`, and `config/thresholds.js` are the configuration sources. Add pages/devices there rather than duplicating test logic.
- `cypress/e2e/lighthouse.cy.js` creates page/device combinations dynamically. A page with no `http://` or `https://` URL is skipped, so a passing placeholder test does not represent Lighthouse coverage.
- `cypress.config.js` wires `cypress-audit`, normalizes Lighthouse callbacks, classifies metrics, and appends successful or failed runs to `data/results.json`. Keep that JSON tracked because it is the execution history.
- Jobs are passed from `scripts/run-audit.js` as `--env job=...`; Cypress 16 reads the value with `Cypress.expose('job')`. Do not replace this with the removed `Cypress.env()` API.
- `scripts/scheduler.js` is the executable scheduler; `config/schedule.js` only declares jobs. It uses each job's `America/Bogota` timezone, start date, time, frequency, pages, and devices.

## Repository hygiene

- Do not commit `node_modules`, Cypress screenshots/videos/downloads, logs, `.env` files, or editor/OS metadata. Selected evidence may be copied deliberately into a tracked evidence directory.
- Do not remove `package-lock.json` or `data/results.json` to clean generated files; both are intentionally versioned.
