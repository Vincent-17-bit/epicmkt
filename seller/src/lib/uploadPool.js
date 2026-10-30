export function createPool(limit = 3) {
  const waiting = [];
  const running = new Map();
  const idle = [];

  const settle = () => {
    if (waiting.length === 0 && running.size === 0) idle.splice(0).forEach((resolve) => resolve());
  };

  const next = () => {
    while (running.size < limit && waiting.length > 0) {
      const job = waiting.shift();
      const controller = new AbortController();
      running.set(job.id, controller);
      Promise.resolve()
        .then(() => job.start(controller.signal))
        .then(job.resolve, job.reject)
        .finally(() => {
          running.delete(job.id);
          next();
          settle();
        });
    }
  };

  return {
    add(id, start) {
      return new Promise((resolve, reject) => {
        waiting.push({ id, start, resolve, reject });
        next();
      });
    },
    cancel(id) {
      const queued = waiting.findIndex((job) => job.id === id);
      if (queued >= 0) {
        const [job] = waiting.splice(queued, 1);
        job.reject(Object.assign(new Error("cancelled"), { code: "upload_cancelled" }));
        settle();
        return true;
      }
      const controller = running.get(id);
      if (controller) {
        controller.abort();
        return true;
      }
      return false;
    },
    cancelAll() {
      [...waiting.map((j) => j.id), ...running.keys()].forEach((id) => this.cancel(id));
    },
    get active() {
      return running.size + waiting.length;
    },
    get running() {
      return running.size;
    },
    whenIdle() {
      if (waiting.length === 0 && running.size === 0) return Promise.resolve();
      return new Promise((resolve) => idle.push(resolve));
    },
  };
}
