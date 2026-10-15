import { useEffect, useState } from "react";
import { formatEatTime } from "../lib/eat.js";

/** Nairobi time, to the minute. EAT is the only clock that matters for expiry and quiet hours. */
export default function EatClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  const time = formatEatTime(now);
  return (
    <time className="eat-clock" dateTime={now.toISOString()} aria-label={`Nairobi time ${time}`}>
      <span aria-hidden="true">{time} <small>EAT</small></span>
    </time>
  );
}
