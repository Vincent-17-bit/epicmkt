import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEllipsis, faXmark } from "@fortawesome/free-solid-svg-icons";
import { formatKes } from "@epicmkt/shared";
import { items } from "../../api/index.js";
import { FOCUSABLE_WITH_FIELDS, useFocusTrap } from "../../hooks/useFocusTrap.js";
import { savedList } from "../../lib/savedList.js";
import { useSaved } from "../../stores/saved.js";
import { showToast } from "../../stores/toast.js";
import { announce } from "../../stores/savedAnnounce.js";
import { t } from "../../i18n/index.js";
import { buildView, fill } from "./model.js";
import ShopGroup from "./ShopGroup.jsx";
import { SAVED_ID, useSavedDrawer } from "./useSavedDrawer.js";
import { useSwipeClose } from "./useSwipeClose.js";
import styles from "./SavedDrawer.module.css";

const useOnline = () => {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
};

const counts = (items_, shops) =>
  fill("saved.counts", {
    items: items_ === 1 ? t("saved.itemOne") : fill("saved.itemMany", { n: String(items_) }),
    shops: shops === 1 ? t("saved.shopOne") : fill("saved.shopMany", { n: String(shops) })
  });

/**
 * The Saved drawer: everything the buyer saved, one box per shop, sent to each shop in one WhatsApp message. It is mounted while the history
 * state says `saved: true` (or on /saved). It draws from the snapshots at once and refreshes from the database in the background.
 */
export default function SavedDrawer() {
  const { close, goTo } = useSavedDrawer();
  const entries = useSaved((s) => s.entries);
  const status = useSaved((s) => ({ readOnly: s.readOnly, writeFailed: s.writeFailed }), );
  const online = useOnline();
  const panelRef = useRef(null);
  const backdropRef = useRef(null);
  const headingRef = useRef(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const ids = useMemo(() => [...new Set(entries.map((e) => e.itemId))].sort(), [entries]);
  const query = useQuery({
    queryKey: ["saved", ids],
    queryFn: () => items.getSaved(ids),
    enabled: ids.length > 0,
    staleTime: 30_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
    placeholderData: keepPreviousData
  });
  const view = useMemo(() => buildView(entries, query.data ?? null, { stale: !online || query.isError }), [entries, query.data, online, query.isError]);
  const loading = query.isPending && query.fetchStatus === "fetching";

  // Open: focus the heading; the opener gets focus back on close (if it is still on the page). The body lock is the one the page already holds,
  // saved and put back exactly (the item sheet may hold it too), never reset to "".
  useEffect(() => {
    const opener = document.activeElement;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    headingRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previous;
      if (opener?.isConnected && opener !== document.body) opener.focus({ preventScroll: true });
    };
  }, []);

  const escape = useCallback(() => {
    if (confirm) setConfirm(false);
    else if (menu) setMenu(false);
    else close();
  }, [confirm, menu, close]);
  useFocusTrap({ active: true, getContainer: () => panelRef.current, onEscape: escape, selector: FOCUSABLE_WITH_FIELDS, skipNegativeTabIndex: true, wrapFromOutside: true });
  useSwipeClose({ panelRef, backdropRef, onClose: close });

  // New totals are said once, not on the first draw.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (view.count) announce(fill("saved.liveTotal", { total: formatKes(view.total) }));
  }, [view.total]);

  const removeAll = () => {
    const list = savedList();
    const was = list.clear();
    setConfirm(false);
    setMenu(false);
    announce(t("saved.liveRemoved"));
    showToast(t("saved.toastRemoved"), { duration: 6000, action: { label: t("saved.undo"), onClick: () => { list.restoreAll(was); announce(t("saved.toastAddedBack")); } } });
  };

  const empty = view.count === 0;
  const totalText = view.unpriced
    ? fill(view.unpriced === 1 ? "saved.totalNoPriceOne" : "saved.totalNoPriceMany", { total: fill("saved.total", { total: formatKes(view.total) }), n: String(view.unpriced) })
    : fill(view.mayChange ? "saved.totalMayChange" : "saved.total", { total: formatKes(view.total) });

  return (
    <div className={styles.root}>
      <div ref={backdropRef} className={styles.backdrop} onClick={close} aria-hidden="true" data-testid="saved-backdrop" />
      <aside ref={panelRef} id={SAVED_ID} role="dialog" aria-modal="true" aria-labelledby="saved-heading" className={styles.panel} tabIndex={-1}>
        <header className={styles.top}>
          <div className={styles.titles}>
            <h2 id="saved-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>
              {t("saved.heading")}
            </h2>
            {!empty && <p className={styles.counts}>{counts(view.count, view.shops)}</p>}
          </div>
          <button type="button" className={styles.close} onClick={close} aria-label={t("saved.close")}>
            <FontAwesomeIcon icon={faXmark} aria-hidden="true" />
          </button>
          {!empty && (
            <div className={styles.moreWrap}>
              <button type="button" className={styles.more} aria-label={t("saved.more")} aria-expanded={menu} aria-haspopup="true" onClick={() => setMenu((v) => !v)}>
                <FontAwesomeIcon icon={faEllipsis} aria-hidden="true" />
              </button>
              {menu && (
                <div className={styles.menu}>
                  <button type="button" className={styles.menuItem} onClick={() => { setMenu(false); setConfirm(true); }}>
                    {t("saved.removeAll")}
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {(!online || status.writeFailed) && (
          <div className={styles.notices}>
            {!online && <p className={styles.notice} role="status">{t("saved.offline")}</p>}
            {status.writeFailed && <p className={styles.notice} role="status">{t("saved.storageFail")}</p>}
          </div>
        )}

        <div className={styles.body}>
          {empty ? (
            <div className={styles.empty}>
              <svg width="44" height="44" viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={styles.emptyIcon}>
                <path d="M12 20.5s-7.5-4.6-9.3-9.2C1.5 8.2 3.4 5 6.6 5c1.9 0 3.5 1 4.4 2.5h2C13.9 6 15.5 5 17.4 5c3.2 0 5.1 3.2 3.9 6.3-1.8 4.6-9.3 9.2-9.3 9.2z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
              <p className={styles.emptyTitle}>{t("saved.emptyTitle")}</p>
              <p className={styles.emptyBody}>{t("saved.emptyBody")}</p>
              <button type="button" className={styles.browse} onClick={() => goTo("/")}>
                {t("saved.browse")}
              </button>
            </div>
          ) : (
            <div className={styles.groups}>
              {view.groups.map((group) => (
                <ShopGroup key={group.businessId} group={group} loading={loading} goTo={goTo} />
              ))}
            </div>
          )}
        </div>

        {!empty && (
          <footer className={styles.foot}>
            <p className={styles.total} data-testid="saved-total">{totalText}</p>
            <p className={styles.note}>{t("saved.footerNote")}</p>
          </footer>
        )}

        {confirm && (
          <div className={styles.confirmWrap}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="saved-confirm" className={styles.confirm}>
              <h3 id="saved-confirm" className={styles.confirmTitle}>{t("saved.confirmTitle")}</h3>
              <p className={styles.confirmBody}>{fill("saved.confirmBody", { n: view.count === 1 ? t("saved.itemOne") : fill("saved.itemMany", { n: String(view.count) }) })}</p>
              <div className={styles.confirmActions}>
                <button type="button" className={styles.keep} onClick={() => setConfirm(false)} autoFocus>
                  {t("saved.confirmNo")}
                </button>
                <button type="button" className={styles.danger} onClick={removeAll}>
                  {t("saved.confirmYes")}
                </button>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
