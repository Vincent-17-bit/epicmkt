import { useEffect } from "react";

const BASE = "EpicMKT";

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${BASE}` : `${BASE}: Find local businesses in Kenya`;
  }, [title]);
}
