import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signedInApp } from "../../../test/utils.jsx";

const download = vi.fn(async () => {});
const build = vi.fn(async () => new Blob(["%PDF"], { type: "application/pdf" }));
vi.mock("../../../lib/cataloguePdf.js", () => ({ downloadCataloguePdf: (...a) => download(...a), buildCataloguePdf: (...a) => build(...a) }));

const realMatchMedia = window.matchMedia;
beforeEach(() => {
  download.mockClear();
  build.mockClear();
  delete navigator.canShare;
  delete navigator.share;
  window.matchMedia = (q) => ({ matches: q.includes("min-width: 1024px"), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  try { localStorage.clear(); } catch { /* none */ }
});
afterEach(() => { window.matchMedia = realMatchMedia; });

const open = async (user) => {
  await screen.findByTestId("listing-grid");
  await user.click(screen.getByRole("button", { name: "Share catalogue" }));
  return screen.findByRole("dialog", { name: "Share your catalogue" });
};

describe("Share catalogue", () => {
  it("opens from My listings with a message that has the shop name and link", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const message = within(dialog).getByTestId("share-message");
    await waitFor(() => expect(message.textContent).toMatch(/on EpicMKT/));
    expect(message.textContent).toMatch(/See everything with photos:\nhttps?:\/\/\S+\/s\/\S+$/);
    expect(message.textContent).toMatch(/• .+ - (KES|From|Free|Contact)/);
    expect(within(dialog).getByTestId("share-count").textContent).toMatch(/\d+ items? /);
  });

  it("Open WhatsApp goes to wa.me with the same message", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const message = within(dialog).getByTestId("share-message");
    await waitFor(() => expect(message.textContent).toMatch(/on EpicMKT/));
    const link = within(dialog).getByRole("link", { name: /Open WhatsApp/ });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(decodeURIComponent(link.getAttribute("href").split("text=")[1])).toBe(message.textContent);
  });

  it("Show prices off removes every price from the message", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const message = within(dialog).getByTestId("share-message");
    await waitFor(() => expect(message.textContent).toMatch(/KES/));
    await user.click(within(dialog).getByRole("checkbox", { name: "Show prices" }));
    expect(message.textContent).not.toMatch(/KES|From KES/);
    expect(message.textContent).toMatch(/• /);
  });

  it("Copy message puts the message on the clipboard and says so", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const message = within(dialog).getByTestId("share-message");
    await waitFor(() => expect(message.textContent).toMatch(/on EpicMKT/));
    await user.click(within(dialog).getByRole("button", { name: /Copy message/ }));
    expect(writeText).toHaveBeenCalledWith(message.textContent);
    expect(await within(dialog).findByText(/Message copied/)).toBeInTheDocument();
  });

  it("Download PDF builds the file from the chosen items with the shop details", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const button = within(dialog).getByRole("button", { name: "Download PDF" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const [opts, file] = download.mock.calls[0];
    expect(opts.items.length).toBeGreaterThan(0);
    expect(opts.shop.slug).toBeTruthy();
    expect(opts.prices).toBe(true);
    expect(file).toMatch(/-catalogue-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(await within(dialog).findByText(/downloaded/)).toBeInTheDocument();
  });

  it("shows the reason when the PDF cannot be made, and stays usable", async () => {
    const user = userEvent.setup();
    download.mockRejectedValueOnce(new Error("boom"));
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const button = within(dialog).getByRole("button", { name: "Download PDF" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });

  it("choosing a section narrows what is shared", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const chips = within(dialog).queryAllByRole("checkbox").filter((c) => !/prices|sold-out/i.test(c.closest("label").textContent));
    expect(chips.length).toBeGreaterThanOrEqual(2);
    const before = Number(within(dialog).getByTestId("share-count").textContent.match(/\d+/)[0]);
    await user.click(chips[0].closest("label"));
    const after = Number(within(dialog).getByTestId("share-count").textContent.match(/\d+/)[0]);
    expect(after).toBeLessThan(before);
    expect(within(dialog).getByTestId("share-count").textContent).toMatch(/chosen section/);
  });

  it("Share shop link opens a sheet with WhatsApp, Facebook, X and Copy link", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    await waitFor(() => expect(within(dialog).getByRole("button", { name: /Share shop link/ })).toBeEnabled());
    await user.click(within(dialog).getByRole("button", { name: /Share shop link/ }));
    const sheet = await screen.findByRole("dialog", { name: "Share" });
    expect(within(sheet).getByRole("link", { name: "Facebook" }).getAttribute("href")).toMatch(/facebook\.com\/sharer.*%2Fs%2F/);
    expect(within(sheet).getByRole("link", { name: "X" }).getAttribute("href")).toMatch(/x\.com\/intent\/post/);
    expect(within(sheet).getByRole("link", { name: "WhatsApp" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: "Copy link" })).toBeTruthy();
  });

  it("Share PDF is hidden when the device cannot share files", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    expect(within(dialog).queryByRole("button", { name: "Share PDF" })).toBeNull();
  });

  it("Share PDF hands the file to the device share sheet", async () => {
    navigator.canShare = () => true;
    navigator.share = vi.fn(async () => {});
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const button = await within(dialog).findByRole("button", { name: "Share PDF" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    const arg = navigator.share.mock.calls[0][0];
    expect(arg.files[0].type).toBe("application/pdf");
    expect(arg.files[0].name).toMatch(/\.pdf$/);
    expect(build).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });

  it("cancelling the device share sheet is not an error", async () => {
    navigator.canShare = () => true;
    navigator.share = vi.fn(async () => { throw Object.assign(new Error("cancel"), { name: "AbortError" }); });
    const user = userEvent.setup();
    await signedInApp("/business/catalog");
    const dialog = await open(user);
    const button = await within(dialog).findByRole("button", { name: "Share PDF" });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(within(dialog).queryByRole("alert")).toBeNull();
  });
});
