import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import BottomBar from "./BottomBar.jsx";

const base = { callHref: "tel:+254712345678", whatsappHref: "https://wa.me/254712345678", directionsHref: "https://maps.example/x" };
const handlers = () => ({ onCall: vi.fn(), onWhatsApp: vi.fn(), onDirections: vi.fn(), onShare: vi.fn() });

describe("BottomBar", () => {
  it("renders in place when no container is given", () => {
    const { container } = render(<BottomBar {...base} />);
    expect(container.querySelector("nav")).not.toBeNull();
  });

  it("renders inside a container element", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const { container } = render(<BottomBar {...base} container={host} />);
    expect(container.querySelector("nav")).toBeNull();
    expect(host.querySelector("nav")).not.toBeNull();
    host.remove();
  });

  it("renders inside a container ref after mount", () => {
    const ref = createRef();
    const { container } = render(
      <>
        <div ref={ref} data-testid="frame" />
        <BottomBar {...base} container={ref} />
      </>
    );
    expect(screen.getByTestId("frame").querySelector("nav")).not.toBeNull();
    expect(container.querySelectorAll("nav")).toHaveLength(1);
  });

  it("calls the given handlers when live", () => {
    const h = handlers();
    render(<BottomBar {...base} {...h} />);
    fireEvent.click(screen.getByRole("link", { name: "Call" }));
    fireEvent.click(screen.getByRole("link", { name: "WhatsApp" }));
    fireEvent.click(screen.getByRole("link", { name: "Directions" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(h.onCall).toHaveBeenCalledTimes(1);
    expect(h.onWhatsApp).toHaveBeenCalledTimes(1);
    expect(h.onDirections).toHaveBeenCalledTimes(1);
    expect(h.onShare).toHaveBeenCalledTimes(1);
  });

  it("is inert in preview, with or without a container", () => {
    const h = handlers();
    const host = document.createElement("div");
    document.body.append(host);
    render(<BottomBar {...base} {...h} mode="preview" container={host} />);
    host.querySelectorAll("a").forEach((a) => {
      expect(a).not.toHaveAttribute("href");
      fireEvent.click(a);
    });
    host.querySelectorAll("button").forEach((b) => {
      expect(b).toBeDisabled();
      fireEvent.click(b);
    });
    Object.values(h).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    host.remove();
  });
});
