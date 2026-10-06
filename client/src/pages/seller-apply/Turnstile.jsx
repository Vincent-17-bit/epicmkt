import { useEffect, useRef } from "react";

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let loading;

function load() {
  if (window.turnstile) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => {
      loading = null;
      reject(new Error("turnstile_load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export default function Turnstile({ onToken, onError }) {
  const box = useRef(null);
  const widget = useRef(null);

  useEffect(() => {
    if (!SITE_KEY) {
      onToken("dev-bypass");
      return undefined;
    }
    let dead = false;
    load()
      .then(() => {
        if (dead || !box.current) return;
        widget.current = window.turnstile.render(box.current, {
          sitekey: SITE_KEY,
          theme: "auto",
          callback: onToken,
          "expired-callback": () => onToken(""),
          "error-callback": () => onError?.()
        });
      })
      .catch(() => onError?.());
    return () => {
      dead = true;
      if (widget.current != null) window.turnstile?.remove(widget.current);
    };
  }, []);

  if (!SITE_KEY) return <p role="status">Human check skipped in development.</p>;
  return <div ref={box} aria-label="Human check" />;
}
