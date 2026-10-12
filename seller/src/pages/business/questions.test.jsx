import { describe, it, expect } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as api from "../../api/index.js";
import { M, signedInApp, file, bytesOf, PDF_OK, PNG, JPG, setTime } from "../../test/utils.jsx";

const card = (id) => screen.getAllByTestId("question").find((c) => c.textContent.includes(id));
const fileInput = (c) => c.querySelector('input[type="file"]');
const FAIL_NOTHING_KEPT = () => expect(M.state.questions.find((q) => q.id === "q1").attachments).toHaveLength(0);

async function reply(user, c, text) {
  await user.type(within(c).getByLabelText("Your reply"), text);
  await user.click(within(c).getByRole("button", { name: /^(Send reply|Checking files|Sending)/ }));
}

describe("questions from the admin", () => {
  it("shows the question, due date, the item or FAQ concerned with a link, and the status", async () => {
    setTime("2026-10-12T09:00:00Z");
    await signedInApp("/business/questions", () => {
      M.state.questions[0].dueAt = "2026-10-10T09:00:00Z";
      M.state.questions[1].dueAt = "2026-10-20T09:00:00Z";
    });
    const cards = await screen.findAllByTestId("question");
    expect(cards).toHaveLength(3);
    const q1 = card("price list");
    expect(within(q1).getByText("Open")).toBeInTheDocument();
    expect(within(q1).getByText(/Overdue: 10 Oct 2026/)).toBeInTheDocument();
    expect(within(q1).getByRole("link", { name: "Fade cut" })).toHaveAttribute("href", "/business/items/i1");
    const q2 = card("delivery really free");
    expect(within(q2).getByText(/Due 20 Oct 2026/)).toBeInTheDocument();
    expect(within(q2).getByRole("link", { name: "Do you deliver?" }).getAttribute("href")).toContain("/business/faqs");
    const q3 = card("Old question");
    expect(within(q3).getByText("Closed")).toBeInTheDocument();
    expect(within(q3).queryByLabelText("Your reply")).toBeNull();
  });

  it("shows file names, types and sizes only, never a link to download", async () => {
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const q3 = card("Old question");
    expect(await within(q3).findByText("receipt.pdf · PDF · 51 KB")).toBeInTheDocument();
    expect(within(q3).queryAllByRole("link")).toHaveLength(0);
    expect(q3.querySelector("a[download]")).toBeNull();
  });

  it("replies without files", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("delivery really free");
    await reply(user, c, "Yes, free within town.");
    await waitFor(() => expect(within(card("delivery really free")).getByText("Answered")).toBeInTheDocument());
    expect(within(card("delivery really free")).getByTestId("reply-text")).toHaveTextContent("Yes, free within town.");
    expect(within(card("delivery really free")).queryByLabelText("Your reply")).toBeNull();
    expect(M.state.questions[1].attachments).toHaveLength(0);
  });

  it("replies with up to 3 files and lists them by name, type and size", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    await user.upload(fileInput(c), [file("prices.pdf", "application/pdf", PDF_OK), file("shop.jpg", "image/jpeg", JPG), file("menu.png", "image/png", PNG)]);
    expect(within(c).getAllByRole("listitem")).toHaveLength(3);
    await reply(user, c, "Here are my prices.");
    await waitFor(() => expect(within(card("price list")).getByText("Answered")).toBeInTheDocument());
    const done = card("price list");
    expect(within(done).getByText(/prices\.pdf · PDF/)).toBeInTheDocument();
    expect(within(done).getByText(/shop\.jpg · JPG/)).toBeInTheDocument();
    expect(within(done).getByText(/menu\.png · PNG/)).toBeInTheDocument();
    expect(within(done).queryAllByRole("link")).toHaveLength(1); // only the item link
  });

  it("refuses a fourth file", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    await user.upload(fileInput(c), [file("1.pdf", "application/pdf", PDF_OK), file("2.pdf", "application/pdf", PDF_OK), file("3.pdf", "application/pdf", PDF_OK)]);
    await user.upload(fileInput(c), file("4.pdf", "application/pdf", PDF_OK));
    expect(await within(c).findByRole("alert")).toHaveTextContent("up to 3 files");
    expect(within(c).getAllByRole("listitem")).toHaveLength(3);
  });

  it("rejects a disguised file: an executable named .pdf", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    await user.upload(fileInput(c), file("invoice.pdf", "application/pdf", Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0])));
    await reply(user, c, "See attached.");
    expect(await within(card("price list")).findByRole("alert")).toHaveTextContent("Only JPG, PNG, WebP or PDF");
    expect(within(card("price list")).getByText("Open")).toBeInTheDocument();
    FAIL_NOTHING_KEPT();
  });

  it("rejects a real image renamed to .pdf", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    await user.upload(fileInput(c), file("scan.pdf", "application/pdf", PNG));
    await reply(user, c, "Scan attached.");
    expect(await within(card("price list")).findByRole("alert")).toHaveTextContent("not what its name says");
    FAIL_NOTHING_KEPT();
  });

  it("rejects an encrypted PDF", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    await user.upload(fileInput(c), file("locked.pdf", "application/pdf", bytesOf("%PDF-1.4\ntrailer << /Encrypt 5 0 R >>")));
    await reply(user, c, "Locked file.");
    expect(await within(card("price list")).findByRole("alert")).toHaveTextContent("password protected");
    FAIL_NOTHING_KEPT();
  });

  it("rejects a PDF with JavaScript", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    await user.upload(fileInput(c), file("js.pdf", "application/pdf", bytesOf("%PDF-1.4\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>")));
    await reply(user, c, "Script file.");
    expect(await within(card("price list")).findByRole("alert")).toHaveTextContent("scripts or embedded content");
    FAIL_NOTHING_KEPT();
  });

  it("rejects an oversized file as soon as it is picked", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await user.upload(fileInput(c), file("big.pdf", "application/pdf", big));
    expect(await within(c).findByRole("alert")).toHaveTextContent("8 MB or smaller");
    expect(within(c).queryAllByRole("listitem")).toHaveLength(0);
  });

  it("rejects a file type that is not allowed", async () => {
    const user = userEvent.setup({ applyAccept: false });
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("price list");
    await user.upload(fileInput(c), file("run.exe", "application/octet-stream", bytesOf("MZ")));
    expect(await within(c).findByRole("alert")).toHaveTextContent("Only JPG, PNG, WebP or PDF");
  });

  it("holds the reply to 2 to 500 characters of plain text", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    const c = card("delivery really free");
    await reply(user, c, "x");
    expect(await within(c).findByRole("alert")).toHaveTextContent("at least 2");
    await user.clear(within(c).getByLabelText("Your reply"));
    await user.click(within(c).getByLabelText("Your reply"));
    await user.paste("y".repeat(501));
    expect(within(c).getByText(/501 \/ 500/)).toHaveAttribute("data-bad", "true");
    await user.click(within(c).getByRole("button", { name: "Send reply" }));
    expect(await within(c).findByRole("alert")).toHaveTextContent("500 characters or fewer");
    expect(M.state.questions[1].status).toBe("open");
  });

  it("shows markup as text, never as HTML", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    await reply(user, card("delivery really free"), "<img src=x onerror=alert(1)> <b>free</b>");
    const out = await within(card("delivery really free")).findByTestId("reply-text");
    expect(out.textContent).toBe("<img src=x onerror=alert(1)> <b>free</b>");
    expect(out.querySelector("img, b")).toBeNull();
  });

  it("another seller's flag is refused", async () => {
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    await expect(api.replyFlag("someone-elses-flag", "Hello there")).rejects.toMatchObject({ code: "not_found_or_not_open" });
    await expect(api.uploadProofs("someone-elses-flag", [file("a.pdf", "application/pdf", PDF_OK)])).rejects.toMatchObject({ code: "flag_not_found" });
  });

  it("a closed question cannot be answered or get files", async () => {
    await signedInApp("/business/questions");
    await screen.findAllByTestId("question");
    await expect(api.replyFlag("q3", "Late reply")).rejects.toMatchObject({ code: "not_found_or_not_open" });
    await expect(api.uploadProofs("q3", [file("a.pdf", "application/pdf", PDF_OK)])).rejects.toMatchObject({ code: "flag_not_open" });
  });

  it("works for suspended and unlisted sellers", async () => {
    for (const status of ["suspended", "paused", "expired"]) {
      const user = userEvent.setup();
      const { unmount } = await signedInApp("/business/questions", () => { M.state.business.status = status; });
      const c = (await screen.findAllByTestId("question")).find((x) => x.textContent.includes("delivery really free"));
      await reply(user, c, "Still open for business.");
      await waitFor(() => expect(within(card("delivery really free")).getByText("Answered")).toBeInTheDocument());
      unmount();
    }
  });
});
