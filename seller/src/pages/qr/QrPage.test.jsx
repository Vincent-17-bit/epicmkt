import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "../../test/render.jsx";

const poster = vi.hoisted(() => ({
  loadQr: vi.fn(async () => ({ size: 21, get: () => false })),
  loadLogo: vi.fn(async () => null),
  renderPoster: vi.fn(async () => document.createElement("canvas")),
  pngBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  buildPdf: vi.fn(async () => new Uint8Array([4, 5, 6])),
  posterFileName: (slug, size, ext) => `epicmkt-${slug}-qr-${size.toLowerCase()}.${ext}`,
  browserEnv: {},
}));

vi.mock("../../lib/poster.js", () => poster);

import QrPage from "./QrPage.jsx";

beforeEach(() => {
  Object.values(poster).forEach((f) => f.mockClear?.());
});

const hrefOf = (name) => screen.getByRole("link", { name }).getAttribute("href");

describe("QR and poster", () => {
  it("encodes only the public link with src=qr and shows the plain style on standard", async () => {
    renderPage(<QrPage />);
    await waitFor(() => expect(poster.renderPoster).toHaveBeenCalled());
    expect(poster.loadQr).toHaveBeenCalledWith("https://epicmkt.co.ke/s/demo-shop?src=qr");
    const args = poster.renderPoster.mock.calls[0][0];
    expect([args.size, args.style, args.name, args.display]).toEqual(["A4", "plain", "Demo Shop", "epicmkt.co.ke/s/demo-shop"]);
    expect(poster.loadLogo).not.toHaveBeenCalled();
    expect(screen.getByText(/Premium adds your logo, name and tagline/)).toBeInTheDocument();
    expect(screen.getByText(/EpicMKT branding stays on every poster/)).toBeInTheDocument();
  });

  it("premium uses the fully branded style", async () => {
    renderPage(<QrPage />, { plan_key: "premium" });
    await waitFor(() => expect(poster.renderPoster).toHaveBeenCalled());
    expect(poster.renderPoster.mock.calls[0][0].style).toBe("branded");
    expect(poster.renderPoster.mock.calls[0][0].tagline).toBe("Walk-ins welcome");
    expect(screen.queryByText(/Premium adds your logo/)).toBeNull();
  });

  it("redraws for A5", async () => {
    const user = userEvent.setup();
    renderPage(<QrPage />);
    await waitFor(() => expect(poster.renderPoster).toHaveBeenCalledTimes(1));
    await user.click(screen.getByLabelText(/A5/));
    await waitFor(() => expect(poster.renderPoster).toHaveBeenCalledTimes(2));
    expect(poster.renderPoster.mock.calls[1][0].size).toBe("A5");
  });

  it("builds WhatsApp, SMS and email links with the caption and the plain shop link", async () => {
    renderPage(<QrPage />);
    await screen.findByRole("link", { name: "WhatsApp" });
    const wa = hrefOf("WhatsApp");
    expect(wa.startsWith("https://wa.me/?text=")).toBe(true);
    const text = decodeURIComponent(wa.split("text=")[1]);
    expect(text).toContain("Visit Demo Shop on EpicMKT");
    expect(text).toContain("https://epicmkt.co.ke/s/demo-shop");
    expect(text).not.toContain("src=qr");
    expect(hrefOf("SMS").startsWith("sms:?body=")).toBe(true);
    expect(hrefOf("Email").startsWith("mailto:?subject=Demo%20Shop%20on%20EpicMKT&body=")).toBe(true);
    expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("target", "_blank");
  });

  it("uses an edited caption and always appends the link", async () => {
    const user = userEvent.setup();
    renderPage(<QrPage />);
    const box = await screen.findByLabelText("Message");
    await user.clear(box);
    await user.type(box, "Come and see us this weekend");
    const text = decodeURIComponent(hrefOf("WhatsApp").split("text=")[1]);
    expect(text).toBe("Come and see us this weekend https://epicmkt.co.ke/s/demo-shop");
    expect(box).toHaveAttribute("maxlength", "300");
    await user.click(screen.getByRole("button", { name: "Reset message" }));
    expect(box.value).toContain("Visit Demo Shop on EpicMKT");
  });

  it("downloads PNG and PDF with print-ready file names", async () => {
    const user = userEvent.setup();
    const clicks = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click() { clicks.push(this.download); };
    renderPage(<QrPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Download PNG" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Download PNG" }));
    await user.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() => expect(clicks).toEqual(["epicmkt-demo-shop-qr-a4.png", "epicmkt-demo-shop-qr-a4.pdf"]));
    expect(poster.buildPdf).toHaveBeenCalledWith(expect.any(Uint8Array), "A4");
    HTMLAnchorElement.prototype.click = orig;
  });

  it("copies the plain link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderPage(<QrPage />);
    await user.click(await screen.findByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith("https://epicmkt.co.ke/s/demo-shop");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("turns downloads and sharing off while the listing is not live", async () => {
    for (const status of ["paused", "suspended"]) {
      const { unmount } = renderPage(<QrPage />, { status });
      await screen.findByText(/Your listing is not live/);
      expect(screen.getByRole("link", { name: "WhatsApp" })).not.toHaveAttribute("href");
      expect(screen.getByRole("link", { name: "WhatsApp" })).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByRole("button", { name: "Download PNG" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Copy link" })).toBeDisabled();
      unmount();
    }
  });
});
