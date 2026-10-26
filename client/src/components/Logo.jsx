import styles from "./Logo.module.css";

// The EpicMKT mark: a shopping bag with the E cut out of it. Drawn as plain shapes (no masks or ids), so the header and footer
// can both show it on one page, and it stays sharp from a 16px tab icon to a phone's home screen. Keep it in step with
// public/favicon.svg.
export function LogoMark({ size = 32 }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" focusable="false">
      <rect width="512" height="512" rx="112" fill="#38B6FF" />
      <g transform="translate(-51.2 -51.2) scale(1.2)">
        <path fill="#111111" fillRule="evenodd" d="M125.9 232.9Q128.0 205.0 156.0 205.0L356.0 205.0Q384.0 205.0 386.1 232.9L395.9 361.1Q398.0 389.0 370.0 389.0L142.0 389.0Q114.0 389.0 116.1 361.1ZM186 247H326V273H216V297H296V323H216V347H326V373H186Z" />
        <path fill="none" stroke="#111111" strokeWidth="24" strokeLinecap="round" d="M196 207C196 111 316 111 316 207" />
      </g>
    </svg>
  );
}

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
