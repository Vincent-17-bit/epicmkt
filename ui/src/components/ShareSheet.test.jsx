import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareSheet from "./ShareSheet.jsx";

const url = "https://epicmkt.app/s/mama-oliech-bakery";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal() { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close ??= function close() { this.removeAttribute("open"); };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete navigator.share;
});

const view = (props = {}) => render(<ShareSheet open onClose={() => {}} url={url} title="Mama Oliech Bakery" text="Mama Oliech Bakery on EpicMKT" {...props} />);

describe("ShareSheet", () => {
  it("renders nothing until it is first opened", () => {
    const { container } = render(<ShareSheet open={false} onClose={() => {}} url={url} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers WhatsApp, Facebook, X and copy link, and no Instagram", () => {
    view();
    const link = (name) => screen.getByRole("link", { name });
    expect(new URL(link("WhatsApp").href).searchParams.get("text")).toBe(`Mama Oliech Bakery on EpicMKT ${url}`);
    expect(new URL(link("Facebook").href).searchParams.get("u")).toBe(url);
    expect(new URL(link("X").href).searchParams.get("url")).toBe(url);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
    expect(screen.queryByText(/instagram/i)).toBeNull();
    expect(link("Facebook").getAttribute("rel")).toContain("noopener");
  });

  it("copies the link and says so", async () => {
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const onShared = vi.fn();
    view({ onShared });
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Link copied"));
    expect(writeText).toHaveBeenCalledWith(url);
    expect(onShared).toHaveBeenCalledWith("copy");
  });

  it("says when copying fails", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn().mockRejectedValue(new Error("no")) }, configurable: true });
    view();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Could not copy/));
  });

  it("shows More options only where the device can share, and closes after sharing", async () => {
    view();
    expect(screen.queryByRole("button", { name: /More options/ })).toBeNull();
    cleanup();
    navigator.share = vi.fn().mockResolvedValue();
    const onClose = vi.fn();
    view({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(navigator.share).toHaveBeenCalledWith({ title: "Mama Oliech Bakery", text: "Mama Oliech Bakery on EpicMKT", url });
  });

  it("stays open when the person cancels the device sheet", async () => {
    navigator.share = vi.fn().mockRejectedValue(Object.assign(new Error("cancel"), { name: "AbortError" }));
    const onClose = vi.fn();
    view({ onClose });
    fireEvent.click(screen.getByRole("button", { name: /More options/ }));
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows no channels for a link that is not a web address", () => {
    view({ url: "not-a-link" });
    expect(screen.queryByRole("link", { name: "WhatsApp" })).toBeNull();
  });
});
