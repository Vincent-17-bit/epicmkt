import MediaSlot from "../MediaSlot.jsx";
import { SectionCard } from "../parts.jsx";

export default function MediaStep({ media, busy }) {
  return (
    <SectionCard id="media" title="Media" why="Items with clear photos get far more taps and messages.">
      <div data-area="media"><MediaSlot media={media} disabled={busy} /></div>
    </SectionCard>
  );
}
