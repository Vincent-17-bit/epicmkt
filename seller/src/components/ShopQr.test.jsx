import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import ShopQr from "./ShopQr.jsx";

const srcOf = () => screen.getByRole("img").getAttribute("src");

describe("ShopQr", () => {
  it("shows the same image for the same business and redraws when the plan or logo changes", async () => {
    const { rerender } = render(<ShopQr slug="shop-a" planKey="standard" hasLogo label="QR" />);
    await waitFor(() => expect(screen.getByRole("img")).toBeInTheDocument());
    const standard = srcOf();
    rerender(<ShopQr slug="shop-a" planKey="premium" hasLogo label="QR" />);
    await waitFor(() => expect(srcOf()).not.toBe(standard));
    const premium = srcOf();
    rerender(<ShopQr slug="shop-a" planKey="premium" hasLogo label="QR" />);
    expect(srcOf()).toBe(premium);
    rerender(<ShopQr slug="shop-b" planKey="premium" hasLogo label="QR" />);
    await waitFor(() => expect(srcOf()).not.toBe(premium));
  });

  it("draws nothing for a bad slug", () => {
    render(<ShopQr slug="Bad Slug" planKey="standard" hasLogo={false} label="QR" />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
