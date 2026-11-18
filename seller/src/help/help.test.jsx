import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { signedInApp } from "../test/utils.jsx";

const open = async () => {
  await signedInApp("/business/help");
  await screen.findByRole("heading", { level: 1, name: "Help" });
};

describe("help page", () => {
  it("filters questions and guides as you search, and offers a way back when nothing matches", async () => {
    const user = userEvent.setup();
    await open();
    const box = screen.getByRole("searchbox", { name: "Search help" });
    await user.type(box, "qr");
    expect(screen.getByRole("button", { name: /How do I get my QR poster/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /How do I pay or renew/ })).toBeNull();
    await user.clear(box);
    await user.type(box, "zzzz");
    expect(screen.getByRole("status")).toHaveTextContent(/Nothing matches/);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByRole("button", { name: /How do I pay or renew/ })).toBeInTheDocument();
  });

  it("opens one entry at a time and links a guide to its page", async () => {
    const user = userEvent.setup();
    await open();
    await user.click(screen.getByRole("button", { name: /Print your QR poster/ }));
    const region = screen.getByRole("region", { name: "Print your QR poster" });
    expect(within(region).getAllByRole("listitem")).toHaveLength(3);
    expect(within(region).getByRole("link", { name: "Open QR poster" })).toHaveAttribute("href", "/business/qr");
    await user.click(screen.getByRole("button", { name: /Pay for your listing/ }));
    expect(screen.queryByRole("region", { name: "Print your QR poster" })).toBeNull();
    expect(screen.getByRole("region", { name: "Pay for your listing" })).toBeInTheDocument();
  });
});
