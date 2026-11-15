import MediaSlot from "../MediaSlot.jsx";
import { SectionCard } from "../parts.jsx";
import { usePlanFeatures } from "../../../../../lib/usePlanFeatures.js";
import Media3dSection from "./Media3dSection.jsx";

export default function MediaStep({ media, busy, itemId = null, form }) {
  const features = usePlanFeatures();
  return (
    <SectionCard id="media" title="Media" why="Items with clear photos get far more taps and messages.">
      <div data-area="media"><MediaSlot media={media} disabled={busy} /></div>
      {features.threeD ? (
        <div data-area="media3d"><Media3dSection itemId={itemId} options={form?.options} /></div>
      ) : (
        <p data-area="media3d" role="note">3D and 360 views are not part of your plan.</p>
      )}
    </SectionCard>
  );
}
