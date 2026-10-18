import { useNavigate, useLocation } from "react-router-dom";
import { logEvent } from "../api/index.js";
import { parseItemPath } from "../config/breadcrumbs.js";
import { useBreadcrumbs } from "../hooks/useBreadcrumbs.js";
import { useBreadcrumbJsonLd } from "../hooks/useBreadcrumbJsonLd.js";
import { backDelta, clearResults, readResults } from "../lib/resultsMemory.js";
import { t } from "../i18n/index.js";
import Breadcrumbs from "./Breadcrumbs/Breadcrumbs.jsx";

export default function PageBreadcrumbs() {
  const { status, trail, prefetch } = useBreadcrumbs();
  const navigate = useNavigate();
  const location = useLocation();
  useBreadcrumbJsonLd(status === "ready" ? trail : []);

  if (status === "none" || status === "not-found") return null;

  const itemRoute = parseItemPath(location.pathname);
  const slug = /^\/b\/([^/]+)/.exec(location.pathname)?.[1];
  const found = slug ? readResults() : null;
  const stored = found?.businessSlug === slug ? found : null;
  const cameFromApp = Number(window.history.state?.idx) > 0;
  let back = null;
  if (stored) {
    back = {
      label: t("breadcrumb.back"),
      onClick: () => {
        const delta = backDelta(stored);
        clearResults();
        if (delta > 0) navigate(-delta);
        else navigate(`${stored.path}${stored.search}`);
      }
    };
  } else if (itemRoute) {
    back = cameFromApp
      ? { label: t("item.backPrevious"), onClick: () => navigate(-1) }
      : { label: t("item.backToStore"), onClick: () => navigate(`/b/${slug}`) };
  }

  const onCrumbClick = (crumb, index) => {
    logEvent("breadcrumb_click", { level: index, target: crumb.to });
    window.scrollTo(0, 0);
  };

  return (
    <Breadcrumbs
      trail={trail}
      loading={status === "loading"}
      back={back}
      scrollable={Boolean(itemRoute)}
      onCrumbClick={onCrumbClick}
      onCrumbIntent={prefetch}
    />
  );
}
