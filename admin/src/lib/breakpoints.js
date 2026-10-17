// Mirrors the breakpoints documented in styles/tokens.css.
export const BP = { md: 768, lg: 1024 };

// "Below md" uses a fractional upper bound so exactly 768px is the table layout.
export const BELOW_MD = `(max-width: ${BP.md - 0.02}px)`;
export const BELOW_LG = `(max-width: ${BP.lg - 0.02}px)`;
export const FROM_LG = `(min-width: ${BP.lg}px)`;
