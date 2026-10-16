import { useState } from "react";
import { faBookmark, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Button from "../Button.jsx";
import Popover from "./Popover.jsx";

export default function SavedViews({ views, onApply, onDelete, onSave }) {
  const [name, setName] = useState("");

  const submit = (event) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName("");
  };

  return (
    <Popover label="Views" icon={faBookmark}>
      {views.length ? (
        <ul className="dt__list">
          {views.map((view) => (
            <li key={view.id} className="dt__view">
              <button type="button" className="dt__view-apply" onClick={() => onApply(view)}>{view.name}</button>
              <button type="button" className="dt__icon" aria-label={`Delete view ${view.name}`} onClick={() => onDelete(view.id)}>
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dt__hint">No saved views</p>
      )}
      <form className="dt__save" onSubmit={submit}>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name this view" maxLength={40} aria-label="View name" />
        <Button size="sm" variant="primary" type="submit" disabled={!name.trim()}>Save</Button>
      </form>
    </Popover>
  );
}
