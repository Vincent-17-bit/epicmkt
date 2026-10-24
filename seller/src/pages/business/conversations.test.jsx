import { describe, it, expect } from "vitest";
import { screen, within, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { M, signedInApp, file, PDF_OK } from "../../test/utils.jsx";

const staff = (extra = {}) => M.adminSend({ subject: "Your contact details", body: "Please send your contact number.", needsReply: true, ...extra });
const ticksOf = (el) => within(el).getByTestId("ticks").dataset.state;

describe("conversations with EpicMKT staff", () => {
  it("a staff message shows in Notifications with a link to reply, and the device acknowledges it", async () => {
    const m = await signedInApp("/business/notifications", () => { staff({ files: [{ id: "f1", name: "form.pdf", mime: "application/pdf", size: 2048, path: "admin/f1-form.pdf", by: "admin" }] }); });
    const items = await screen.findAllByTestId("notification");
    const card = items.find((i) => i.textContent.includes("Your contact details"));
    expect(within(card).getByRole("link", { name: "Reply to EpicMKT" }).getAttribute("href")).toContain("/business/questions#thread-");
    expect(within(card).getByRole("button", { name: "Open form.pdf" })).toBeInTheDocument();
    // Staff get two green ticks when the seller's device has received the message.
    await waitFor(() => expect(M.state.messages.find((x) => x.subject === "Your contact details").deliveredAt).toBeTruthy());
    m.unmount();
  });

  it("the seller answers in the conversation and sees one green tick until staff receive it, two when delivered, blue when read", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions", () => { staff(); });
    const convo = await screen.findByTestId("conversation");
    // Opening it marks staff's message as read for the seller.
    await waitFor(() => expect(M.state.messages.find((x) => x.sender === "admin").readAt).toBeTruthy());
    await user.type(within(convo).getByLabelText("Your reply"), "0712 345 678");
    await user.click(within(convo).getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(within(convo).getAllByTestId("thread-message")).toHaveLength(2));
    const own = within(convo).getAllByTestId("thread-message");
    expect(own[1].dataset.sender).toBe("seller");
    expect(ticksOf(own[1])).toBe("sent");

    const sent = M.state.messages.find((x) => x.sender === "seller");
    act(() => { sent.adminDeliveredAt = new Date().toISOString(); M.emit("messages", "UPDATE", sent); });
    await waitFor(() => expect(ticksOf(within(screen.getByTestId("conversation")).getAllByTestId("thread-message")[1])).toBe("delivered"));
    act(() => { M.adminRead(sent.id); });
    await waitFor(() => expect(ticksOf(within(screen.getByTestId("conversation")).getAllByTestId("thread-message")[1])).toBe("read"));
  });

  it("replies nest: a staff answer to the seller's reply stays in the same thread, one level deeper", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions", () => { staff(); });
    const convo = await screen.findByTestId("conversation");
    await user.type(within(convo).getByLabelText("Your reply"), "Kisumu");
    await user.click(within(convo).getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(M.state.messages.some((x) => x.sender === "seller")).toBe(true));
    const sellerMsg = M.state.messages.find((x) => x.sender === "seller");
    act(() => { M.adminSend({ parentId: sellerMsg.id, body: "And your town?", needsReply: true }); });
    await waitFor(() => expect(within(screen.getByTestId("conversation")).getAllByTestId("thread-message")).toHaveLength(3));
    expect(screen.getAllByTestId("conversation")).toHaveLength(1);
    const margins = within(screen.getByTestId("conversation")).getAllByTestId("thread-message").map((n) => n.style.marginInlineStart);
    expect(margins).toEqual(["0rem", "1.25rem", "2.5rem"]);
  });

  it("the seller can send a PDF with the reply, and a bad file is refused", async () => {
    const user = userEvent.setup({ applyAccept: false });
    await signedInApp("/business/questions", () => { staff(); });
    const convo = await screen.findByTestId("conversation");
    await user.upload(convo.querySelector('input[type="file"]'), file("notes.txt", "text/plain", new Uint8Array([1, 2, 3])));
    expect(await within(convo).findByRole("alert")).toBeInTheDocument();
    await user.upload(convo.querySelector('input[type="file"]'), file("licence.pdf", "application/pdf", PDF_OK));
    await user.click(within(convo).getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(M.state.messages.find((x) => x.sender === "seller")?.attachments[0]?.name).toBe("licence.pdf"));
    expect(M.state.messages.find((x) => x.sender === "seller").body).toBe("Sent a file.");
  });

  it("a message that did not ask for a reply cannot be answered", async () => {
    await signedInApp("/business/questions", () => { staff({ needsReply: false, subject: "FYI" }); });
    await screen.findAllByTestId("question");
    expect(screen.queryByTestId("conversation")).toBeNull();
  });
});

describe("strikes and suspension", () => {
  it("a seller with strikes sees no strike banner at the top of any page", async () => {
    await signedInApp("/business/subscription", () => { M.state.business.strikes = 2; });
    await screen.findByTestId("shop-name");
    expect(screen.queryByTestId("strike-banner")).toBeNull();
  });

  it("a suspended seller sees the reason and can read and answer, but nothing else", async () => {
    const user = userEvent.setup();
    await signedInApp("/business/questions", () => {
      M.state.business.status = "suspended";
      M.state.business.statusReason = "Selling counterfeit goods";
      staff({ subject: "About your suspension", body: "Tell us what happened." });
    });
    expect(await screen.findByTestId("suspended-banner")).toHaveTextContent("Selling counterfeit goods");
    const convo = await screen.findByTestId("conversation");
    expect(screen.queryByRole("link", { name: "Flash sales" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Exceptions" })).toBeNull();
    await user.type(within(convo).getByLabelText("Your reply"), "It was a mistake");
    await user.click(within(convo).getByRole("button", { name: "Send reply" }));
    await waitFor(() => expect(M.state.messages.some((x) => x.sender === "seller")).toBe(true));
  });
});
