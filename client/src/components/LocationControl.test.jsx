import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useGeoStore } from "../stores/geo.js";
import { useToastStore } from "../stores/toast.js";
import LocationControl, { describeLocation } from "./LocationControl.jsx";

const idle = { status: "idle", source: null, town: null, coords: null, explaining: false };

beforeEach(() => {
  localStorage.clear();
  useGeoStore.setState(idle);
  useToastStore.setState({ toasts: [] });
});

describe("describeLocation", () => {
  it("names what is in use without showing coordinates", () => {
    expect(describeLocation({ status: "idle" })).toBe("Not set");
    expect(describeLocation({ status: "granted", source: "town", town: "Maseno" })).toBe("Near Maseno");
    expect(describeLocation({ status: "granted", source: "device" })).toBe("Your approximate location");
    expect(describeLocation({ status: "denied" })).toBe("Location is turned off");
    expect(describeLocation({ status: "asking" })).toBe("Finding your location…");
  });
});

describe("LocationControl", () => {
  it("offers to set a location, and no clear button, when none is set", () => {
    render(<LocationControl />);
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set location" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /clear/i })).not.toBeInTheDocument();
  });

  it("opens the location dialog from Change", async () => {
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {} });
    useGeoStore.getState().chooseTown("Maseno");
    render(<LocationControl />);
    await userEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(useGeoStore.getState().explaining).toBe(true);
  });

  it("clears the location, says so, and returns to the unset state", async () => {
    useGeoStore.getState().chooseTown("Maseno");
    render(<LocationControl />);
    expect(screen.getByText("Near Maseno")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(useGeoStore.getState().coords).toBeNull();
    expect(localStorage.getItem("epicmkt.town")).toBeNull();
    expect(useToastStore.getState().toasts[0].message).toMatch(/cleared/i);
  });
});
