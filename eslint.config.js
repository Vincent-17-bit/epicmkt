const forbidden = [
  { group: ["**/client/**", "**/seller/**", "**/admin/**", "**/admin-backend/**", "**/backend/**"], message: "@epicmkt/ui must not import from an app." },
  { group: ["epicmkt-client", "epicmkt-seller", "epicmkt-admin", "@epicmkt/backend", "@epicmkt/admin-backend"], message: "@epicmkt/ui must not import from an app." },
  { group: ["@supabase/*", "supabase", "**/supabaseClient*"], message: "@epicmkt/ui must not use Supabase." },
  { group: ["react-router", "react-router-dom", "zustand", "@tanstack/*"], message: "@epicmkt/ui takes data, links and callbacks as props." }
];

export default [
  {
    files: ["ui/src/**/*.{js,jsx}"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { "no-restricted-imports": ["error", { patterns: forbidden }] }
  }
];
