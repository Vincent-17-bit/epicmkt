import { ItemHeader } from "@epicmkt/ui";

// Header slot: brand, title, short description and price. The title is the page's heading (h1 on a page, h2 in the sheet) and takes
// focus when an item opens, so Heading and headingRef come through `slot` unchanged.
export default function Header({ slot }) {
  if (!slot?.item) return null;
  return <ItemHeader {...slot} />;
}
