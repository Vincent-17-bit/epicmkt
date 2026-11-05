import { useMemo, useSyncExternalStore } from "react";
import { getSnapshot, subscribe } from "../lib/clock.js";
import { withLiveStatus } from "../lib/liveStatus.js";

const MINUTE = 60000;
const minuteNow = () => Math.floor(getSnapshot() / MINUTE);

export function useLiveStatus(business) {
  const minute = useSyncExternalStore(subscribe, minuteNow, minuteNow);
  return useMemo(() => withLiveStatus(business, minute * MINUTE), [business, minute]);
}
