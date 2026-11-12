# Wire the publish checks into the item editor shell

- From: group 5 (5.7)      - To: the item editor shell (ItemEditor.jsx), groups 3 and 4 (media per option, size charts)      - Date: 2026-11-12
- Status: open

## Done in 5.7
`ReviewStep` / `ReviewSection` now show the type's blockers (icon and words, each a jump to its field), the details score and suggestions, and a Publish button that is disabled while anything blocks. `checks/publish.js` (`publishIssues`) holds the logic.

## Needed from the shell
1. Pass `onPublish` and `busy` in the step props: save, then `bulkItems("show", [id])`; show the server's `publish_blocked` detail (`[{key, label, message}]`) if it still refuses. Without `onPublish` the Review step shows no Publish button.
2. Pass `grandfathered: true` for a live item whose type and details have not been changed since it was loaded (the server decides the same way: `item_check_publish(...).grandfathered`).
3. Optionally pass `issues` of `publishIssues(form, { type })` to the side `QualityPanel` so the details score shows beside the form too.

## Needed from groups 3 and 4
- `colourPhotos: [{ id, label, count }]` (photos per colour) and `sizeChart: { needed, has }` as props of the Review step. The checks exist and are tested; they show nothing until these are passed. They are suggestions, not blockers, because the server gate only enforces rows.
