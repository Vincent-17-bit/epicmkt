# Visual regression and small-screen checks

## What runs

`npm run test:visual` serves the production builds of `client` and `seller` and `admin` in mock mode and drives headless Chromium at 320, 375, 768 and 1280 px.

Every page test does three things:

1. Fails on any `pageerror`, `console.error`, failed local request or local HTTP 4xx/5xx.
2. At 320, 375 and 768 px (touch projects) fails if a visible interactive element is smaller than 44x44 px and is not in `e2e/tap-target-baseline.json`.
3. Compares a full-page screenshot with the baseline in `e2e/__screenshots__` (0.2% pixel tolerance).

Time is frozen, `Math.random` is seeded, external requests are stubbed, motion is reduced and service workers are blocked, so renders are repeatable.

## Pages

client: home, search, business, flash, offers, contact, sell, become-a-seller, not-found, open menu.
seller: login, subscription, notifications, questions, exceptions.
admin: command center, applications, businesses, payments, settings, not-found.

## CI

- `visual-regression.yml` runs on pull requests and pushes to `main`. It fails on any diff, JS error or new small target and uploads the report on failure.
- `update-visual-baselines.yml` is run by hand on a branch. It regenerates every screenshot and the tap-target baseline on the CI runner, re-runs the suite to prove it is stable, and commits the result.

Baselines must come from the CI runner. Screenshots from another machine will not match.

## First run

No screenshots are committed yet. Run `update-visual-baselines` once on this branch, review the committed images, then the check goes green. Bot commits do not trigger workflows, so re-run the check from the Actions tab afterwards.

## Changing something on purpose

Run `update-visual-baselines`, review the image and JSON diff in the PR, merge. Always update with the full width matrix: a run limited to one project drops entries that only exist at other widths.

## Tap-target baseline

`e2e/tap-target-baseline.json` lists existing violations per page. It only ratchets: CI fails on a new violation, and fixing one means regenerating the file so the entry disappears.

## Rollback

If a test proves flaky, do not delete it silently:

1. Reproduce with `npx playwright test --repeat-each=5 --grep "<name>"`.
2. Mark that test `test.fixme(true, "<reason and date>")`, or raise `maxDiffPixelRatio` in `playwright.config.js`, and record the reason here.
3. Fix the cause (usually an unstable data source or animation) and remove the `fixme`.

To remove the whole job, delete `.github/workflows/visual-regression.yml`. Nothing else depends on it.
