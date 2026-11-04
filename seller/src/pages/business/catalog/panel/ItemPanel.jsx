import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "../../../../api/index.js";
import { mediaUrl } from "../../../../api/shape.js";
import { useRealtime } from "../../../../lib/useRealtime.js";
import ui from "../../../../styles/ui.module.css";
import { priceText } from "../cardItem.js";
import { prefersCalm } from "../editor/hooks.js";
import ActionBar from "./ActionBar.jsx";
import Deals from "./Deals.jsx";
import History from "./History.jsx";
import ItemQuestions from "./ItemQuestions.jsx";
import Overview from "./Overview.jsx";
import Performance from "./Performance.jsx";
import styles from "./panel.module.css";
import { reasonFor } from "./visibility.js";
import { useMedia } from "../../../../lib/useMedia.js";

export const SECTIONS = [["overview", "Overview"], ["performance", "Performance"], ["deals", "Deals"], ["questions", "Questions"], ["history", "History"]];
const CLOSE_MS = 180;
const TYPING = ["INPUT", "TEXTAREA", "SELECT"];

const CHIP = { showing: "Showing", draft: "Draft", hidden: "Hidden", hidden_admin: "Hidden by EpicMKT", removed: "Removed", out_of_stock: "Out of stock", expired: "Shop not live", paused: "Shop not live", pending: "Shop not live", suspended: "Suspended" };

function Skeleton() {
  return (
    <div className={styles.skeletonStack} aria-busy="true" data-testid="panel-skeleton">
      <span className={styles.skeletonChart} />
      <span className={styles.skeletonRow} />
      <span className={styles.skeletonRow} />
    </div>
  );
}

