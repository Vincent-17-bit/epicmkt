import { Dialog } from "./Dialog.jsx";

/** A panel that slides in from `side` (right by default), for detail views next to a list. */
export function Drawer({ side = "right", ...props }) {
  return <Dialog variant="drawer" side={side} {...props} />;
}
