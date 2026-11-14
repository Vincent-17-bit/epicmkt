import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureAxe } from "vitest-axe";
import Delivery, { directionsHref } from "./Delivery.jsx";
import { useGeoStore } from "../../stores/geo.js";

const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
const shop = { name: "Aqua Fresh", area: "Milimani", lat: -0.1021, lng: 34.7523 };
const north = (km) => ({ lat: shop.lat + km / 111.19, lng: shop.lng });
const at = (coords, extra = {}) => useGeoStore.setState({ status: coords ? "granted" : "idle", source: coords ? "device" : null, town: null, coords, ...extra });
const mount = (seller) => render(<Delivery ctx={{ seller }} />);
const delivers = (over = {}) => ({ ...shop, delivery: { offers: true, fee: 100, radiusKm: 6, area: "Milimani and CBD", minOrder: 200, notes: "Before noon", ...over } });

beforeEach(() => at(null));
afterEach(cleanup);

describe("Delivery states", () => {
  it("renders nothing without a seller", () => {
    expect(mount(null).container).toBeEmptyDOMElement();
  });

  it("no delivery: grey pin text, pickup line and Directions", () => {
    mount({ ...shop, delivery: { offers: false } });
    expect(screen.getByText("No delivery")).toBeInTheDocument();
    expect(screen.getByText("Pick up from Aqua Fresh, Milimani")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Directions/ })).toHaveAttribute("href", directionsHref(shop));
  });

  it("a payload with no delivery data at all shows nothing, so older pages stay as they were", () => {
    expect(mount(shop).container).toBeEmptyDOMElement();
  });

  it("no delivery and no coordinates: no Directions link", () => {
    mount({ name: "Aqua Fresh", area: "Milimani", delivery: { offers: false } });
    expect(screen.queryByRole("link", { name: /Directions/ })).toBeNull();
  });

  it("delivers, position unknown: fee, area, distance, minimum, notes and the two actions; nothing asks the browser", async () => {
    const ask = vi.fn();
    useGeoStore.setState({ request: ask });
    mount(delivers());
    expect(screen.getByText("Delivery KES 100")).toBeInTheDocument();
    expect(screen.getByText(/Delivers to Milimani and CBD/)).toBeInTheDocument();
    expect(screen.getByText("Within 6 km of the shop")).toBeInTheDocument();
    expect(screen.getByText("Minimum order KES 200")).toBeInTheDocument();
    expect(screen.getByText("Before noon")).toBeInTheDocument();
    expect(screen.getByText(/Share your location/)).toBeInTheDocument();
    expect(ask).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Use my location" }));
    expect(ask).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Choose your town" }));
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("inside: says so with the distance, and no longer offers 'Use my location'", () => {
    at(north(3));
    mount(delivers());
    expect(screen.getByText(/Delivers to you/)).toHaveTextContent("about 3 km away");
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();
    expect(screen.getByRole("button", { name: "Change location" })).toBeInTheDocument();
  });

  it("outside: says so in words", () => {
    at(north(15));
    mount(delivers());
    expect(screen.getByText(/Outside this shop's delivery distance/)).toHaveTextContent("about 15 km away");
  });

  it("a chosen town labels the distance as based on that town", () => {
    at(north(2), { source: "town", town: "Kisumu" });
    mount(delivers());
    expect(screen.getByText(/Delivers to you/)).toHaveTextContent("about 2 km away, based on Kisumu");
  });

  it("free delivery, a fee that depends on the place, and no radius", () => {
    mount(delivers({ fee: 0, radiusKm: null, minOrder: null, notes: null }));
    expect(screen.getByText("Free delivery")).toBeInTheDocument();
    expect(screen.queryByText(/Within/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Use my location" })).toBeNull();
    cleanup();
    mount(delivers({ fee: null }));
    expect(screen.getByText("Delivers")).toBeInTheDocument();
  });

  it("garbage in the setting is a no, never a broken line", () => {
    mount({ ...shop, delivery: { offers: "perhaps", fee: -3 } });
    expect(screen.getByText("No delivery")).toBeInTheDocument();
  });

  it("announces the answer after the buyer shares a location, not on first render", () => {
    mount(delivers());
    const live = screen.getByRole("status");
    expect(live).toHaveTextContent("");
    act(() => at(north(2)));
    expect(live).toHaveTextContent("This shop delivers to your location.");
    act(() => at(north(20)));
    expect(live).toHaveTextContent("does not deliver as far as your location");
  });

  it("every state passes axe", async () => {
    for (const [seller, coords] of [[{ ...shop, delivery: { offers: false } }, null], [delivers(), null], [delivers(), north(2)], [delivers(), north(30)]]) {
      at(coords);
      const { container } = mount(seller);
      const r = await axe(container);
      expect(r.violations.filter((v) => ["serious", "critical"].includes(v.impact)).map((v) => v.id)).toEqual([]);
      cleanup();
    }
  });
});
