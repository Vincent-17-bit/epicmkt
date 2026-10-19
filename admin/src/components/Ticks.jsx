import { RECEIPT_LABEL } from "@epicmkt/shared";

// One green tick: sent. Two green ticks: delivered. Two blue ticks: read.
export default function Ticks({ state }) {
  const label = RECEIPT_LABEL[state] ?? RECEIPT_LABEL.sent;
  return (
    <span className="ticks" data-state={state} data-testid="ticks" role="img" aria-label={label} title={label}>
      <svg viewBox="0 0 20 12" width="20" height="12" aria-hidden="true" focusable="false">
        <path d="M1 6.5 4.5 10 11 2" />
        {state !== "sent" && <path d="M7.5 9.5 9 10 15.5 2" />}
      </svg>
    </span>
  );
}
