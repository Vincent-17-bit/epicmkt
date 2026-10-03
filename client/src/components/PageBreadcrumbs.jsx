import { useNavigate, useLocation } from "react-router-dom";
import { logEvent } from "../api/index.js";
import { useBreadcrumbs } from "../hooks/useBreadcrumbs.js";
import { useBreadcrumbJsonLd } from "../hooks/useBreadcrumbJsonLd.js";
import { readResults } from "../lib/resultsMemory.js";
import { t } from "../i18n/index.js";
import Breadcrumbs from "./Breadcrumbs/Breadcrumbs.jsx";

export default function PageBreadcrumbs() {
  const { status, trail, prefetch } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  useBreadcrumbJsonLd(status === "ready" ? trail : []);

  if (status === "none" || status === "not-found") return null;

  const stored = location.pathname.startsWith("/b/") ? readResults() : null;
  const back = stored
    ? {
        label: t("breadcrumb.back"),
        onClick: () => {
          const url = `${stored.path}${stored.search}`;
          if (location.state?.from === url) navigate(-1);
          else navigate(url);
        }
      }
    : null;

  const onCrumbClick = (crumb, index) => {
    logEvent("breadcrumb_click", { level: index, target: crumb.to });
    const keepsPage = crumb.key.startsWith("b-") && trail[trail.length - 1]?.key.startsWith("i-");
    if (!keepsPage) document.getElementById("main")?.scrollTo(0, 0);
  };

  return <Breadcrumbs trail={trail} loading={status === "loading"} back={back} onCrumbClick={onCrumbClick} onCrumbIntent={prefetch} />;
}
