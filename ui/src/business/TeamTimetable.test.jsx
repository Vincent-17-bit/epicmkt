import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import Team from "./Team.jsx";
import Timetable from "./Timetable.jsx";
import ClosedBanner from "./ClosedBanner.jsx";

describe("Team", () => {
  it("renders nothing without a team", () => {
    const { container } = render(<Team team={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows each person with role, specialties and services; initials when there is no photo", () => {
    render(<Team team={[{ id: "1", name: "Amina Otieno", role: "Barber", specialties: ["fade", "beard"], photoUrl: null, services: ["Fade cut"] }, { id: "2", name: "Ken", role: null, specialties: [], photoUrl: "https://x.example/k.jpg", services: [] }]} />);
    expect(screen.getByRole("heading", { name: "Our team" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Amina Otieno" })).toBeInTheDocument();
    expect(screen.getByText("AO")).toBeInTheDocument();
    expect(screen.getByText("fade · beard")).toBeInTheDocument();
    expect(screen.getByText("Does: Fade cut")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ken" })).toBeInTheDocument();
  });
});

describe("Timetable", () => {
  it("renders nothing without classes", () => {
    const { container } = render(<Timetable slots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("groups classes by weekday in time order and leaves empty days out", () => {
    render(<Timetable slots={[
      { id: "b", day: 3, start: "18:00", end: "19:00", name: "Yoga", trainer: null },
      { id: "a", day: 3, start: "07:00", end: "08:00", name: "Spin", trainer: "Ken" },
      { id: "c", day: 1, start: "09:00", end: "10:00", name: "Zumba", trainer: null },
    ]} />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Monday", "Wednesday"]);
    const wed = screen.getByRole("heading", { name: "Wednesday" }).parentElement;
    expect(within(wed).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["07:00 to 08:00SpinKen", "18:00 to 19:00Yoga"]);
  });
});

describe("ClosedBanner closes text", () => {
  const status = { isOpen: true, reasonText: "Special hours today", reopens: null, closes: "Closes 6:00 PM EAT" };
  it("shows when the shop closes by default", () => {
    render(<ClosedBanner status={status} />);
    expect(screen.getByText("Closes 6:00 PM EAT")).toBeInTheDocument();
  });
  it("hides it when the seller switched the chip off, but keeps the reason", () => {
    render(<ClosedBanner status={status} showCloses={false} />);
    expect(screen.queryByText("Closes 6:00 PM EAT")).not.toBeInTheDocument();
    expect(screen.getByText("Special hours today")).toBeInTheDocument();
  });
  it("still says when a closed shop reopens", () => {
    render(<ClosedBanner status={{ isOpen: false, reasonText: null, reopens: "Reopens tomorrow at 8:00 AM EAT", closes: null }} showCloses={false} />);
    expect(screen.getByText("Reopens tomorrow at 8:00 AM EAT")).toBeInTheDocument();
  });
});
