import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { setImageTransform } from "../lib/imageUrl.js";
import LazyImage from "./LazyImage.jsx";

const url = "https://x.supabase.co/storage/v1/object/public/seller-media/a.jpg";
const frame = (c) => c.querySelector("span");
afterEach(() => setImageTransform(false));

describe("LazyImage", () => {
  it("shows the loading placeholder, then reveals the picture when it loads", () => {
    const { container } = render(<LazyImage src={url} ratio="4 / 3" />);
    expect(frame(container).dataset.state).toBe("loading");
    expect(frame(container).style.aspectRatio).toBe("4 / 3");
    fireEvent.load(container.querySelector("img"));
    expect(frame(container).dataset.state).toBe("loaded");
  });

  it("is lazy by default and eager for the first picture on a screen", () => {
    const lazy = render(<LazyImage src={url} />);
    expect(lazy.container.querySelector("img").getAttribute("loading")).toBe("lazy");
    const first = render(<LazyImage src={url} priority />);
    expect(first.container.querySelector("img").getAttribute("loading")).toBe("eager");
    expect(first.container.querySelector("img").getAttribute("fetchpriority")).toBe("high");
  });

  it("keeps the placeholder and stops waving when the file fails", () => {
    const { container } = render(<LazyImage src={url} />);
    fireEvent.error(container.querySelector("img"));
    expect(frame(container).dataset.state).toBe("error");
  });

  it("shows the still placeholder, with no img, when there is no picture", () => {
    const { container } = render(<LazyImage src={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(frame(container).dataset.state).toBe("error");
  });

  it("requests a smaller copy when transforms are on", () => {
    setImageTransform(true);
    const { container } = render(<LazyImage src={url} width={480} />);
    const img = container.querySelector("img");
    expect(img.getAttribute("src")).toContain("/render/image/public/");
    expect(img.getAttribute("srcset")).toContain("240w");
  });
});
