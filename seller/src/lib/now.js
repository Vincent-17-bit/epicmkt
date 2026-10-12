import { useEffect, useState } from "react";

export const useNow = (ms = 1000) => {
  const [tick, setTick] = useState(Date.now);
  useEffect(() => {
    setTick(Date.now());
    const timer = setInterval(() => setTick(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return Math.max(tick, Date.now());
};
