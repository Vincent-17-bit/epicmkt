import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Hours from "./Hours.jsx";
import HoursTable from "./HoursTable.jsx";

const rows = [
  { day: "mon", name: "Monday", today: true, text: "8:00 AM to 8:00 PM" },
  { day: "tue", name: "Tuesday", today: false, text: "8:00 AM to 8:00 PM" },
  { day: "wed", name: "Wednesday", today: false, text: "Closed" }
];

describe("HoursTable", () => {
  it("renders one row per day with the name and text", () => {
    render(<HoursTable rows={rows} />);
    const body = screen.getAllByRole("row");
    expect(body).toHaveLength(3);
    expect(screen.getByRole("rowheader", { name: "Monday" })).toBeInTheDocument();
    expect(screen.getAllByText("8:00 AM to 8:00 PM")).toHaveLength(2);
    expect(screen.getByText("Closed")).toBeInTheDocument();
  });

  it("marks only today's row as the current date", () => {
    render(<HoursTable rows={rows} />);
    const current = screen.getAllByRole("row").filter((row) => row.getAttribute("aria-current") === "date");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Monday");
  });

  it("keeps each cell to its text only", () => {
    const { container } = render(<HoursTable rows={rows} />);
    const cells = container.querySelectorAll("td");
    expect([...cells].map((td) => td.textContent)).toEqual(["8:00 AM to 8:00 PM", "8:00 AM to 8:00 PM", "Closed"]);
    expect(container.querySelectorAll("td > *")).toHaveLength(0);
  });
});

describe("Hours", () => {
  it("wraps the table in an Opening hours section", () => {
    render(<Hours rows={rows} />);
    expect(screen.getByRole("heading", { name: "Opening hours" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Opening hours" })).toContainElement(screen.getByRole("table"));
  });
});
