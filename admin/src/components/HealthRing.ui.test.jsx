import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { axe } from "vitest-axe";
import HealthRing from "./HealthRing.jsx";
import HealthCard from "./HealthCard.jsx";

afterEach(cleanup);

const health = {
  score: 31, band: "at_risk", label: "At risk", capped: true, weakest: "activity", grace: false,
  bands: { healthy: 70, watch: 40 },
  subs: { profile: 75, freshness: 40, activity: 0, trust: 50 },
  weights: { profile: 20, freshness: 25, activity: 35, trust: 20 },
  reasons: [
    { part: "cap", tone: "bad", points: 0, text: "Suspended: the score cannot rise above 39" },
    { part: "activity", tone: "bad", points: 35, text: "No login, edit or price confirmation for 41 days" },
    { part: "freshness", tone: "warn", points: 15, text: "2 of 5 prices confirmed in the last 14 days" },
    { part: "trust", tone: "warn", points: 10, text: "2 open flags" },
    { part: "profile", tone: "note", points: 5, text: "Profile 6 of 8 complete. Missing: cover photo, address" },
  ],
};

describe("HealthRing", () => {
  it("draws a plain ring from a bare score, with no popover", () => {
    render(<HealthRing score={82} />);
    expect(screen.getByRole("img", { name: "Health 82 out of 100, Healthy" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows no score for a deleted business", () => {
    render(<HealthRing score={null} />);
    expect(screen.getByRole("img", { name: "No health score" })).toHaveTextContent("–");
  });

  it("names the score, band, weakest part and trend for screen readers", () => {
    render(<HealthRing health={health} trend={-6} showLabel />);
    const trigger = screen.getByRole("button", { name: "Health 31 out of 100, At risk, capped, weakest part activity at 0, down 6 points on a week ago" });
    expect(trigger).toHaveTextContent("At risk");
    expect(trigger).toHaveTextContent("−6");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens the breakdown on focus and closes it on Escape, returning focus to the ring", () => {
    render(<HealthRing health={health} trend={4} />);
    const trigger = screen.getByRole("button");
    act(() => trigger.focus());
    const pop = screen.getByRole("region", { name: "Health score breakdown" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls", pop.id);
    expect(pop).toHaveTextContent("Weakest");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("region", { name: "Health score breakdown" })).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("opens on hover, a click pins it past mouse-leave, and a click elsewhere unpins it", async () => {
    render(<HealthRing health={health} />);
    const trigger = screen.getByRole("button");
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole("region", { name: "Health score breakdown" })).toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.mouseLeave(trigger);
    expect(screen.getByRole("region", { name: "Health score breakdown" })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 250));   // the close delay after mouse-leave has passed
    expect(screen.getByRole("region", { name: "Health score breakdown" })).toBeInTheDocument();   // pinned: still open
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
  });

  it("is a portal on the body, so a scrolling table cannot clip it", () => {
    const { container } = render(<div style={{ overflow: "auto" }}><HealthRing health={health} /></div>);
    fireEvent.mouseEnter(screen.getByRole("button"));
    expect(container.querySelector(".health-pop")).toBeNull();
    expect(document.body.querySelector(":scope > .health-pop")).not.toBeNull();
  });

  it("keeps the popover short: three reasons and a pointer to the rest", () => {
    render(<HealthRing health={health} />);
    fireEvent.mouseEnter(screen.getByRole("button"));
    const pop = screen.getByRole("region", { name: "Health score breakdown" });
    expect(pop.querySelectorAll(".health-reason")).toHaveLength(3);
    expect(pop).toHaveTextContent("+2 more on the business page");
  });
});

describe("HealthCard", () => {
  it("shows the four parts with their weights, the weakest tagged, and every reason", () => {
    render(<HealthCard health={health} trend={null} />);
    const parts = screen.getByRole("list", { name: "Score parts" });
    expect(parts.querySelectorAll("li")).toHaveLength(4);
    expect(parts).toHaveTextContent("Activity35%0Weakest");
    expect(parts.querySelectorAll(".health-part__tag")).toHaveLength(1);
    expect(screen.getAllByText(/Suspended|No login|2 of 5|open flags|Profile 6 of 8/).length).toBe(5);
    expect(screen.getByRole("note")).toHaveTextContent(/Capped/);
  });

  it("colours a part by the thresholds the server sent", () => {
    const { container } = render(<HealthCard health={{ ...health, bands: { healthy: 90, watch: 60 } }} />);
    const fills = [...container.querySelectorAll(".health-bar__fill")].map((n) => n.className.match(/--(\w+)$/)[1]);
    expect(fills).toEqual(["warning", "danger", "danger", "danger"]);   // 75, 40, 0, 50 against 90 and 60
  });

  it("says so when nothing costs points", () => {
    render(<HealthCard health={{ ...health, score: 100, band: "healthy", label: "Healthy", capped: false, weakest: null, reasons: [] }} />);
    expect(screen.getByText("Nothing is costing this business points.")).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<main><HealthRing health={health} trend={-6} showLabel /><HealthCard health={health} trend={3} /></main>);
    expect((await axe(container)).violations).toEqual([]);
  });
});
