# Cross-lane requests

A lane edits only the paths it owns. When you need a change in a path another lane owns (or in a shared file outside your list), do not
edit it: write a request file here, keep coding against the contract, and mark the stand-in `// TODO(contract:<ID>)`.

## File name

```
docs/requests/<YYYY-MM-DD>-<from>-to-<to>-<topic>.md
```

- `<YYYY-MM-DD>`: the day you write it.
- `<from>`: your lane letter, or your wave and prompt id (`w0`, `b3`), lower case.
- `<to>`: the lane that owns the path (`a`, `b`, `c`). If you do not know the lane, use the surface that owns it (`client`, `seller`, `admin`,
  `supabase`); the receiver may rename the file to the lane letter.
- `<topic>`: a few words, kebab-case.

Example: `2026-11-05-w0-to-client-items-list-and-related.md`

## One need per file

One file asks for one thing. Two needs are two files, so each can be answered, accepted or declined on its own.

## What goes in the file

```
# <the need, in one line>

- From: <lane / prompt id>      - To: <lane>      - Date: <YYYY-MM-DD>
- Status: open            (open | accepted | done | declined)
- Contract: v<N>, <ID of the change in docs/contracts/CHANGES.md, if any>

## Need
What must change, in which file(s), in plain words.

## Why
What is blocked or wrong without it.

## Suggested change
The smallest change that would do (a snippet is welcome).

## Meanwhile
The stand-in you wrote and where (`// TODO(contract:<ID>)`), so the integration pass can find it.
```

## Answering

The receiving lane appends a `## Response` section (what it did, the commit or pull request) and changes `Status`. Do not delete or rename
a request once answered; the history is the point. A request that changes a contract also gets an entry in `docs/contracts/CHANGES.md`.
