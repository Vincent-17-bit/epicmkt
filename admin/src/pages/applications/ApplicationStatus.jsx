import { statusMeta } from "../../lib/applications.js";

// The status as words in a chip. The label carries the meaning, so colour is never the only signal.
export default function ApplicationStatus({ status }) {
  const meta = statusMeta(status);
  return <span className={`chip chip--${meta.tone}`}>{meta.label}</span>;
}
