import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import { fmtDateTime } from "./helpers.js";

const parseTags = (text) =>
  [...new Set(text.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 10);

function NoteRow({ note, refresh }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags.join(", "));

  const update = useMutation({
    mutationFn: (patch) => api.updateNote(note, patch),
    onSuccess: () => { setEditing(false); refresh(); },
  });

  return (
    <li className={`note ${note.pinned ? "note--pinned" : ""}`}>
      {editing ? (
        <>
          <textarea value={body} rows={3} maxLength={2000} aria-label="Edit note" onChange={(event) => setBody(event.target.value)} />
          <input value={tags} aria-label="Edit tags" placeholder="Tags, comma separated" onChange={(event) => setTags(event.target.value)} />
          <div className="composer__actions">
            <button type="button" className="secondary-button" onClick={() => { setEditing(false); setBody(note.body); setTags(note.tags.join(", ")); }}>Cancel</button>
            <button type="button" className="primary-button" disabled={!body.trim() || update.isPending} onClick={() => update.mutate({ body: body.trim(), tags: parseTags(tags) })}>Save</button>
          </div>
        </>
      ) : (
        <>
          <p>{note.body}</p>
          <div className="note__meta">
            <span className="muted">{fmtDateTime(note.createdAt)}</span>
            {note.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            <span className="note__actions">
              <button type="button" className="link-button" disabled={update.isPending} onClick={() => update.mutate({ pinned: !note.pinned })}>{note.pinned ? "Unpin" : "Pin"}</button>
              <button type="button" className="link-button" onClick={() => setEditing(true)}>Edit</button>
            </span>
          </div>
        </>
      )}
    </li>
  );
}

export default function NotesPanel({ app, notes }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [filter, setFilter] = useState(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-notes", app.id] });

  const add = useMutation({
    mutationFn: () => api.addNote(app.id, { body: body.trim(), tags: parseTags(tags) }),
    onSuccess: () => { setBody(""); setTags(""); refresh(); },
  });

  const allTags = [...new Set(notes.flatMap((n) => n.tags))];
  const shown = filter ? notes.filter((n) => n.tags.includes(filter)) : notes;

  return (
    <section className="panel">
      <div className="panel__header">
        <h3>Internal notes</h3>
        <span className="muted">Not visible to the applicant</span>
      </div>

      <form className="composer" onSubmit={(event) => { event.preventDefault(); if (body.trim()) add.mutate(); }}>
        <textarea value={body} rows={3} maxLength={2000} placeholder="Add a note" aria-label="New note" onChange={(event) => setBody(event.target.value)} />
        <input value={tags} placeholder="Tags, comma separated" aria-label="Tags" onChange={(event) => setTags(event.target.value)} />
        {add.isError ? <p className="form-error">{add.error.message}</p> : null}
        <div className="composer__actions">
          <button type="submit" className="primary-button" disabled={!body.trim() || add.isPending}>Add note</button>
        </div>
      </form>

      {allTags.length ? (
        <div className="tag-filter">
          <button type="button" className={`tag ${filter === null ? "is-active" : ""}`} onClick={() => setFilter(null)}>All</button>
          {allTags.map((tag) => (
            <button key={tag} type="button" className={`tag ${filter === tag ? "is-active" : ""}`} onClick={() => setFilter(tag === filter ? null : tag)}>{tag}</button>
          ))}
        </div>
      ) : null}

      {shown.length ? (
        <ul className="note-list">
          {shown.map((note) => <NoteRow key={note.id} note={note} refresh={refresh} />)}
        </ul>
      ) : (
        <p className="muted">No notes yet.</p>
      )}
    </section>
  );
}
