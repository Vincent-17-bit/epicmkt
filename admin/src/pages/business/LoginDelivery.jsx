import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import ConfirmDialog from "../../components/ConfirmDialog.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { friendlyError } from "../../lib/businessDetail.js";
import { summarizeLoginDelivery } from "../../lib/loginDelivery.js";

export default function LoginDelivery({ id, name }) {
  const { can, why } = usePermissions();
  const client = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const rows = useQuery({ queryKey: ["admin-login-delivery", id], queryFn: () => api.getLoginDelivery(id), enabled: can("messages.view") });

  const resend = useMutation({
    mutationFn: (reason) => api.resendLogin({ businessId: id, reason }),
    onSuccess: () => {
      setOpen(false);
      setError("");
      toast.push({ message: "A new temporary password was issued and sent." });
      client.invalidateQueries({ queryKey: ["admin-login-delivery", id] });
      client.invalidateQueries({ queryKey: ["admin-business-activity", id] });
    },
    onError: (failure) => setError(friendlyError(failure)),
  });

  if (!can("messages.view") || rows.isPending || rows.isError) return null;
  const summary = summarizeLoginDelivery(rows.data);

  return (
    <div className="biz-actions">
      <span className={`chip ${summary.failed ? "chip--danger" : "chip--neutral"}`} role={summary.failed ? "alert" : undefined}>{summary.label}</span>
      <Button disabled={!can("sellers.resend_login")} title={why("sellers.resend_login")} onClick={() => { setError(""); setOpen(true); }}>
        Resend login
      </Button>
      {open ? (
        <ConfirmDialog
          title={`Resend login for ${name}?`}
          summary="A new temporary password is issued and sent by SMS and email. The old one stops working, and the seller must choose a new password after signing in."
          confirmLabel="Resend login"
          busy={resend.isPending}
          error={error}
          onCancel={() => setOpen(false)}
          onConfirm={(reason) => resend.mutate(reason)}
        />
      ) : null}
    </div>
  );
}
