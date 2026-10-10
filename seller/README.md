# EpicMKT seller portal

```
npm run dev:seller        # from the repo root, http://localhost:5174
npm run test -w seller    # component tests
```

By default the app runs against an in-memory mock (`VITE_API_MODE=mock`). Demo sign-ins, password `Demo-Passw0rd`:

- `ES100001`: Standard plan (Premium sections show an upgrade prompt)
- `ES100002`: Premium plan (announcement banner and branches unlocked)

Set `VITE_API_MODE=live` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to use Supabase (see `.env.example`).

Routes: `/business/account` (My Account), `/business/plan` (placeholder), `/login`.
