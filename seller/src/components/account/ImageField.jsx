import { useRef, useState } from "react";
import CropDialog from "./CropDialog.jsx";
import { FieldGroup } from "./ui.jsx";

/**
 * One picture slot. value is null (unchanged), "remove", or { blob, preview } for a freshly cropped photo.
 * The upload itself happens when the card is saved.
 */
export default function ImageField({ label, hint, currentUrl, value, onChange, aspect, outW, outH, shape = "wide", disabled = false }) {
  const input = useRef(null);
  const [file, setFile] = useState(null);
  const shown = value === "remove" ? null : value?.preview ?? currentUrl;

  return (
    <FieldGroup label={label} hint={hint}>
      <div className={`sx-image sx-image--${shape}`}>
        {shown ? <img src={shown} alt={`${label} preview`} /> : <span className="sx-muted">No photo yet</span>}
      </div>
      <div className="sx-row">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          hidden
          aria-label={`Choose ${label.toLowerCase()} file`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setFile(f);
          }}
        />
        <button type="button" className="sx-btn" disabled={disabled} onClick={() => input.current.click()}>{shown ? "Change photo" : "Choose photo"}</button>
        {value ? (
          <button type="button" className="sx-btn sx-btn--quiet" disabled={disabled} onClick={() => onChange(null)}>Undo</button>
        ) : currentUrl ? (
          <button type="button" className="sx-btn sx-btn--quiet" disabled={disabled} onClick={() => onChange("remove")}>Remove</button>
        ) : null}
      </div>
      {file && (
        <CropDialog
          file={file}
          title={`Crop ${label.toLowerCase()}`}
          aspect={aspect}
          outW={outW}
          outH={outH}
          onCancel={() => setFile(null)}
          onConfirm={(crop) => { setFile(null); onChange(crop); }}
        />
      )}
    </FieldGroup>
  );
}
