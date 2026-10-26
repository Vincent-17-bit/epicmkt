import styles from "./Logo.module.css";

// The EpicMKT mark: a paper shopping bag seen from the corner, with a solid 3D "E" on its front. Plain shapes only (no masks,
// gradients or ids), so the header and footer can both show it on one page and it stays sharp from a 16px tab icon up.
// Keep it in step with public/favicon.svg.
const COLOR = { front: "#38B6FF", side: "#1C93DC", hem: "#7DD3FF", inside: "#0E6AA8", edge: "#1479B8", letter: "#FFFFFF" };
const E_PATH = "M258 274H146V390H258M146 332H230";
const strokes = { fill: "none", strokeWidth: 26, strokeLinecap: "round", strokeLinejoin: "round" };

export function LogoMark({ size = 32 }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} aria-hidden="true" focusable="false">
      <g transform="translate(256 256) scale(1.28) translate(-250 -260)">
        <path fill="none" stroke={COLOR.side} strokeWidth="15" strokeLinecap="round" d="M202 180C202 84 342 84 342 180" />
        <path fill={COLOR.inside} stroke={COLOR.inside} strokeWidth="4" strokeLinejoin="round" d="M71.5 211.5Q66.0 214.0 72.0 214.0L324.0 214.0Q330.0 214.0 335.5 211.5L398.5 182.5Q404.0 180.0 398.0 180.0L146.0 180.0Q140.0 180.0 134.5 182.5Z" />
        <path fill={COLOR.side} stroke={COLOR.side} strokeWidth="4" strokeLinejoin="round" d="M330.0 222.0Q330.0 214.0 337.3 210.7L396.7 183.3Q404.0 180.0 404.0 188.0L404.0 384.0Q404.0 392.0 396.7 395.3L337.3 422.7Q330.0 426.0 330.0 418.0Z" />
        <path fill={COLOR.front} stroke={COLOR.front} strokeWidth="4" strokeLinejoin="round" d="M66.0 228.0Q66.0 214.0 80.0 214.0L316.0 214.0Q330.0 214.0 330.0 228.0L330.0 412.0Q330.0 426.0 316.0 426.0L80.0 426.0Q66.0 426.0 66.0 412.0Z" />
        <path fill={COLOR.hem} d="M66.0 222.0Q66.0 214.0 74.0 214.0L322.0 214.0Q330.0 214.0 330.0 222.0L330.0 230.0Q330.0 238.0 322.0 238.0L74.0 238.0Q66.0 238.0 66.0 230.0Z" />
        {[4, 3, 2, 1].map((i) => (
          <path key={i} {...strokes} stroke={COLOR.edge} transform={`translate(${(12 * i) / 4} ${(-6 * i) / 4})`} d={E_PATH} />
        ))}
        <path {...strokes} stroke={COLOR.letter} d={E_PATH} />
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
