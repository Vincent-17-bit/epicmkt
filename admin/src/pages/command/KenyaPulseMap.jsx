import { Card } from "../../components/index.js";
import s from "./command.module.css";

/** Placeholder for the Kenya Pulse map. Step B1e fills this in. */
// eslint-disable-next-line no-unused-vars
export default function KenyaPulseMap({ loading }) {
  return (
    <Card as="section" title="Kenya pulse" headingLevel={2} className={s.span7} data-slot="kenya-pulse">
      <div className={s.slot}><p className={s.panelNote}>The Kenya pulse map is added in step B1e.</p></div>
    </Card>
  );
}
