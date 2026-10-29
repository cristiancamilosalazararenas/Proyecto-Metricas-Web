# Agent guidance

## Setup and commands

- Require Node.js 20+ and npm; run `npm install` from this directory and keep `package-lock.json` committed.
- Run `npm run validate:config` after editing `config/pages.js` or `config/schedule.js`. It intentionally fails until three distinct HTTP(S) URLs are configured in `config/pages.js`.
- Use Chrome/Chromium for real Lighthouse runs: `npm run cy:run -- --browser chrome` or `npm run audit -- --job mobile-diario-20 --browser chrome`. The `cypress-audit` integration does not run Lighthouse in unsupported browsers such as Cypress Electron.
- Use `npm run cy:open` for interactive Cypress work and `npm run report` to serve the report at `http://localhost:4173`; do not open `report/index.html` with `file://` because it must fetch `data/results.json`.
- `npm run scheduler` starts a long-running local process. The current configuration has enabled daily mobile and desktop jobs at 20:00 and 22:00 (`America/Bogota`); keep the terminal and computer active for scheduled execution.

## Architecture and data flow

- `config/pages.js`, `config/devices.js`, `config/schedule.js`, and `config/thresholds.js` are the configuration sources. Add pages/devices there rather than duplicating test logic.
- Follow the Cypress hierarchy: keep specifications in `cypress/e2e/`, static test data in `cypress/fixtures/`, reusable commands in `cypress/support/commands.js`, and global support loading in `cypress/support/e2e.js`.
- `cypress/plugins/` is retained for the academic folder convention. This project uses Cypress 10+, so Node event handlers and tasks belong in `cypress.config.js` through `setupNodeEvents()` rather than in a legacy plugins file.
- `cypress/e2e/lighthouse.cy.js` creates page/device combinations dynamically. A page with no `http://` or `https://` URL is skipped, so a passing placeholder test does not represent Lighthouse coverage.
- `cypress.config.js` wires `@cypress-audit/lighthouse`, normalizes Lighthouse callbacks, classifies metrics, and appends successful or failed runs to `data/results.json`. Keep that JSON tracked because it is the execution history.
- Jobs are passed from `scripts/run-audit.js` as `--env job=...`; Cypress 16 reads the value with `Cypress.expose('job')`. A manual page can be selected with `--env page=...`. Do not replace this with the removed `Cypress.env()` API.
- `scripts/scheduler.js` is the executable scheduler; `config/schedule.js` only declares jobs. It uses each job's `America/Bogota` timezone, start date, time, frequency, pages, and devices.

## Repository hygiene

- Do not commit `node_modules`, Cypress screenshots/videos/downloads, logs, `.env` files, or editor/OS metadata. Selected evidence may be copied deliberately into a tracked evidence directory.
- Do not remove `package-lock.json` or `data/results.json` to clean generated files; both are intentionally versioned.
