import { useEffect, useMemo, useState } from "react";
import {
  SCOPES, SCOPE_LABELS, partialPresets, validatePartial, fillMessageTemplate, defaultPartialMessage, formatWhen, validateClosureMessage,
  MESSAGE_MAX, MAX_PARTIAL_MS, floorToMinute, MS_HOUR, midnightOf, MS_DAY, MS_MIN
} from "@epicmkt/shared/hours";
import { Button, Chip, PartialClosureNote } from "../../components/ui/index.js";
import { showToast } from "../../stores/toast.js";
import { messageForError } from "./errors.js";
import { toLocalDateTime, parseLocalDateTime } from "./format.js";
import styles from "./hours.module.css";

const same = (p, scope, section) => p.scope === scope && (p.section ?? "") === (section ?? "");

function untilForPreset(key, at, customValue) {
  if (key === "1h") return floorToMinute(at + MS_HOUR);
  if (key === "4h") return floorToMinute(at + 4 * MS_HOUR);
  if (key === "today") return midnightOf(at) + MS_DAY - MS_MIN;
  if (key === "tomorrow") return midnightOf(at) + 2 * MS_DAY - MS_MIN;
  if (key === "custom") return parseLocalDateTime(customValue);
  return null;
}

function ScopeCard({ scope, section, title, active, defaults, now, actions, disabled = false, disabledText }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("1h");
  const [custom, setCustom] = useState("");
  const [template, setTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = scope === "section" ? section || "Section" : SCOPE_LABELS[scope];
  const baseTemplate = defaultPartialMessage(scope, section, defaults.partialMessage);

  useEffect(() => {
    setOpen(false);
    setError("");
    setKey("1h");
    setCustom("");
    setTemplate(baseTemplate);
  }, [section, scope, baseTemplate]);

  const until = untilForPreset(key, now, custom);
  const filled = fillMessageTemplate(template, until, now);
  const msg = validateClosureMessage(filled);
  const candidate = until != null ? { scope, section: scope === "section" ? section : null, until: new Date(until).toISOString(), message: msg.ok ? msg.text : "" } : null;
  const check = candidate ? validatePartial(candidate, now) : { ok: false };
  const presets = partialPresets(now);

  const restore = async (previous) => {
    try {
      if (previous && Date.parse(previous.until) > Date.now()) await actions.setPartial(scope, { section: previous.section, until: previous.until, message: previous.message });
      else await actions.setPartial(scope, scope === "section" ? { section } : null);
      showToast("Change undone");
    } catch (e) {
      showToast(messageForError(e), { tone: "error" });
    }
  };

  const pause = async () => {
    const at = Date.now();
    const finalUntil = untilForPreset(key, at, custom);
    const text = fillMessageTemplate(template, finalUntil, at);
    const result = validatePartial({ scope, section: scope === "section" ? section : null, until: finalUntil == null ? null : new Date(finalUntil).toISOString(), message: text }, at);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const previous = active;
      await actions.setPartial(scope, { section: result.value.section, until: result.value.until, message: result.value.message });
      setOpen(false);
      showToast(`${label} paused until ${formatWhen(finalUntil, at)}`, { action: { label: "Undo", onClick: () => restore(previous) } });
    } catch (e) {
      setError(messageForError(e));
    } finally {
      setBusy(false);
    }
  };

  const resume = async () => {
    setBusy(true);
    try {
      const previous = active;
      await actions.setPartial(scope, scope === "section" ? { section } : null);
      showToast(`${label} resumed`, { action: { label: "Undo", onClick: () => restore(previous) } });
    } catch (e) {
      showToast(messageForError(e), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const customMin = toLocalDateTime(now);
  const customMax = toLocalDateTime(now + MAX_PARTIAL_MS);
  const idBase = `partial-${scope}-${(section ?? "").replace(/\W/g, "")}`;

  return (
    <article className={styles.scopeCard} aria-label={`${title} pause`}>
      <header className={styles.scopeHead}>
        <h3 className={styles.scopeTitle}>{title}</h3>
        <span className={`${styles.activeChip} ${active ? styles.activeOn : ""}`} data-testid={`${scope}-state`}>
          <span className={styles.dot} aria-hidden="true" />
          {active ? "Active" : "Not active"}
        </span>
      </header>

      {disabled ? (
        <p className={styles.hint}>{disabledText}</p>
      ) : (
        <>
          {active && (
            <div className={styles.activeBody}>
              <PartialClosureNote partial={active} now={now} />
              <p className={styles.hint}>Until {formatWhen(Date.parse(active.until), now)}</p>
            </div>
          )}

          {!open && (
            <div className={styles.actionRow}>
              <Button variant={active ? "secondary" : "primary"} size="sm" onClick={() => setOpen(true)} disabled={busy}>
                {active ? "Change" : "Pause until…"}
              </Button>
              {active && (
                <Button size="sm" onClick={resume} busy={busy}>
                  Resume now
                </Button>
              )}
            </div>
          )}

          {open && (
            <div className={styles.sheetStack}>
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Pause until</legend>
                <div className={styles.chipRow}>
                  {presets.map((p) => (
                    <Chip key={p.key} selected={key === p.key} onClick={() => setKey(p.key)}>
                      {p.label}
                    </Chip>
                  ))}
                  <Chip selected={key === "custom"} onClick={() => setKey("custom")}>
                    Custom
                  </Chip>
                </div>
                {key === "custom" && (
                  <div className={styles.customRow}>
                    <label htmlFor={`${idBase}-dt`} className={styles.legend}>
                      Date and time
                    </label>
                    <input
                      id={`${idBase}-dt`}
                      type="datetime-local"
                      className={styles.textInput}
                      min={customMin}
                      max={customMax}
                      step={300}
                      value={custom}
                      onChange={(e) => setCustom(e.target.value)}
                    />
                    <p className={styles.hint}>Up to 7 days from now.</p>
                  </div>
                )}
                {until != null && <p className={styles.resultLine}>Paused until {formatWhen(until, now)}</p>}
              </fieldset>

              <div className={styles.fieldset}>
                <label htmlFor={`${idBase}-msg`} className={styles.legend}>
                  Message for customers <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id={`${idBase}-msg`}
                  className={`${styles.textInput} ${msg.ok ? "" : styles.invalidField}`}
                  value={template}
                  onChange={(e) => setTemplate(e.target.value)}
                  aria-invalid={!msg.ok || undefined}
                />
                <div className={styles.counterRow}>
                  <span className={msg.ok ? styles.hint : styles.error} role={msg.ok ? undefined : "alert"}>
                    {msg.ok ? "Use {time} to insert the end time." : msg.message}
                  </span>
                  <span className={[...filled].length > MESSAGE_MAX ? styles.error : styles.hint}>
                    {[...filled].length}/{MESSAGE_MAX}
                  </span>
                </div>
              </div>

              <div className={styles.previewBox}>
                <p className={styles.legend}>What customers will see</p>
                {candidate ? <PartialClosureNote partial={{ ...candidate, message: msg.ok ? msg.text : "" }} now={now} /> : <p className={styles.hint}>Choose a time to see a preview.</p>}
              </div>

              {error && (
                <p className={styles.error} role="alert">
                  {error}
                </p>
              )}
              <div className={styles.actionRow}>
                <Button onClick={() => setOpen(false)} size="sm" disabled={busy}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={pause} busy={busy} disabled={!check.ok || !msg.ok}>
                  Pause
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </article>
  );
}

export default function PartialClosures({ data, defaults, now, actions }) {
  const list = useMemo(() => (Array.isArray(data.partial_closures) ? data.partial_closures : []), [data.partial_closures]);
  const [section, setSection] = useState("");
  const sections = defaults.sections;

  useEffect(() => {
    if (!sections.includes(section)) setSection(sections[0] ?? "");
  }, [sections, section]);

  const activeFor = (scope, sec) => list.find((p) => same(p, scope, sec) && Date.parse(p.until) > now) ?? null;
  const pausedSections = sections.filter((s) => activeFor("section", s));

  return (
    <div className={styles.scopeGrid}>
      {SCOPES.filter((s) => s !== "section").map((scope) => (
        <ScopeCard key={scope} scope={scope} section={null} title={SCOPE_LABELS[scope]} active={activeFor(scope, null)} defaults={defaults} now={now} actions={actions} />
      ))}
      <div className={styles.sectionWrap}>
        {sections.length > 0 && (
          <div className={styles.sectionPicker}>
            <label htmlFor="section-select" className={styles.legend}>
              Item section
            </label>
            <select id="section-select" className={styles.select} value={section} onChange={(e) => setSection(e.target.value)}>
              {sections.map((s) => (
                <option key={s} value={s}>
                  {s}
                  {activeFor("section", s) ? " (paused)" : ""}
                </option>
              ))}
            </select>
            {pausedSections.length > 0 && <p className={styles.hint}>Paused: {pausedSections.join(", ")}</p>}
          </div>
        )}
        <ScopeCard
          scope="section"
          section={section}
          title={section ? `Section: ${section}` : "Item section"}
          active={section ? activeFor("section", section) : null}
          defaults={defaults}
          now={now}
          actions={actions}
          disabled={!section}
          disabledText="You have no item sections yet. Add sections to your catalog to pause them here."
        />
      </div>
    </div>
  );
}
