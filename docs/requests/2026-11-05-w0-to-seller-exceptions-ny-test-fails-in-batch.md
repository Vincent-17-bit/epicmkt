# seller exceptions.test.jsx: the America/New_York "today" test fails when run with other files

- From: w0      - To: seller (Lane C)      - Date: 2026-11-05
- Status: open
- Contract: none (not a contract change; found while verifying Wave 0)

## Need
`seller/src/pages/business/exceptions.test.jsx` > "shop in another zone" > "America/New_York: today is the shop's own date" fails when it runs
in a batch with `catalog/editor/framework.test.jsx`, `catalog/historyView.test.js`, `catalog/insights.test.jsx`, `catalog/panel/itemPanel.test.jsx`,
`catalog/panel/visibility.test.js` and `conversations.test.jsx` (`npx vitest run <those files>` from `seller/`):

```
Expected the element to have attribute: min="2026-10-12"
Received: min="2026-10-11"          (exceptions.test.jsx:60)
```

It passes when the file runs alone (27 of 27, repeated twice).

## Why
Found at `main` e902120. It fails identically with the Wave 0 merge reverted, so it is not caused by Contract v1; it arrived with
`bfc2e6e` (shop zone for offer windows and open-late). A test that depends on which other files share the run will turn a CI run red at random.
Likely cause (not confirmed): the test mixes the real clock with fake timers or a TZ setting, so the shop's "today" differs by one day
depending on timing under load.

## Suggested change
Pin the clock for that test (fake timers with an explicit system time, set before render) and compute `today` from the same pinned time.

## Meanwhile
Wave 0 does not touch this file. `npm test -w seller` run as one process is slow in this environment, so the failure may not show there.
