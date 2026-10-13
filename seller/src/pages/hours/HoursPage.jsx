import { useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router-dom";
import { computeStatus, formatWhen, validateOverride } from "@epicmkt/shared/hours";
import { Button } from "../../components/ui/index.js";
import { useNow } from "../../hooks/useNow.js";
import { showToast } from "../../stores/toast.js";
import { useHoursQuery, useHoursDefaults } from "./queries.js";
import { useHoursActions } from "./actions.js";
import { useWeekDraft } from "./weekDraft.js";
import { messageForError } from "./errors.js";
import StatusCard from "./StatusCard.jsx";
import ClosureActions from "./ClosureActions.jsx";
import WeeklyEditor from "./WeeklyEditor.jsx";
import ClosureSheet from "./ClosureSheet.jsx";
import ExtendSheet from "./ExtendSheet.jsx";
import ConfirmSheet from "./ConfirmSheet.jsx";
import PartialClosures from "./PartialClosures.jsx";
import Exceptions from "./Exceptions.jsx";
import CustomerPreview from "./CustomerPreview.jsx";
import styles from "./hours.module.css";

function Section({ id, title, description, children }) {
  return (
    <section className={styles.section} aria-labelledby={`${id}-title`} id={id}>
      <header className={styles.sectionHead}>
        <h2 id={`${id}-title`} className={styles.sectionTitle}>
          {title}
        </h2>
        {description && <p className={styles.sectionDesc}>{description}</p>}
      </header>
      {children}
    </section>
  );
}

export default function HoursPage() {
  const { data } = useHoursQuery();
  const defaults = useHoursDefaults();
  const actions = useHoursActions();
  const now = useNow(15000, data);
  const status = useMemo(() => computeStatus(data, now), [data, now]);
  const afterReopen = useMemo(() => computeStatus({ ...data, override: null }, now), [data, now]);
  const week = useWeekDraft(data, actions);
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reopenKind, setReopenKind] = useState("close");
  const blocker = useBlocker(week.dirty);

  useEffect(() => {
    if (!week.dirty) return undefined;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [week.dirty]);

  const closeSheet = () => setSheet(null);

  const restoreOverride = async (previous) => {
    try {
      if (previous) {
        const check = validateOverride(previous, Date.now());
        if (!check.ok) {
          showToast("Too late to undo: that time has already passed.", { tone: "error" });
          return;
        }
        await actions.setOverride(check.value);
      } else {
        await actions.setOverride(null);
      }
      showToast("Change undone");
    } catch (e) {
      showToast(messageForError(e), { tone: "error" });
    }
  };

  const onClosureDone = ({ type, saved, previous }) => {
    closeSheet();
    const until = Date.parse(saved.until);
    showToast(type === "open" ? `Open until ${formatWhen(until, Date.now())}` : `Closed until ${formatWhen(until, Date.now())}`, {
      action: { label: "Undo", onClick: () => restoreOverride(previous) }
    });
  };

  const onExtendDone = ({ saved, previous }) => {
    closeSheet();
    showToast(`Closure extended until ${formatWhen(Date.parse(saved.until), Date.now())}`, { action: { label: "Undo", onClick: () => restoreOverride(previous) } });
  };

  const reopen = async () => {
    const previous = data.override;
    const wasClosure = previous?.type === "close";
    setBusy(true);
    try {
      await actions.setOverride(null);
      closeSheet();
      const open = computeStatus({ ...data, override: null }, Date.now()).isOpen;
      showToast(open ? (wasClosure ? "You are open again" : "Back to your usual hours") : wasClosure ? "Closure ended. Your usual hours apply." : "Back to your usual hours", {
        duration: 10000,
        action: { label: "Undo", onClick: () => restoreOverride(previous) }
      });
    } catch (e) {
      showToast(messageForError(e), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const handlers = {
    onCloseTemp: () => setSheet("close"),
    onOpenLate: () => setSheet("open"),
    onReopen: () => {
      setReopenKind("close");
      setSheet("reopen");
    },
    onExtend: () => setSheet("extend"),
    onEndOpenLate: () => {
      setReopenKind("open");
      setSheet("reopen");
    }
  };

  const activeClosure = status.override?.type === "close" ? status.override : null;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Hours and closures</h1>

      <Section id="status" title="Status now">
        <StatusCard status={status} now={now} {...handlers} />
      </Section>

      <Section id="weekly" title="Weekly hours" description="Set when you are open each day. Gaps between opening times count as breaks, for example lunch.">
        <WeeklyEditor state={week} now={now} />
      </Section>

      <Section id="temporary" title="Temporary closure and open late" description="Close for a short time, or stay open past your usual hours. A closure can last up to 24 hours in total.">
        <div className={styles.card}>
          <ClosureActions status={status} now={now} {...handlers} />
        </div>
      </Section>

      <Section id="partial" title="Partial closures" description="Pause one part of your business without closing completely.">
        <PartialClosures data={data} defaults={defaults} now={now} actions={actions} />
      </Section>

      <Section id="exceptions" title="Date exceptions" description="Different hours for a specific date, such as a public holiday.">
        <Exceptions data={data} now={now} actions={actions} />
      </Section>

      <Section id="preview" title="Customer preview" description="This is how customers see your business right now.">
        <CustomerPreview data={data} draftHours={week.draft} dirty={week.dirty} now={now} />
      </Section>

      <ClosureSheet open={sheet === "close" || sheet === "open"} onClose={closeSheet} type={sheet === "open" ? "open" : "close"} business={data} defaults={defaults} actions={actions} onDone={onClosureDone} />
      <ExtendSheet open={sheet === "extend"} onClose={closeSheet} override={activeClosure} actions={actions} onDone={onExtendDone} />
      <ConfirmSheet
        open={sheet === "reopen"}
        onClose={closeSheet}
        onConfirm={reopen}
        busy={busy}
        title={reopenKind === "close" ? "Reopen now?" : "End open late now?"}
        confirmLabel={reopenKind === "close" ? "Reopen now" : "End open late"}
      >
        <p className={styles.sheetText}>
          {reopenKind === "close"
            ? afterReopen.isOpen
              ? "Customers will see you as open right away. You can undo this for 10 seconds."
              : `Your closure ends now. Your usual hours apply, so customers will see: ${afterReopen.detail}. You can undo this for 10 seconds.`
            : "You will go back to your usual hours right away. You can undo this for 10 seconds."}
        </p>
      </ConfirmSheet>

      <ConfirmSheet
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        onConfirm={() => blocker.proceed?.()}
        title="Leave without saving?"
        confirmLabel="Leave"
        cancelLabel="Keep editing"
        tone="danger"
      >
        <p className={styles.sheetText}>You have unsaved changes to your weekly hours. If you leave now they will be lost.</p>
      </ConfirmSheet>
    </div>
  );
}
