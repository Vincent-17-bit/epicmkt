export const isPreview = (mode) => mode === "preview";

export const actionProps = (preview) => ({
  link: (href, onClick, extra) => (preview ? { "aria-disabled": "true", tabIndex: -1 } : { href, onClick, ...extra }),
  button: (onClick) => (preview ? { disabled: true } : { onClick })
});
