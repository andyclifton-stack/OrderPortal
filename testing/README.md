# OrderPortal checks

Use Node 22 or 24. Install locked dependencies with `npm ci`, then install the automated browser with `npx playwright install chromium`. These installation steps require network access. The tests use synthetic data and local assets.

## Commands

- `npm test` runs the explicit offline suite in `offline-suite.json`, followed by a negative public-action allow-list check. Logs are written to `output/offline-tests`.
- `npm run test:browser` checks the current local portal, recovery controls, labels, responsive layouts and dependency failure feedback with Playwright Chromium. Screenshots are written to `output/browser`.
- `npm run preview` serves synthetic pages at `http://127.0.0.1:8766/`, `/dashboard.html` and `/configuration.html`.
- `npm run preview:emails` captures service-sender messages and generates synthetic email previews under `output/`.
- `npm run check:upload` uses clasp's local file collector and verifies an independent allow-list of 14 application files. Run it before every push.
- `npm run test:historical -- --performance-baseline "C:/path/to/performance/local" --requester-baseline "C:/path/to/requester/Code.js"` runs explicit historical comparisons. Missing baselines fail with their expected path. Historical sources stay outside Git.

The legacy browser and build utilities are individually callable diagnostic tools. They are excluded from the default suite because some compare historical versions, generate source, or use specialised fixtures. The current browser acceptance command is `test:browser`.

## Assets and uploads

`vendor/assets.json` records exact official URLs, SHA-384 hashes and observed CORS headers. The vendored SheetJS asset is version 0.20.1. `fetch-assets.cjs` refreshes these assets only when explicitly run during maintenance. Review changed hashes and matching application integrity attributes before committing an asset update.

All Node tooling and browser assets belong under `testing/`. The deployment ignore file excludes test files, npm dependencies, package metadata and outputs. Deployment must use `C:/Projects/clasp_manager.bat`; `--push OrderPortal` updates HEAD/DEV. A live release needs Andy's explicit instruction.

Hosted DEV write checks can send real `[DEV TEST]` emails to Andy's school address. Local suites mock mail delivery. Use synthetic records in DEV and report any created references in the verification handover.

The recent-changes date in this candidate must be updated to the actual live release date before publication.
