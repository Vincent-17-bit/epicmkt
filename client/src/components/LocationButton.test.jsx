import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useGeoStore } from "../stores/geo.js";
import LocationButton, { locationLabel } from "./LocationButton.jsx";

const idle = { status: "idle", source: null, town: null, coords: null, deviceBlocked: false, explaining: false };

beforeEach(() => {
  localStorage.clear();
  useGeoStore.setState(idle);
});

describe("locationLabel", () => {
  it("is short and never shows coordinates", () => {
    expect(locationLabel({ status: "idle" })).toBe("Set location");
    expect(locationLabel({ status: "asking" })).toBe("Locating…");
    expect(locationLabel({ status: "granted", source: "town", town: "Maseno" })).toBe("Maseno");
    expect(locationLabel({ status: "granted", source: "device" })).toBe("Near you");
    expect(locationLabel({ status: "denied" })).toBe("Set location");
  });
});

describe("LocationButton", () => {
  it("invites the shopper to set a location when none is set", async () => {
    render(<LocationButton />);
    await userEvent.click(screen.getByRole("button", { name: "Set location" }));
    expect(useGeoStore.getState().explaining).toBe(true);
  });

  it("shows the chosen town and opens the sheet to change it", async () => {
    useGeoStore.getState().chooseTown("Maseno");
    render(<LocationButton />);
    await userEvent.click(screen.getByRole("button", { name: "Location: Maseno. Change" }));
    expect(useGeoStore.getState().explaining).toBe(true);
  });
});
