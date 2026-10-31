# Admin accessibility (WCAG 2.2 AA)

Scope: the `/admin` app only. Contrast numbers live in [admin-contrast.md](./admin-contrast.md).

## Run it

```bash
npm run check:a11y -w admin     # from the repo root; or `npm run check:a11y` inside admin/
```

This runs, in order:

1. `scripts/contrast-audit.mjs`: every token pair in both themes against AA (text 4.5:1, UI 3:1). Fails on any miss.
   Add `--write` to regenerate `docs/admin-contrast.md` after changing a token.
2. The accessibility test files under `vitest`:
   - `src/theme/contrast.ui.test.js`: the same pairs as tests.
   - `src/theme/reducedMotion.ui.test.js`: the global `prefers-reduced-motion` rule exists and cannot be out-ranked.
   - `src/a11y.axe.ui.test.jsx`: axe-core on Command Center, Businesses and Settings, light and dark. Fails on any
     **serious or critical** violation. Includes a self-test that proves the helper catches a real violation.
   - `src/layouts/AdminShell.a11y.ui.test.jsx`: role-based sidebar visibility, landmarks, `aria-current`, skip link wiring,
     keyboard order through the header, bell/popover Escape returning focus, the mobile More sheet (focus in, Tab trap,
     Escape, focus back), dialog focus trap and return focus, toast status region.
   - `src/components/DataTable/DataTable.a11y.ui.test.jsx`: sortable columns announce `aria-sort`, and sorting works
     from the keyboard.

`npm test`, `npm run test:ui` and `npm run build` must also pass before merging.

## What is not covered by `check:a11y`

jsdom has no layout engine, so these run in a real browser instead and are re-run by hand when styles change:

- **axe in Chromium** (adds `color-contrast`): inject `node_modules/axe-core/axe.min.js` into each admin page, light and dark,
  at 1280 px and 390 px, and run with tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice.
  Last result: zero `color-contrast` violations on 17 pages.
- **Focus visibility:** press Tab through a page and confirm every stop shows an outline or ring.
- **Skip link:** first Tab stop, visible on focus, Enter moves focus to `main#admin-content`
  (jsdom does not implement fragment focus, so the unit test checks the wiring only).
- **Screen readers:** not run automatically. Spot-check with NVDA + Firefox or VoiceOver + Safari before a release.

## Conventions that keep it passing

- **Colour:** use tokens only (`theme.css`). Form-field borders use `--border-control`; cards and dividers use `--border`.
- **Motion:** never write motion that matters to understanding. The global rule in `styles/base.css` removes transitions
  and animations when the OS asks for reduced motion. Do not add `scroll-behavior: smooth`.
- **Headings:** one `<h1>` (page title), panel and section titles are `<h2 className="heading-sm">`, sub-sections `<h3>`.
  Do not skip levels.
- **Tables:** header cells are `<th scope="col">`. An empty header (row actions) gets `<span className="sr-only">Actions</span>`.
  Sortable `DataTable` columns expose `aria-sort`; sort buttons stay in the tab order.
- **Dialogs and sheets:** use `Modal` or `useFocusTrap` (`hooks/useFocusTrap.js`). Popovers use `useDismiss(ref, open, close, triggerRef)`
  so Escape returns focus to the control that opened them.
- **Icon-only buttons** need an `aria-label`. If a control shows text, its accessible name must start with that text (2.5.3).
- **Inline styles:** none, except CSS custom properties carrying runtime values (`style={{ "--dt-y": "48px" }}`), which a class consumes.

## Stylesheet layout

`src/styles/index.css` imports, in cascade order: `typography`, `theme`, `base`, `layout`, `components/*`, `pages/*`,
`layout-responsive`, `responsive`, `login`. Import order is the cascade order; do not reorder.
