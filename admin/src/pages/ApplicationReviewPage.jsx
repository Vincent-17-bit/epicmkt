import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/index.js";
import Checklist from "./review/Checklist.jsx";
import DataPanel from "./review/DataPanel.jsx";
import DocumentViewer from "./review/DocumentViewer.jsx";
import DuplicatePanel from "./review/DuplicatePanel.jsx";
import FlagsPanel from "./review/FlagsPanel.jsx";
import NotesPanel from "./review/NotesPanel.jsx";
import Timeline from "./review/Timeline.jsx";
import { statusLabel } from "./review/helpers.js";

export default function ApplicationReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const opened = useRef(false);
  const [composer, setComposer] = useState({ open: false, path: "" });

  const application = useQuery({ queryKey: ["admin-application", id], queryFn: () => api.getApplication(id) });
  const flags = useQuery({ queryKey: ["admin-flags", id], queryFn: () => api.getFlags(id) });
  const duplicates = useQuery({ queryKey: ["admin-duplicates", id], queryFn: () => api.getDuplicates(id) });
  const timeline = useQuery({ queryKey: ["admin-timeline", id], queryFn: () => api.getTimeline(id) });
  const notes = useQuery({ queryKey: ["admin-notes", id], queryFn: () => api.getNotes(id) });

  const returnToQueue = useMutation({
    mutationFn: () => api.returnToQueue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-applications"] });
      navigate("/admin/applications");
    },
  });

  const beforeView = async () => {
    if (opened.current) return;
    opened.current = true;
    try {
      await api.openApplication(id);
    } catch (error) {
      opened.current = false;
      throw error;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-application", id] });
    queryClient.invalidateQueries({ queryKey: ["admin-timeline", id] });
  };

  const onFlag = (path) => {
    setComposer({ open: true, path });
    document.getElementById("review-flags")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  if (application.isError) {
    return (
      <div className="empty-state">
        <div>
          <p>This application could not be loaded.</p>
          <Link to="/admin/applications">Back to the queue</Link>
        </div>
      </div>
    );
  }

  if (!application.data) {
    return (
      <div className="page-shell">
        <section className="panel"><span className="skeleton" /></section>
      </div>
    );
  }

  const app = application.data;
  const flagList = flags.data ?? [];
  const duplicateList = duplicates.data ?? [];
  const flagged = new Set(flagList.filter((f) => f.status !== "confirmed").map((f) => f.path));

  return (
    <div className="page-shell">
      <div className="review-head">
        <div>
          <div className="eyebrow">{app.reference}</div>
          <h2>{app.businessName}</h2>
          <span className="muted">{app.ownerName}</span>
        </div>
        <div className="review-head__actions">
          <span className="status-pill status-pill--neutral">{statusLabel(app.status)}</span>
          <button type="button" className="secondary-button" disabled={returnToQueue.isPending} onClick={() => returnToQueue.mutate()}>
            Return to queue
          </button>
        </div>
      </div>

      {returnToQueue.isError ? <p className="form-error">{returnToQueue.error.message}</p> : null}

      <div className="review-grid">
        <div className="review-col">
          <DocumentViewer app={app} flagged={flagged} onFlag={onFlag} beforeView={beforeView} />
          <Checklist app={app} flags={flagList} duplicates={duplicateList} />
          <DuplicatePanel duplicates={duplicateList} loading={duplicates.isLoading} />
        </div>
        <div className="review-col">
          <FlagsPanel app={app} flags={flagList} composer={composer} setComposer={setComposer} />
          <DataPanel app={app} flagged={flagged} onFlag={onFlag} />
        </div>
      </div>

      <div className="review-grid">
        <NotesPanel app={app} notes={notes.data ?? []} />
        <Timeline events={timeline.data ?? []} loading={timeline.isLoading} />
      </div>
    </div>
  );
}
