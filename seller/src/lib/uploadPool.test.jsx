import { describe, it, expect } from "vitest";
import { createPool } from "./uploadPool.js";

const gated = () => {
  let open;
  const gate = new Promise((r) => { open = r; });
  return { gate, open };
};

describe("upload pool", () => {
  it("runs at most the limit at once and starts the next as soon as one finishes", async () => {
    const pool = createPool(3);
    let running = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, gated);
    const results = gates.map((g, n) => pool.add(`j${n}`, async () => {
      running += 1;
      peak = Math.max(peak, running);
      await g.gate;
      running -= 1;
      return n;
    }));
    await Promise.resolve();
    await Promise.resolve();
    expect(pool.running).toBe(3);
    expect(pool.active).toBe(5);
    gates[0].open();
    await results[0];
    await Promise.resolve();
    expect(pool.running).toBe(3);
    gates.slice(1).forEach((g) => g.open());
    expect(await Promise.all(results)).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(3);
    expect(pool.active).toBe(0);
  });

  it("cancels a waiting job without running it, and aborts a running job through its signal", async () => {
    const pool = createPool(1);
    const g = gated();
    let signal;
    let started = false;
    const first = pool.add("a", (s) => { signal = s; return new Promise((_, reject) => s.addEventListener("abort", () => reject(Object.assign(new Error("x"), { code: "upload_cancelled" })))); });
    const second = pool.add("b", async () => { started = true; });
    await Promise.resolve();
    expect(pool.cancel("b")).toBe(true);
    await expect(second).rejects.toMatchObject({ code: "upload_cancelled" });
    expect(pool.cancel("a")).toBe(true);
    expect(signal.aborted).toBe(true);
    await expect(first).rejects.toMatchObject({ code: "upload_cancelled" });
    expect(started).toBe(false);
    expect(pool.cancel("missing")).toBe(false);
    g.open();
  });

  it("whenIdle resolves after the last job, and at once when there is nothing to do", async () => {
    const pool = createPool(2);
    await pool.whenIdle();
    const g = gated();
    const job = pool.add("a", () => g.gate);
    let idle = false;
    const waiting = pool.whenIdle().then(() => { idle = true; });
    await Promise.resolve();
    expect(idle).toBe(false);
    g.open();
    await job;
    await waiting;
    expect(idle).toBe(true);
  });

  it("keeps going after a job fails and cancelAll stops everything", async () => {
    const pool = createPool(1);
    const bad = pool.add("bad", async () => { throw new Error("no"); });
    const good = pool.add("good", async () => "ok");
    await expect(bad).rejects.toThrow("no");
    await expect(good).resolves.toBe("ok");
    const aborts = [];
    const jobs = ["x", "y"].map((id) => pool.add(id, (s) => new Promise((_, reject) => s.addEventListener("abort", () => { aborts.push(id); reject(new Error("c")); }))).catch(() => {}));
    await Promise.resolve();
    pool.cancelAll();
    await Promise.all(jobs);
    expect(aborts).toEqual(["x"]);
    expect(pool.active).toBe(0);
  });
});
