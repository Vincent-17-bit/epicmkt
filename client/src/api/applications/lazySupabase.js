// The Supabase client (auth, realtime, storage, functions and the REST builder) is about 59 KB gzipped, and the first screen only
// needs one read, which index.html already starts on its own (see earlyFlashFetch in vite.config.js). So the pages that must be fast
// talk to Supabase through this thin front: it looks like the client for from() and rpc(), but the real client is only fetched and
// built when a query is actually sent.
//
// A query chain is recorded as it is written (.from().select().eq()...) and replayed on the real builder the moment it is awaited,
// so every call site keeps working exactly as it did with the eager client.
let client = null;

export const loadSupabase = () => (client ??= import("./supabaseClient.js").then((m) => m.supabase));

const deferred = (root, args) => {
  const calls = [];
  let started = null;
  const run = () =>
    (started ??= loadSupabase().then((real) => calls.reduce((builder, [method, params]) => builder[method](...params), real[root](...args))));
  const chain = new Proxy(
    {},
    {
      get(_, prop) {
        if (prop === "then") return (ok, fail) => run().then(ok, fail);
        if (prop === "catch") return (fail) => run().catch(fail);
        if (prop === "finally") return (done) => run().finally(done);
        if (typeof prop === "symbol") return undefined;
        return (...params) => {
          calls.push([prop, params]);
          return chain;
        };
      }
    }
  );
  return chain;
};

export const supabase = {
  from: (...args) => deferred("from", args),
  rpc: (...args) => deferred("rpc", args)
};
