import { describe, expect, it } from "vitest";
import { SEED_SIZE_CHARTS } from "@epicmkt/shared";
import { canToggleUnit, chartInUnit } from "./sizeChartUnits.js";

const chart = (name) => SEED_SIZE_CHARTS.find((c) => c.name === name);

describe("chartInUnit", () => {
  it("shows the stored unit unchanged", () => {
    const dress = chart("Dresses and tops (cm)");
    expect(chartInUnit(dress, "cm").rows).toEqual(dress.rows);
  });
  it("converts a dress chart to inches and leaves the size letters alone", () => {
    const out = chartInUnit(chart("Dresses and tops (cm)"), "in");
    expect(out.columns).toEqual(["Size", "Bust", "Waist", "Hip"]);
    expect(out.rows[0]).toEqual(["XS", "31.5", "24.4", "34.6"]);
  });
  it("does not double convert a collar chart that already has both units", () => {
    const out = chartInUnit(chart("Shirt collar"), "cm");
    expect(out.columns).toEqual(["Collar (cm)", "Collar (cm)", "Shirt size"]);
    expect(out.rows[0][0]).toBe("35.6");
    expect(out.rows[0][1]).toBe("35.6");
    expect(out.rows[0][2]).toBe("S");
  });
  it("converts only the foot length of a shoe chart, never EU, UK or US", () => {
    const shoes = chart("Men's shoes");
    const out = chartInUnit(shoes, "in");
    expect(out.columns[3]).toBe("Foot length (in)");
    expect(out.rows[0].slice(0, 3)).toEqual(shoes.rows[0].slice(0, 3));
    expect(out.rows[0][3]).toBe(String(Math.round((Number(shoes.rows[0][3]) / 2.54) * 10) / 10));
  });
  it("leaves text cells such as age ranges as typed", () => {
    expect(chartInUnit(chart("Kids clothes (age)"), "in").rows[0][0]).toBe("2-3 years");
  });
  it("cannot toggle a chart with no length unit", () => {
    expect(canToggleUnit({ unit: "none" })).toBe(false);
    expect(chartInUnit({ unit: "kg", columns: ["a"], rows: [["1"]] }, "in").rows).toEqual([["1"]]);
  });
});
