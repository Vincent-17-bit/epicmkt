import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import HoursTable from "./HoursTable.jsx";

const rows = [
  { day: "mon", name: "Monday", today: false, text: "8:00 AM to 6:00 PM" },
  { day: "tue", name: "Tuesday", today: true, text: "Closed", changed: true, dateLabel: "20 Oct", note: "Public holiday" },
];

describe("HoursTable", () => {
  it("shows an exception's date and its note next to the hours for that date", () => {
    render(<HoursTable rows={rows} />);
    const tuesday = screen.getByText("Tuesday").closest("tr");
    expect(within(tuesday).getByText("20 Oct")).toBeInTheDocument();
    expect(within(tuesday).getByText("Closed")).toBeInTheDocument();
    expect(within(tuesday).getByText("Public holiday")).toBeInTheDocument();
    const monday = screen.getByText("Monday").closest("tr");
    expect(within(monday).queryByText("20 Oct")).toBeNull();
    expect(monday).not.toHaveAttribute("data-changed");
    expect(tuesday).toHaveAttribute("data-changed", "true");
  });

  it("renders the note as plain text: markup in it is shown, never run", () => {
    const evil = `<img src=x onerror="alert(1)"><b>Back</b> soon & <script>alert(2)</script>`;
    const { container } = render(<HoursTable rows={[{ ...rows[1], note: evil }]} />);
    expect(screen.getByText(evil)).toBeInTheDocument();
    expect(container.querySelector("img, b, script")).toBeNull();
  });

  it("a row without an exception shows no note and no date", () => {
    const { container } = render(<HoursTable rows={[{ ...rows[0], dateLabel: "19 Oct", note: null }]} />);
    expect(container.textContent).toBe("Monday8:00 AM to 6:00 PM");
  });

  it("lists a break under the day's hours, in the viewer's time too, and never tags the day as a one-off", () => {
    const withBreak = [{ day: "wed", name: "Wednesday", today: false, text: "9:00 AM to 6:00 PM", shopLabel: "EAT", changed: false, breaks: [{ text: "1:00 PM to 2:00 PM", viewerText: "6:00 AM to 7:00 AM", viewerLabel: "GMT-4", note: "Lunch" }] }];
    render(<HoursTable rows={withBreak} />);
    const wednesday = screen.getByText("Wednesday").closest("tr");
    expect(within(wednesday).getByText("9:00 AM to 6:00 PM")).toBeInTheDocument();
    expect(within(wednesday).getByTestId("break")).toHaveTextContent("Lunch 1:00 PM to 2:00 PM");
    expect(within(wednesday).getByTestId("break-viewer")).toHaveTextContent("6:00 AM to 7:00 AM your time");
    expect(within(wednesday).queryByText("This date only")).toBeNull();
    expect(wednesday).not.toHaveAttribute("data-changed");
  });

  it("calls an unnamed break a break", () => {
    render(<HoursTable rows={[{ day: "wed", name: "Wednesday", today: false, text: "9:00 AM to 6:00 PM", breaks: [{ text: "1:00 PM to 2:00 PM", viewerText: null, note: null }] }]} />);
    expect(screen.getByTestId("break")).toHaveTextContent("Break 1:00 PM to 2:00 PM");
    expect(screen.queryByTestId("break-viewer")).toBeNull();
  });
});