export default function ItemPanel() {
  const ctx = useOutletContext();
  const { itemId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const docked = useMedia("(min-width: 64rem)");
  const phone = useMedia("(max-width: 47.99rem)");
  const mode = docked ? "dock" : phone ? "sheet" : "overlay";
  const root = useRef(null);
  const scroller = useRef(null);
  const drag = useRef(null);
  const [state, setState] = useState("entering");
  const section = SECTIONS.some(([id]) => `#${id}` === location.hash) ? location.hash.slice(1) : "overview";
  const me = useQuery({ queryKey: ["subscription"], queryFn: api.getSubscription, retry: false });
  const item = ctx.item;
  const shop = ctx.shop;
  const suspended = me.data?.business?.status === "suspended";
  const reason = useMemo(() => (item ? reasonFor(item, shop, { suspended }) : null), [item, shop, suspended]);
  const at = ctx.navIds.indexOf(itemId);
  const panelCtx = useMemo(() => ({ ...ctx, readOnly: suspended, readOnlyText: ctx.suspendedText }), [ctx, suspended]);

  useRealtime(["items", "item_history", "flash_sales", "flags"], () => {
    qc.invalidateQueries({ queryKey: ["item", itemId] });
    qc.invalidateQueries({ queryKey: ["catalog"] });
    qc.invalidateQueries({ queryKey: ["flash-sales"] });
    qc.invalidateQueries({ queryKey: ["questions"] });
  });

  useEffect(() => {
    const frame = requestAnimationFrame(() => setState("open"));
    return () => cancelAnimationFrame(frame);
  }, []);

  const requestClose = useCallback(() => {
    if (prefersCalm()) {
      ctx.onClose();
      return;
    }
    setState("leaving");
    window.setTimeout(ctx.onClose, CLOSE_MS);
  }, [ctx]);

  useEffect(() => {
    const dialog = root.current;
    if (mode === "dock" || !dialog) return undefined;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else dialog.setAttribute("open", "");
    return () => {
      if (typeof dialog.close === "function") {
        if (dialog.open) dialog.close();
      } else dialog.removeAttribute("open");
    };
  }, [mode]);

  useEffect(() => { scroller.current?.scrollTo?.({ top: 0 }); }, [section, itemId]);

  const step = useCallback((dir) => {
    const next = ctx.navIds[at + dir];
    if (next) ctx.onStep(next);
  }, [ctx, at]);

  const setSection = (id) => navigate({ pathname: location.pathname, search: location.search, hash: id === "overview" ? "" : `#${id}` }, { replace: true });

  const onKeyDown = (e) => {
    const el = e.target;
    const typing = TYPING.includes(el.tagName) || el.isContentEditable;
    if (e.key === "Escape" && mode === "dock") {
      e.preventDefault();
      requestClose();
    } else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (e.key === "j") step(1);
      if (e.key === "k") step(-1);
    }
  };

  const onTabKey = (e) => {
    const i = SECTIONS.findIndex(([id]) => id === section);
    const to = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? SECTIONS.length - 1 : null;
    if (to === null) return;
    e.preventDefault();
    const next = SECTIONS[(to + SECTIONS.length) % SECTIONS.length][0];
    setSection(next);
    document.getElementById(`tab-${next}`)?.focus();
  };

  const onHandleDown = (e) => { drag.current = { y: e.clientY }; e.currentTarget.setPointerCapture?.(e.pointerId); };
  const onHandleUp = (e) => {
    const start = drag.current;
    drag.current = null;
    if (start && e.clientY - start.y > 72) requestClose();
  };

  const Shell = mode === "dock" ? "aside" : "dialog";
  const shellProps = mode === "dock"
    ? { "aria-labelledby": "panel-title" }
    : { "aria-labelledby": "panel-title", onCancel: (e) => { e.preventDefault(); requestClose(); }, onClick: (e) => { if (e.target === root.current) requestClose(); }, onClose: () => {} };

  const body = () => {
    if (!item) {
      return (
        <div className={styles.pad} data-testid="panel-not-found">
          <h3 className={styles.h3}>We could not find that item</h3>
          <p className={ui.muted}>It may have been deleted, belong to another shop, or the link is old. Your list is still here.</p>
          <button type="button" className={ui.btn} onClick={requestClose}>Back to your listings</button>
        </div>
      );
    }
    if (ctx.loading) return <div className={styles.pad}><Skeleton /></div>;
    const tabs = { overview: <Overview item={item} shop={shop} reason={reason} ctx={panelCtx} />, performance: <Performance item={item} showing={reason.showing} />, deals: <Deals item={item} />, questions: <ItemQuestions item={item} readOnly={suspended} />, history: <History item={item} /> };
    return <div className={styles.pad} role="tabpanel" id={`tabpanel-${section}`} aria-labelledby={`tab-${section}`} tabIndex={-1}>{tabs[section]}</div>;
  };

  return (
    <Shell
      ref={root}
      className={styles.shell}
      data-mode={mode}
      data-state={state}
      data-item-panel=""
      {...shellProps}
      onKeyDown={onKeyDown}
    >
      {mode === "sheet" && (
        <div className={styles.handle} onPointerDown={onHandleDown} onPointerUp={onHandleUp} aria-hidden="true"><span /></div>
      )}
      <header className={styles.head}>
        <span className={styles.thumb}>{item?.imagePaths?.[0] && <img src={mediaUrl(item.imagePaths[0])} alt="" />}</span>
        <div className={styles.headText}>
          <h2 id="panel-title" className={styles.title} tabIndex={-1}>{item ? item.name : "Item"}</h2>
          {item && (
            <p className={styles.sub}>
              <span>{priceText(item)}</span>
              <span className={`${styles.chip} ${reason.showing ? styles.chipOk : ""}`} data-testid="panel-status">{CHIP[reason.code] ?? "Hidden"}</span>
            </p>
          )}
        </div>
        <div className={styles.headBtns}>
          <button type="button" className={styles.icon} onClick={() => step(-1)} disabled={at <= 0} aria-label="Previous item">‹</button>
          <button type="button" className={styles.icon} onClick={() => step(1)} disabled={at < 0 || at >= ctx.navIds.length - 1} aria-label="Next item">›</button>
          <button type="button" className={styles.icon} onClick={requestClose} aria-label="Close">×</button>
        </div>
      </header>

      {item && (
        <div className={styles.tabs} role="tablist" aria-label="Item sections" onKeyDown={onTabKey}>
          {SECTIONS.map(([id, label]) => (
            <button key={id} id={`tab-${id}`} type="button" role="tab" aria-selected={section === id} aria-controls={`tabpanel-${id}`} tabIndex={section === id ? 0 : -1} onClick={() => setSection(id)}>{label}</button>
          ))}
        </div>
      )}

      <div ref={scroller} className={styles.scroll}>
        {ctx.notice && <p className={ctx.notice.tone === "error" ? `${ui.error} ${styles.pad}` : `${styles.okNote} ${styles.pad}`} role={ctx.notice.tone === "error" ? "alert" : "status"}>{ctx.notice.text}</p>}
        {ctx.error ? (
          <div className={styles.pad}>
            <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
              <h2>We could not load this item</h2>
              <p>{ctx.error}</p>
              <button type="button" className={`${ui.btn} ${ui.btnGhost}`} onClick={ctx.retry}>Try again</button>
            </div>
          </div>
        ) : body()}
      </div>

      {item && <ActionBar item={item} shop={shop} ctx={panelCtx} reason={reason} logo={Boolean(me.data?.business?.logoPath)} />}
    </Shell>
  );
}
