import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useGeoStore } from "../stores/geo.js";
import { useToastStore } from "../stores/toast.js";
import LocationDialog from "./LocationDialog.jsx";

const idle = { status: "idle", source: null, town: null, place: null, coords: null, deviceBlocked: false, explaining: false };

beforeEach(() => {
  localStorage.clear();
  useGeoStore.setState(idle);
  useToastStore.setState({ toasts: [] });
  HTMLDialogElement.prototype.showModal ??= function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close() {
    this.removeAttribute("open");
  };
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: () => {} } });
});

const openSheet = () => useGeoStore.setState({ explaining: true });

describe("LocationDialog", () => {
  it("offers both ways to set a location and no reset when none is set", () => {
    openSheet();
    render(<LocationDialog />);
    expect(screen.getByRole("button", { name: "Use my location" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Or search for your area" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset/i })).not.toBeInTheDocument();
  });

  it("applies a chosen town and closes", async () => {
    openSheet();
    render(<LocationDialog />);
    await userEvent.type(screen.getByRole("combobox"), "mase");
    await userEvent.click(await screen.findByRole("option", { name: /Maseno/ }));
    expect(useGeoStore.getState()).toMatchObject({ status: "granted", town: "Maseno, Kisumu", explaining: false });
  });

  it("shows the area name found for the device location instead of a generic label", () => {
    useGeoStore.setState({ status: "granted", source: "device", coords: { lat: -1.29, lng: 36.78 }, place: "Kilimani, Nairobi", explaining: true });
    render(<LocationDialog />);
    expect(screen.getByText("Kilimani, Nairobi")).toBeInTheDocument();
  });

  it("resets the location, says so, and returns to unset", async () => {
    useGeoStore.getState().chooseTown("Maseno");
    openSheet();
    render(<LocationDialog />);
    await userEvent.click(screen.getByRole("button", { name: "Reset location" }));
    expect(useGeoStore.getState()).toMatchObject({ status: "idle", town: null, coords: null });
    expect(localStorage.getItem("epicmkt.town")).toBeNull();
    expect(useToastStore.getState().toasts[0].message).toBe("Location reset");
  });

  it("hides the device button and says why when the browser blocks location", () => {
    useGeoStore.setState({ deviceBlocked: true, explaining: true });
    render(<LocationDialog />);
    expect(screen.queryByRole("button", { name: "Use my location" })).not.toBeInTheDocument();
    expect(screen.getByText("Location is blocked in this browser.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Search for your area" })).toBeInTheDocument();
  });
});
