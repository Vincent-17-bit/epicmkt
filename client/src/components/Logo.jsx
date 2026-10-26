import styles from "./Logo.module.css";

// The EpicMKT mark: a shopping bag with a big E cut out of it, on a blue tile. Plain shapes only (no masks, gradients or ids),
// so the header and the footer can both draw it on one page and it stays sharp from a 16px tab icon up.
// Keep it in step with public/favicon.svg.
const BODY = "M31.5 145.9Q34.0 116.0 64.0 116.0L296.0 116.0Q326.0 116.0 328.5 145.9L343.5 322.1Q346.0 352.0 316.0 352.0L44.0 352.0Q14.0 352.0 16.5 322.1Z";
const HANDLE = "M112 124C112 22 248 22 248 124";
const E_PATH = "M100.0 155.0Q100.0 146.0 109.0 146.0L249.0 146.0Q258.0 146.0 254.3 154.2L245.7 173.8Q242.0 182.0 233.0 182.0L157.0 182.0Q148.0 182.0 148.0 191.0L148.0 207.0Q148.0 216.0 157.0 216.0L227.0 216.0Q236.0 216.0 232.3 224.2L223.7 243.8Q220.0 252.0 211.0 252.0L157.0 252.0Q148.0 252.0 148.0 261.0L148.0 277.0Q148.0 286.0 157.0 286.0L249.0 286.0Q258.0 286.0 254.3 294.2L245.7 313.8Q242.0 322.0 233.0 322.0L109.0 322.0Q100.0 322.0 100.0 313.0Z";

export function LogoMark({ size = 32 }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#38B6FF" />
      <g transform="translate(43.6 43.6) scale(1.18)">
        <path fill="#111111" d={BODY} />
        <path fill="none" stroke="#111111" strokeWidth="28" strokeLinecap="round" d={HANDLE} />
        <path fill="#38B6FF" d={E_PATH} />
      </g>
    </svg>
  );
}

// The header shows the name only. `tagline` adds the motto underneath (the footer).
export default function Logo({ tagline = "" }) {
  return (
    <span className={styles.logo}>
      <LogoMark />
      <span className={styles.text}>
        <span className={styles.word}>EpicMKT</span>
        {tagline && <span className={styles.tagline}>{tagline}</span>}
      </span>
    </span>
  );
}
