import { ItemDetails, ItemSpecs } from "@epicmkt/ui";

// Details slot: highlights and description (ui's ItemDetails; renders nothing when there is neither).
export default function Details({ slot }) {
  if (!slot?.item) return null;
  return <ItemDetails {...slot} />;
}

// The specs table is the other half of Details. It sits in its own column of the layout, so it is a second component, not a second slot.
export function Specs({ slot }) {
  if (!slot?.item) return null;
  return <ItemSpecs {...slot} />;
}
