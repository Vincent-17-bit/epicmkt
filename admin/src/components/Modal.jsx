import { Dialog } from "./Dialog.jsx";

/** A centred dialog (a bottom sheet on phones). See Dialog for the focus and keyboard behaviour. */
export function Modal({ size = "md", ...props }) {
  return <Dialog variant="modal" size={size} {...props} />;
}
