import { useEffect } from "react";
import { useBlocker } from "react-router-dom";
import { Button, Modal } from "../ui/ui.jsx";

// Warns before leaving with changes that have not reached the server: tab close, reload and in-app navigation.
export function UnsavedGuard({ when, flush }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname);

  useEffect(() => {
    if (!when) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [when]);

  const blocked = blocker.state === "blocked";
  return (
    <Modal
      open={blocked}
      onClose={() => blocker.reset?.()}
      title="You have unsaved changes"
      actions={
        <>
          <Button onClick={() => blocker.reset?.()}>Stay here</Button>
          <Button variant="danger" onClick={() => blocker.proceed?.()}>Leave without saving</Button>
          <Button variant="primary" onClick={async () => { const ok = await flush(); if (ok) blocker.proceed?.(); else blocker.reset?.(); }}>Save and leave</Button>
        </>
      }
    >
      <p>Some rows have not finished saving, or could not be saved. If you leave now they will be lost.</p>
    </Modal>
  );
}
