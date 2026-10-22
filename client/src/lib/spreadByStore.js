// Home page products come newest first, so one busy shop could fill the whole section. Take them in rounds,
// at most `perStore` from each shop, keeping each shop's own newest-first order, until `limit` are chosen.
export function spreadByStore(rows, { limit = 12, perStore = 2 } = {}) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.business?.id ?? row.businessId;
    if (!groups.has(key)) groups.set(key, []);
    const group = groups.get(key);
    if (group.length < perStore) group.push(row);
  }
  const queues = [...groups.values()];
  const out = [];
  for (let round = 0; round < perStore && out.length < limit; round += 1) {
    for (const queue of queues) {
      if (round < queue.length && out.length < limit) out.push(queue[round]);
    }
  }
  return out;
}
