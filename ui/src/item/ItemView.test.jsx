import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ItemDetails from "./ItemDetails.jsx";
import ItemGallery from "./ItemGallery.jsx";
import ItemHeader from "./ItemHeader.jsx";
import ItemOptions from "./ItemOptions.jsx";
import ItemView from "./ItemView.jsx";

const variant = (id, label, price) => ({ id, label, regularPrice: price, salePrice: price, savings: 0, discountPercent: 0 });
const item = (extra = {}) => ({
  id: "i1",
  name: "Fade cut",
  brand: "Acme",
  shortDescription: "Clean and quick",
  description: "A longer story about the cut.",
  section: null,
  packSize: null,
  availability: "available",
  highlights: [{ title: "", text: "Done in 30 minutes" }],
  specs: [],
  images: [],
  videos: [],
  offers: [],
  flash: null,
  pricing: { regularPrice: 500, salePrice: 500, savings: 0, discountPercent: 0, unit: null, variants: [variant("a", "Small", 500), variant("b", "Large", 800)] },
  ...extra
});

describe("ItemView options", () => {
  it("lists the options and reports the one picked", async () => {
    const onVariant = vi.fn();
    render(<ItemView item={item()} shown={item().pricing.variants[0]} activeId="a" onVariant={onVariant} />);
    const group = screen.getByRole("radiogroup", { name: "Options" });
    expect(group.querySelectorAll("[role=radio]")).toHaveLength(2);
    await userEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(onVariant).toHaveBeenCalledWith("b");
  });
});

describe("ItemView marks", () => {
  it("marks only the parts the caller asks for", () => {
    const marks = (part) => (["name", "brand", "short", "price", "highlights", "description", "media", "specs"].includes(part) ? "" : undefined);
    const { container } = render(<ItemView item={item()} shown={item().pricing} marks={marks} />);
    expect(container.querySelectorAll("[data-hl]").length).toBeGreaterThanOrEqual(7);
    expect(screen.getByRole("heading", { name: "Fade cut" })).toHaveAttribute("data-hl");
  });

  it("adds no marks when none are asked for", () => {
    const { container } = render(<ItemView item={item()} shown={item().pricing} />);
    expect(container.querySelector("[data-hl]")).toBeNull();
  });
});

describe("ItemView slot props", () => {
  // useId values differ between two renders of the same tree, so they are masked.
  const html = (container) => container.innerHTML.replace(/:r[0-9a-z]+:/g, ":r:");
  const reference = () => html(render(<ItemView item={item()} shown={item().pricing.variants[0]} activeId="a" />).container);

  it("draws today's markup for a part when its slot prop is left out, built from the exported parts", () => {
    const a = reference();
    const it = item();
    const { container } = render(
      <ItemView
        item={it}
        shown={it.pricing.variants[0]}
        activeId="a"
        gallery={<ItemGallery item={it} />}
        header={<ItemHeader item={it} shown={it.pricing.variants[0]} />}
        options={<ItemOptions item={it} activeId="a" />}
        details={<ItemDetails item={it} />}
      />
    );
    expect(html(container)).toBe(a);
  });

  it("replaces a part with a node, and null or false draw nothing there while the layout stays", () => {
    const { container } = render(<ItemView item={item()} shown={item().pricing} header={<p>my header</p>} options={null} details={false} />);
    expect(screen.getByText("my header")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Fade cut" })).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByText("A longer story about the cut.")).toBeNull();
    expect(container.querySelector("[data-variant]")).not.toBeNull();
  });

  it("calls a function slot with the props the default part would get", () => {
    const seen = {};
    render(<ItemView item={item()} shown={item().pricing} activeId="b" Heading="h1" headingId="t" gallery={(p) => { seen.gallery = p; return null; }} header={(p) => { seen.header = p; return null; }} options={(p) => { seen.options = p; return null; }} />);
    expect(seen.gallery.item.id).toBe("i1");
    expect(seen.header).toMatchObject({ Heading: "h1", headingId: "t" });
    expect(seen.options.activeId).toBe("b");
  });

  it("gives the details a link to the specs only when the item has specs, and a function specs slot sees the reveal counter", async () => {
    const seen = {};
    render(<ItemView item={item({ specs: [{ label: "Duration", value: "45 minutes" }] })} shown={item().pricing} specs={(p) => { seen.reveal = p.reveal; return null; }} />);
    expect(seen.reveal).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: /more product details/i }));
    expect(seen.reveal).toBe(1);
  });

  it("the parts render nothing when they have nothing to show", () => {
    const bare = item({ highlights: [], description: "", shortDescription: "", pricing: { ...item().pricing, variants: [] } });
    expect(render(<ItemOptions item={bare} />).container).toBeEmptyDOMElement();
    expect(render(<ItemDetails item={bare} />).container).toBeEmptyDOMElement();
  });
});
