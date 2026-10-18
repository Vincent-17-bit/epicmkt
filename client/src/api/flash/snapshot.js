const TTL_MS = 2000;

let cache = null;
let inflight = null;
let generation = 0;

export function invalidateSnapshot() {
  generation += 1;
  cache = null;
  inflight = null;
}

export function loadSnapshot(fetcher) {
  if (cache && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.value);
  if (inflight) return inflight;
  const started = generation;
  const promise = fetcher()
    .then((value) => {
      if (started === generation) cache = { at: Date.now(), value };
      return value;
    })
    .finally(() => {
      if (inflight === promise) inflight = null;
    });
  inflight = promise;
  return promise;
}
