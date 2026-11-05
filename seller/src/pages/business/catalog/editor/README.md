# Item editor framework

The editor is built from three small registries, so a new feature adds a file and one line instead of editing `ItemEditor.jsx`.

| Registry | Where | What it holds |
| --- | --- | --- |
| Steps | `steps/index.js` | the sections of the form, in screen order |
| Slices | `model/index.js` | which part of the form each group of fields belongs to |
| Quality checks | `checks/index.js` | the advisory checklist and score |

Pure helpers shared by all three (`PRICED`, `parseKes`, `filled`) live in `fields.js`. `model.js` still exports the same things as before (`qualityChecks`, `errorList`, `firstErrorTarget`, `priceSummary`, ...).

The saved form is still **one flat object**. The saved payload, the draft kept on the device, and the unsaved-changes check are unchanged.

## Add a step

1. Create `steps/<Name>Step.jsx`. It receives `{ form, patch, errors, category, sections, focusOn, media, busy, checks, isNew, goTo }` and renders a `SectionCard` with `id="<stepId>"` (the id the navigation scrolls to).
2. Add one entry to `STEPS` in `steps/index.js`, in the position it should appear:

   ```js
   { id, label, short, component, visibleWhen(model), issues(model), done(model) }
   ```

   `model` is `{ form, errors, mediaCount }`.
   - `label` is the name in the navigation, `short` the word in the phone "Next: ..." button.
   - `visibleWhen` returns `false` to hide the step everywhere (section, navigation, stepper, "Step n of m"). Hidden steps are skipped, never rendered empty.
   - `issues` returns this step's problems from `errorList(model.errors)`.
   - `done` decides the tick in the navigation.
3. If fields in the step can have validation errors, add them to `STEP_OF` and `ERROR_ORDER` in `model.js` so "take me to the first problem" finds them.

The **Options** step is an empty slot between Basics and Price and stock. It is hidden (`visibleWhen: () => false`) and renders nothing until B07 fills it.

## Add a slice

1. Create `model/<name>.js` exporting `{ id, keys: [...], reduce }`.
   - `keys` are the form keys the slice owns. A key belongs to one slice only (a test checks this, and that every key of `emptyItemForm()` is owned).
   - `reduce(form, action)` is optional. Return the next form to handle an action, or `undefined` to fall through to the default `patch`.
2. Append it to `SLICES` in `model/index.js`.

The sections keep calling `patch(key, value)`. `replace(form)` swaps the whole form (after a save, or "Start over"). A key no slice owns is still stored, never dropped.

The media slice owns no keys: photos and videos live in `useMediaSlot` and are never part of the saved form or the draft.

## Add a quality check

1. Create the definition (own file in `checks/` if it is more than a line):

   ```js
   { id, weight, step, focus, todo, done_text, isDone(form, mediaCount), when?(form) }
   ```

   `step` and `focus` are where the seller lands when they tap the suggestion. `when` skips the check for forms it does not apply to.
2. Append it with `registerCheck(def)` (or `registerCheck(def, { after: "<id>" })`), or add it to `CHECKS`. A repeated `id` throws.

Checks are advisory: they never block a save (`validateItemForm` does that). The built-in weights add up to 100, so a new check should come with a decision about how the weights are rebalanced.

## Tests

`framework.test.jsx` covers the step order, the slices and the check registry. `editor.test.jsx` covers the screens.
