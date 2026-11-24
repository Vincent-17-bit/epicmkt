import { useState } from "react";
import { faArrowUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { api } from "../../api/index.js";
import Button from "../../components/Button.jsx";
import { useToast } from "../../components/Toast.jsx";
import { usePermissions } from "../../hooks/usePermissions.js";
import { friendlyError } from "../../lib/businessDetail.js";
import { sellerSiteBase, sellerSiteLink } from "../../lib/sellerSite.js";

// Opens this business's own seller site in a new tab, signed in as that business, so the admin sees exactly what the seller sees and can add
// products, set closed days and change anything the seller can. The tab is opened first, inside the click, so a pop-up blocker allows it.
export default function OpenSellerSite({ id, name }) {
  const { can, why } = usePermissions();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    const base = sellerSiteBase();
    if (!base) {
      toast.push({ message: "The seller site address is not set. Add VITE_SELLER_URL (the seller site's web address) to the admin app's settings and redeploy it." });
      return;
    }
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setBusy(true);
    try {
      const r = await api.openSellerSite({ businessId: id, reason: "Opened the seller site from the admin" });
      const link = sellerSiteLink({ base, tokenHash: r.tokenHash, businessName: r.businessName ?? name, sellerId: r.sellerId ?? "", adminUrl: window.location.origin });
      if (tab) tab.location.href = link;
      else window.location.href = link;
    } catch (failure) {
      tab?.close();
      toast.push({ message: `Could not open the seller site: ${friendlyError(failure)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="primary" icon={faArrowUpRightFromSquare} disabled={!can("sellers.open_site") || busy} title={why("sellers.open_site")} onClick={open}>
      {busy ? "Opening…" : "Open seller site"}
    </Button>
  );
}
