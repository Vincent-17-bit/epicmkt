import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import TrendChart from "./TrendChart.jsx";

const days = (counts) => counts.map((view, i) => ({ bucket: `2026-10-${String(i + 1).padStart(2, "0")}`, view, whatsapp: 0, call: 0, directions: 0 }));
const draw = (counts, grain = "day") => render(<TrendChart series={days(counts)} metric="view" label="Views" grain={grain} />);

describe("trend chart", () => {
  it("names both axes and shows tidy scale labels", () => {
    const { container } = draw([0, 4, 29, 10, 0]);
    expect(screen.getByText("Views per day")).toBeInTheDocument();
    expect(container.textContent).toContain("1 Oct");
    expect(container.textContent).toContain("5 Oct");
    expect(within(container.querySelector("[class*='yLabels']")).getAllByText(/^\d+$/).map((e) => e.textContent)).toEqual(["0", "10", "20", "30"]);
  });

  it("marks the peak", () => {
    draw([0, 4, 29, 10, 0]);
    expect(screen.getByText("Peak 29")).toBeInTheDocument();
  });

  it("reads each point with the arrow keys", async () => {
    const user = userEvent.setup();
    draw([0, 4, 29, 10, 0]);
    screen.getByRole("group", { name: /Views over time/ }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("status")).toHaveTextContent("views");
    await user.keyboard("{Home}");
    expect(screen.getByRole("status")).toHaveTextContent("1 Oct 2026: 0 views");
    await user.keyboard("{End}");
    expect(screen.getByRole("status")).toHaveTextContent("5 Oct 2026: 0 views");
  });

  it("switches to a table of every point and back", async () => {
    const user = userEvent.setup();
    draw([0, 4, 29]);
    await user.click(screen.getByRole("button", { name: "View as table" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("row", { name: /3 Oct 2026/ })).toHaveTextContent("29");
    await user.click(screen.getByRole("button", { name: "View as chart" }));
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("draws a lone spike as a point, not a ramp", () => {
    const { container } = draw([0, 0, 0, 0, 0, 0, 4]);
    expect(screen.getByText("Peak 4")).toBeInTheDocument();
    expect(container.querySelectorAll("[class*='point']").length).toBe(1);
    expect(container.querySelector("[class*='area']")).toBeNull();
  });

  it("titles the axis by bucket size", () => {
    draw([1, 2], "month");
    expect(screen.getByText("Views per month")).toBeInTheDocument();
  });
});
