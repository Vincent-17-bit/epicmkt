import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import Modal from "../../components/Modal.jsx";

export default function NewConversation({ onPick, onClose }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["admin-message-picker", term],
    queryFn: () => api.listBusinesses({ search: term, pageSize: 20 }),
    placeholderData: (previous) => previous,
  });
  const rows = data?.rows ?? [];

  return (
    <Modal title="New conversation" onClose={onClose}>
      <div className="modal__form">
        <label className="field">Business
          <input type="search" value={search} autoFocus placeholder="Name, seller ID or phone" onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="msg-picker" aria-live="polite">
          {isLoading ? <p role="status" className="msg-empty">Loading</p> : null}
          {isError ? <p role="alert" className="msg-empty">Could not load businesses. <Button size="sm" onClick={() => refetch()}>Try again</Button></p> : null}
          {!isLoading && !isError && rows.length === 0 ? <p className="msg-empty">No business matches that search.</p> : null}
          <ul>
            {rows.map((b) => (
              <li key={b.id}>
                <button type="button" className="msg-picker__item" data-testid="picker-row" onClick={() => onPick({ id: b.id, name: b.name, sellerId: b.sellerId })}>
                  <span className="msg-list__name">{b.name}</span>
                  <span className="muted">{b.sellerId}{b.town ? ` · ${b.town}` : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal__footer">
          <Button onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  );
}
