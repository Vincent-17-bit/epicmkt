import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { Picture, ProductTile } from "./index.js";

const frame = (container) => container.firstElementChild;

describe("Picture", () => {
  it("shows the EpicMKT mark and no image when there is no source", () => {
    const { container } = render(<Picture src={null} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(frame(container)).toHaveAttribute("data-state", "empty");
  });

  it("keeps the EpicMKT mark in place while the image loads, then reveals the image", () => {
    const { container } = render(<Picture src="/a.jpg" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(frame(container)).toHaveAttribute("data-state", "loading");
    fireEvent.load(container.querySelector("img"));
    expect(frame(container)).toHaveAttribute("data-state", "loaded");
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("falls back to the mark when the image fails, and says so", () => {
    const onFail = vi.fn();
    const { container } = render(<Picture src="/broken.jpg" onFail={onFail} />);
    fireEvent.error(container.querySelector("img"));
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it("tries again when the source changes after a failure", () => {
    const { container, rerender } = render(<Picture src="/broken.jpg" />);
    fireEvent.error(container.querySelector("img"));
    rerender(<Picture src="/good.jpg" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/good.jpg");
  });
});

describe("pictures in cards", () => {
  const item = { id: "p1", name: "Bread", pricing: { salePrice: 50, regularPrice: 50, savings: 0, discountPercent: 0 }, availability: "available", business: { name: "Shop" } };

  it("a product tile with no image shows the EpicMKT mark instead of an empty box", () => {
    const { container } = render(<ProductTile item={{ ...item, imageUrl: null }} href="/x" />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg[viewBox='0 0 512 512']")).not.toBeNull();
  });

  it("a product tile with an image still has the mark underneath while it loads", () => {
    const { container } = render(<ProductTile item={{ ...item, imageUrl: "/b.jpg" }} href="/x" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/b.jpg");
    expect(container.querySelector("svg[viewBox='0 0 512 512']")).not.toBeNull();
  });
});
