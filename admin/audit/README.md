# Admin responsive audit

Playwright checks used to verify the responsive, accessibility and
interaction behaviour of the admin app. They are not part of `npm test`.

```bash
npm run dev -w admin                      # terminal 1 (http://localhost:5175)
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i --no-save playwright axe-core
export CHROMIUM_PATH=/path/to/chromium    # omit if Playwright's own browser is installed

node admin/audit/interact.mjs   # drawer, table, popovers, cards, bulk bar, toasts, filters, tabs, keyboard, 44px targets, header
node admin/audit/matrix.mjs after   # 12 viewports x 6 routes x light/dark: overflow, overlaps, axe, console; screenshots in docs/screenshots/after
node admin/audit/zoom.mjs       # z-index token order, 200% browser zoom and text-only zoom
node admin/audit/states.mjs     # screenshots of drawer, sheets, popovers, modal, rail
```

Lighthouse accessibility (>= 95) is run separately, for example
`npx lighthouse http://localhost:5175/admin/businesses --only-categories=accessibility`.

Breakpoints and the z-index stack are documented in `admin/src/styles/tokens.css`.
