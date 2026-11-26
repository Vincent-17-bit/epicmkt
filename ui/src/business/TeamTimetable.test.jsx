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

describe("Team social links", () => {
  const amina = (socials) => ({ id: "1", name: "Amina Otieno", role: "Barber", specialties: [], photoUrl: null, services: [], socials });

  it("draws one icon link per network that opens that profile in a new tab, in a fixed order", () => {
    render(<Team team={[amina({ facebook: "https://www.facebook.com/amina.barber", x: "https://x.com/amina_cuts", instagram: "https://www.instagram.com/amina.cuts/", linkedin: "https://www.linkedin.com/in/amina-otieno", reddit: "https://www.reddit.com/user/amina_cuts" })]} />);
    const group = screen.getByRole("list", { name: "Amina Otieno on social media" });
    const links = within(group).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual(["Amina Otieno on X", "Amina Otieno on Instagram", "Amina Otieno on LinkedIn", "Amina Otieno on Reddit", "Amina Otieno on Facebook"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://x.com/amina_cuts", "https://www.instagram.com/amina.cuts/", "https://www.linkedin.com/in/amina-otieno", "https://www.reddit.com/user/amina_cuts", "https://www.facebook.com/amina.barber"]);
    for (const a of links) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a.getAttribute("rel")).toContain("noopener");
      expect(a.getAttribute("rel")).toContain("noreferrer");
    }
    expect(links[1]).toHaveAttribute("title", "Instagram: @amina.cuts");
  });

  it("shows only the networks that are set, and nothing at all when none are", () => {
    const { rerender } = render(<Team team={[amina({ x: "https://x.com/amina_cuts" })]} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    rerender(<Team team={[amina({})]} />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("list", { name: /social media/ })).toBeNull();
    rerender(<Team team={[{ ...amina(), socials: undefined }]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("never draws a stored value that is not a clean address on its own network", () => {
    render(<Team team={[amina({ x: "javascript:alert(1)", instagram: "https://evil.example/amina/", linkedin: "https://www.linkedin.com/in/amina-otieno?trk=x", reddit: "https://www.reddit.com/user/amina_cuts", tiktok: "https://tiktok.com/@a" })]} />);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "https://www.reddit.com/user/amina_cuts");
  });

  it("in a seller's preview the icons are shown but do not go anywhere", () => {
    render(<Team mode="preview" team={[amina({ x: "https://x.com/amina_cuts" })]} />);
    const link = screen.getByLabelText("Amina Otieno on X");
    expect(link).not.toHaveAttribute("href");
    expect(link).toHaveAttribute("aria-disabled", "true");
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
    render(<ClosedBanner status={{ isOpen: false, reasonText: "Closed today: Stocktake", reopens: "Reopens tomorrow at 8:00 AM EAT", closes: null }} showCloses={false} />);
    expect(screen.getByText("Reopens tomorrow at 8:00 AM EAT")).toBeInTheDocument();
  });
  it("adds no banner for a shop that is only outside its hours (the status chip says it)", () => {
    const { container } = render(<ClosedBanner status={{ isOpen: false, reasonText: null, reopens: "Reopens tomorrow at 8:00 AM EAT", closes: null }} showCloses={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
