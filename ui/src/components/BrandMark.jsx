/** The EpicMKT mark (the same blue tile and black E as the logo and favicon), drawn at whatever size its box gives it. */
export default function BrandMark({ className = "" }) {
  return (
    <svg className={className} viewBox="0 0 512 512" aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#38B6FF" />
      <path fill="#111111" d="M150 140h60v232h-60zM150 140h212v56H150zM150 226h212v60H150zM150 316h212v56H150z" />
    </svg>
  );
}
