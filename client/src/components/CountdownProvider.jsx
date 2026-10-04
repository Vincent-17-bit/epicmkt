import { useServerClockSync } from "../hooks/useCountdown.js";

export default function CountdownProvider({ children }) {
  useServerClockSync();
  return children;
}
