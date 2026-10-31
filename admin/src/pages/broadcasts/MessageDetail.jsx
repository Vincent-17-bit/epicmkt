import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import Modal from "../../components/Modal.jsx";
import { stampNairobi } from "../../lib/time.js";

const CHANNEL = { sms: "SMS", email: "Email", in_app: "In-app" };

export default function MessageDetail({ id, onClose }) {
  const { data: m, isLoading, isError, error, refetch } = useQuery({ queryKey: ["admin-message-detail", id], queryFn: () => api.getMessageDetail(id) });
  const who = m ? (m.business_id ? m.business_name : m.application_name ?? "Applicant") : "";
  const rows = m ? [
    ["To", [who, m.to_address ?? "In-app"].filter(Boolean).join(" · ")],
    m.applicant_name ? ["Applicant", m.applicant_name] : null,
    m.seller_id ? ["Seller ID", m.seller_id] : null,
    ["Channel", CHANNEL[m.channel] ?? m.channel],
    ["Status", m.status],
    m.template_key ? ["Template", m.template_key] : null,
    ["Kind", m.transactional ? "Billing or account notice" : "Promotional or general"],
    ["Created", stampNairobi(m.created_at)],
    m.scheduled_at ? ["Scheduled", stampNairobi(m.scheduled_at)] : null,
    m.sent_at ? ["Sent", stampNairobi(m.sent_at)] : null,
    ["Attempts", String(m.attempts)],
    m.error ? ["Error", m.error] : null,
    m.provider_id ? ["Provider reference", m.provider_id] : null,
    m.cost_kes != null ? ["Cost", `KES ${Number(m.cost_kes).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`] : null,
    m.created_by_email ? ["Sent by", m.created_by_email] : null,
    m.batch_id ? ["Broadcast", String(m.batch_id).slice(0, 8)] : null,
  ].filter(Boolean) : [];

  return (
    <Modal title={m?.subject ?? "Message"} onClose={onClose}>
      <div className="modal__form">
        {isLoading ? <p role="status" className="muted">Loading</p> : null}
        {isError ? <p role="alert" className="modal__error">{error.message} <Button size="sm" onClick={() => refetch()}>Try again</Button></p> : null}
        {m ? (
          <>
            <p className="log-detail__body" data-testid="message-body">{m.body}</p>
            <dl className="log-detail">
              {rows.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
              ))}
            </dl>
          </>
        ) : null}
        <div className="modal__footer"><Button onClick={onClose}>Close</Button></div>
      </div>
    </Modal>
  );
}
