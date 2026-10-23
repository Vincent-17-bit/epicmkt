import { useCallback, useEffect, useRef, useState } from "react";
import { resizedUrl, srcSetFor } from "../lib/imageUrl.js";
import styles from "./LazyImage.module.css";

// The one way customers see a stored picture. It keeps the layout still and the page light:
//   - The frame reserves its space before the picture arrives (a fixed ratio, or the parent's box with `fill`), so
//     nothing jumps when the file lands.
//   - While the file loads, the frame shows the EpicMKT placeholder with a slow wave moving across it. The placeholder is
//     about 1 KB and is inlined into the CSS, so it never costs a request of its own.
//   - The picture is lazy: the browser only fetches it as it nears the screen. Pass `priority` for the one picture a
//     screen shows first (it loads straight away and is not faded).
//   - A smaller copy is requested when the host can resize (see lib/imageUrl.js), so a card never downloads a
//     multi-megabyte original.
//   - If the file fails, the placeholder stays, the wave stops, and the space does not collapse.
export default function LazyImage({
  src,
  alt = "",
  className = "",
  frameClassName = "",
  ratio,
  fill = false,
  priority = false,
  width = 480,
  sizes,
  onLoad,
  onError,
  ...rest
}) {
  const imgRef = useRef(null);
  const [state, setState] = useState("loading");

  // A picture already in the browser cache can finish before React attaches onLoad, so check once it is mounted.
  useEffect(() => {
    setState("loading");
    const el = imgRef.current;
    if (el?.complete && el.naturalWidth > 0) setState("loaded");
  }, [src]);

  const handleLoad = useCallback((e) => {
    setState("loaded");
    onLoad?.(e);
  }, [onLoad]);
  const handleError = useCallback((e) => {
    setState("error");
    onError?.(e);
  }, [onError]);

  const frameStyle = !fill && ratio ? { aspectRatio: ratio } : undefined;
  const set = src ? srcSetFor(src) : undefined;

  return (
    <span className={`${styles.frame} ${fill ? styles.fill : ""} ${frameClassName}`} style={frameStyle} data-state={src ? state : "error"}>
      {src && (
        <img
          ref={imgRef}
          src={resizedUrl(src, width)}
          srcSet={set}
          sizes={set ? sizes ?? "(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw" : undefined}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchpriority={priority ? "high" : undefined}
          decoding="async"
          draggable="false"
          className={`${styles.img} ${className}`}
          onLoad={handleLoad}
          onError={handleError}
          {...rest}
        />
      )}
    </span>
  );
}
