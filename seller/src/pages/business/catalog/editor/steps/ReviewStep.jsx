import ReviewSection from "../ReviewSection.jsx";

export default function ReviewStep({ form, checks, isNew, goTo }) {
  return <ReviewSection form={form} checks={checks} isNew={isNew} onJump={goTo} />;
}
