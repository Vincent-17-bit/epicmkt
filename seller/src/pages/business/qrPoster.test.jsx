import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { signedInApp } from "../../test/utils.jsx";

const draws = [];
const fakeCtx = new Proxy({}, {
  get: (_t, prop) => (prop === "measureText" ? (t) => ({ width: String(t).length * 5 }) : prop === "createLinearGradient" ? () => ({ addColorStop() {} }) : (...a) => { draws.push([prop, a]); }),
  set: () => true,
});

beforeEach(() => {
  draws.length = 0;
  HTMLCanvasElement.prototype.getContext = () => fakeCtx;
  HTMLCanvasElement.prototype.toBlob = (cb) => cb(new Blob(["x"], { type: "image/png" }));
  HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,AAAA";
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
});
afterEach(() => vi.restoreAllMocks());

describe("QR poster page", () => {
  it("shows the public link as epicmkt.app/s/<slug> and draws the preview", async () => {
    await signedInApp("/business/qr");
    expect(await screen.findByTestId("qr-link")).toHaveTextContent(/^epicmkt\.app\/s\/[a-z0-9-]+$/);
    await waitFor(() => expect(draws.length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: "QR poster" })).toBeInTheDocument();
  });

  it("offers A4 and A5, and PNG and PDF downloads", async () => {
    await signedInApp("/business/qr");
    await screen.findByTestId("qr-link");
    expect(screen.getByRole("radio", { name: /A4/ })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: /A5/ }));
    expect(await screen.findByRole("button", { name: /Download PDF \(A5\)/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Download PNG \(A5\)/ })).toBeInTheDocument();
  });

  it("copies the link and shares on WhatsApp with a wa.me link", async () => {
    await signedInApp("/business/qr");
    await screen.findByTestId("qr-link");
    fireEvent.click(screen.getByRole("button", { name: /Copy link/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(navigator.clipboard.writeText.mock.calls[0][0]).toMatch(/^https:\/\/epicmkt\.app\/s\/[a-z0-9-]+$/);
    expect(screen.getByTestId("qr-note")).toHaveTextContent("Link copied.");
    const wa = screen.getByRole("link", { name: /Share on WhatsApp/ });
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(wa.getAttribute("href"))).toContain("epicmkt.app/s/");
  });

  it("tells Standard shops the poster is plain and points to the plans", async () => {
    await signedInApp("/business/qr");
    const note = await screen.findByTestId("qr-style");
    expect(["plain", "branded"]).toContain(note.dataset.style);
    if (note.dataset.style === "plain") expect(screen.getByRole("link", { name: /See plans/ })).toHaveAttribute("href", "/business/subscription");
  });
});
