export function glyphPath(shape, r) {
  const s = r * 0.85;
  switch (shape) {
    case "diamond": return `M0 ${-r}L${r} 0L0 ${r}L${-r} 0Z`;
    case "triangle": return `M0 ${-r}L${r * 0.95} ${r * 0.75}L${-r * 0.95} ${r * 0.75}Z`;
    case "square": return `M${-s} ${-s}h${2 * s}v${2 * s}h${-2 * s}Z`;
    case "cross": return `M${-s} ${-s}L${s} ${s}M${s} ${-s}L${-s} ${s}`;
    default: return `M${-r} 0a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
  }
}

export const isOutline = (shape) => shape === "cross" || shape === "ring";

export function Glyph({ shape, tone, r = 7, ...rest }) {
  const color = `var(--tone-${tone}-solid)`;
  const outline = isOutline(shape);
  return (
    <path
      d={glyphPath(shape, r)}
      fill={outline ? "none" : color}
      stroke={outline ? color : "var(--surface)"}
      strokeWidth={outline ? 2.5 : 1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    />
  );
}

export function glyphSvg(shape, tone, size = 22) {
  const r = 7;
  const color = `var(--tone-${tone}-solid)`;
  const outline = isOutline(shape);
  return `<svg width="${size}" height="${size}" viewBox="-10 -10 20 20" aria-hidden="true"><path d="${glyphPath(shape, r)}" fill="${outline ? "none" : color}" stroke="${outline ? color : "var(--surface)"}" stroke-width="${outline ? 2.5 : 1.5}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
