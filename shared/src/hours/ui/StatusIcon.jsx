const PATHS = {
  open: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.2 14.4-4-4 1.4-1.4 2.6 2.6 5-5 1.4 1.4-6.4 6.4Z",
  closing_soon: "M6 2h12v2h-1v3.6L13.4 12l3.6 4.4V20h1v2H6v-2h1v-3.6l3.6-4.4L7 7.6V4H6V2Zm3 2v2.7l3 3.6 3-3.6V4H9Z",
  closed: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.9 12.5-1.4 1.4-2.5-2.5-2.5 2.5-1.4-1.4 2.5-2.5-2.5-2.5 1.4-1.4 2.5 2.5 2.5-2.5 1.4 1.4-2.5 2.5 2.5 2.5Z",
  closed_temporarily: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM9 8h2v8H9V8Zm4 0h2v8h-2V8Z",
  opens_later: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5v4.6l3.2 1.9-1 1.7L11 12.6V7h2Z",
  pause: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM9 8h2v8H9V8Zm4 0h2v8h-2V8Z"
};

export default function StatusIcon({ name, size = 20, className }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={PATHS[name] ?? PATHS.closed} />
    </svg>
  );
}
