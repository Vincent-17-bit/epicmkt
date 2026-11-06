import { useId, useState } from "react";
import { isHexColor, normalizeValueKey } from "@epicmkt/shared";
import OpenValueInput from "./OpenValueInput.jsx";
import { DEFAULT_PALETTE } from "./palette.js";
import { normaliseResult } from "./source.js";
import { T } from "./text.js";
import s from "./values.module.css";

// Colour: tap a common colour, or type a name ("Wine red") and optionally choose its exact shade.
// A colour with a shade is shown as a swatch card, one without as a text card (see ValueChip).
// The shade is stored with a NEW colour name only; an existing name keeps the shade it already has.
export default function ColorValueInput({ label = "Colour", value = null, onChange, source, palette = DEFAULT_PALETTE, id, hint, required = false, disabled = false, error }) {
  const uid = useId();
  const [useShade, setUseShade] = useState(false);
  const [hex, setHex] = useState("#8b1a2b");
  const [busy, setBusy] = useState("");
  const [failed, setFailed] = useState(false);

  const hexOk = isHexColor(hex);
  const shade = useShade && hexOk ? hex.toLowerCase() : null;
  const blockAdd = useShade && !hexOk ? T.shadeInvalid : "";

  // A palette tap: use the colour already in the shared list under that name, or add it with the palette's shade.
  async function pickPalette(p) {
    if (busy || !source) return;
    setBusy(p.name); setFailed(false);
    try {
      const key = normalizeValueKey(p.name);
      const found = normaliseResult(await source.search("color", p.name, { limit: 8 }));
      const hit = found.matches.find((m) => m.key === key) ?? (!found.canAdd ? found.matches[0] : null);
      if (hit) { onChange?.(hit); return; }
      onChange?.((await source.add("color", p.name, p.hex)).value);
    } catch {
      setFailed(true);
    } finally {
      setBusy("");
    }
  }

  return (
    <fieldset className={s.fieldset} disabled={disabled}>
      <OpenValueInput
        kind="color" label={label} value={value} onChange={onChange} source={source} id={id} hint={hint}
        required={required} error={error} addHex={shade} blockAdd={blockAdd} placeholder="Type a colour name"
      />
      {!value && (
        <>
          <div>
            <p className={s.label} id={`${uid}-pal`}>{T.paletteLabel}</p>
            <ul className={s.palette} aria-labelledby={`${uid}-pal`}>
              {palette.map((p) => (
                <li key={p.name}>
                  <button type="button" className={s.paletteBtn} disabled={!source || Boolean(busy)} aria-busy={busy === p.name || undefined} onClick={() => pickPalette(p)}>
                    <span className={s.dot} style={{ background: p.hex }} aria-hidden="true" />
                    {p.name}
                  </button>
                </li>
              ))}
            </ul>
            {busy && <p role="status" className={s.hint}>{T.paletteBusy}</p>}
            {failed && <p role="alert" className={s.error}>{T.paletteFailed}</p>}
          </div>
          <div className={s.shade}>
            <label className={s.check}>
              <input type="checkbox" checked={useShade} onChange={(e) => setUseShade(e.target.checked)} />
              {T.shadeToggle}
            </label>
            {useShade && (
              <>
                <div className={s.shadeRow}>
                  <label className={s.shadeField}>
                    {T.shadeHex}
                    <input type="text" className={s.input} value={hex} maxLength={7} spellCheck="false" autoComplete="off" aria-invalid={hexOk ? undefined : "true"} onChange={(e) => setHex(e.target.value.trim())} />
                  </label>
                  <label className={s.shadeField}>
                    {T.shadePick}
                    <input type="color" className={s.colorPick} value={hexOk ? hex.toLowerCase() : "#000000"} onChange={(e) => setHex(e.target.value)} />
                  </label>
                </div>
                <p className={s.hint}>{T.shadeHelp}</p>
              </>
            )}
          </div>
        </>
      )}
    </fieldset>
  );
}
