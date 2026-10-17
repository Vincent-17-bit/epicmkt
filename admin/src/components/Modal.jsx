import { BELOW_MD } from "../lib/breakpoints.js";
import { useMediaQuery } from "../lib/useMediaQuery.js";
import Sheet from "./Sheet.jsx";

/** Centered dialog from md up, bottom sheet on phones. Always above sheets. */
export default function Modal({ title, onClose, children }) {
  const phone = useMediaQuery(BELOW_MD);
  return (
    <Sheet title={title} onClose={onClose} layer="modal" placement={phone ? "bottom" : "center"}>
      {children}
    </Sheet>
  );
}
