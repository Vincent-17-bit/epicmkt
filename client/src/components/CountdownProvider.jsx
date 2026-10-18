import { useServerClockSync } from "../hooks/useCountdown.js";
import { useFlashRealtime } from "../hooks/useFlashRealtime.js";

export default function CountdownProvider({ children }) {
  useServerClockSync();
  useFlashRealtime();
  return children;
}
