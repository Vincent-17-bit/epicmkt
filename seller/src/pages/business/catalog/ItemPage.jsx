import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBolt } from "@fortawesome/free-solid-svg-icons";
import { ItemView } from "@epicmkt/ui";
import { formatInstant, formatKes, isListed, offerLabel, offerPhase, zoneLabel } from "@epicmkt/shared";
import * as api from "../../../api/index.js";
import { clientItemUrl } from "../../../lib/clientUrl.js";
import { detailBusiness, itemDetailOf, runningSale } from "../../../lib/itemDetail.js";
import { errorText } from "../../../lib/errors.js";
import ui from "../../../styles/ui.module.css";
import RestockDialog from "./RestockDialog.jsx";
import { barHeights, deltaText } from "./statsView.js";
import { whyShown } from "./whyShown.js";
import styles from "./itemPage.module.css";

const UNDO_MS = 8000;

const endsText = (iso) => `Ends ${formatInstant(iso, { locale: "en-KE", weekday: "short", hour: "numeric", minute: "2-digit" })} ${zoneLabel(iso)}`;

function FlashLine({ pricing, sale }) {
  return (
    <p className={styles.flashLine}>
      <FontAwesomeIcon icon={faBolt} aria-hidden="true" />
      <strong>{formatKes(pricing.salePrice)}</strong>
      <s>{formatKes(pricing.regularPrice)}</s>
      <span>{sale.headline ? `${sale.headline}. ` : ""}{endsText(sale.endsAt)}</span>
    </p>
  );
}

export default function ItemPage() {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restocking, setRestocking] = useState(false);
  const [undo, setUndo] = useState(false);
  const [range, setRange] = useState(30);
  const timerRef = useRef(null);
  const pendingRef = useRef(false);

  const catalog = useQuery({ queryKey: ["catalog", "items"], queryFn: api.getCatalog });
  const preview = useQuery({ queryKey: ["shop-preview"], queryFn: api.getShopPreview, retry: false });
  const media = useQuery({ queryKey: ["item-media", itemId], queryFn: () => api.listItemMedia(itemId), retry: false });
  const sales = useQuery({ queryKey: ["flash-sales"], queryFn: api.listFlashSales });
  const offers = useQuery({ queryKey: ["offers"], queryFn: api.listOffers });
  const stats = useQuery({ queryKey: ["item-stats", itemId, range], queryFn: () => api.getItemStats(itemId, range), retry: false });

  const refresh = () => Promise.all(["catalog", "shop-preview", "flash-sales", "offers", "item-media"].map((key) => qc.invalidateQueries({ queryKey: [key] })));

  const commitDelete = async () => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    clearTimeout(timerRef.current);
    setUndo(false);
    try {
      await api.bulkItems("delete", [itemId]);
      await refresh();
      navigate("/business/catalog", { replace: true, state: { notice: { tone: "ok", text: "1 item deleted." } } });
    } catch (e) {
      setNotice({ tone: "error", text: errorText(e) });
    }
  };

  useEffect(() => () => {
    if (pendingRef.current) {
      clearTimeout(timerRef.current);
      api.bulkItems("delete", [itemId]).catch(() => {});
    }
  }, [itemId]);

  const back = <Link to="/business/catalog" className={styles.back}>Back to My listings</Link>;

  const item = catalog.data?.items.find((i) => i.id === itemId) ?? null;
  const shop = useMemo(() => (preview.data ? { ...preview.data.shop, live: catalog.data?.shop.live ?? preview.data.shop.live } : null), [preview.data, catalog.data]);

  if (catalog.isPending || preview.isPending) return <div className={styles.wrap}>{back}<p className={styles.note} role="status">Loading</p></div>;
  if (catalog.isError || preview.isError) {
    return (
      <div className={styles.wrap}>
        {back}
        <div className={`${ui.banner} ${ui.tone_danger}`} role="alert">
          <h2>We could not load this item</h2>
          <p>{errorText(catalog.error ?? preview.error)}</p>
          <button type="button" className={ui.btnGhost} onClick={() => { catalog.refetch(); preview.refetch(); }}>Try again</button>
        </div>
      </div>
    );
  }
  if (!item) {
    return (
      <div className={styles.wrap}>
        {back}
        <div className={`${ui.banner} ${ui.tone_warning}`} role="alert">
          <h2>This item is not in your listings</h2>
          <p>It may have been deleted.</p>
        </div>
      </div>
    );
  }

  const nowMs = Date.now();
  const sale = runningSale(sales.data, item.id, nowMs);
  const liveOffers = (offers.data ?? []).filter((o) => o.items?.some((e) => e.itemId === item.id) && offerPhase(o, nowMs) === "live");
  const upcomingOffers = (offers.data ?? []).filter((o) => o.items?.some((e) => e.itemId === item.id) && offerPhase(o, nowMs) === "scheduled");
  const itemSales = (sales.data ?? []).filter((s) => s.itemId === item.id && ["live", "scheduled"].includes(s.status));
  const status = whyShown({ item, shop });
  const url = clientItemUrl(shop.slug, item.id);
  const locked = item.removedByAdmin;
  const adminHidden = item.hiddenByAdmin || item.removedByAdmin;
  const hiding = item.visible && !item.draft;
  const detail = itemDetailOf({ item, shop, items: catalog.data.items, media: media.data ?? null, sale, offers: liveOffers, nowMs });
  const business = detailBusiness(shop, catalog.data.items);

  const run = async (work, okText) => {
    setBusy(true);
    try {
      await work();
      await refresh();
      setNotice({ tone: "ok", text: okText });
    } catch (e) {
      setNotice({ tone: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const restock = () => (item.trackStock ? setRestocking(true) : run(() => api.itemStock(item.id, "restock"), `${item.name} is back in stock. Customers can see it again.`));
  const toggle = () => run(() => api.bulkItems(hiding ? "hide" : "show", [item.id]), hiding ? "Item hidden." : "Item is now showing.");
  const fix = (id) => {
    if (id === "resume") return run(() => api.pauseListing(false), "Your shop is live again.");
    if (id === "show") return toggle();
    if (id === "restock") return restock();
    return undefined;
  };
  const startDelete = () => {
    pendingRef.current = true;
    setUndo(true);
    timerRef.current = setTimeout(commitDelete, UNDO_MS);
  };
  const undoDelete = () => {
    clearTimeout(timerRef.current);
    pendingRef.current = false;
    setUndo(false);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ tone: "ok", text: "Link copied." });
    } catch {
      setNotice({ tone: "error", text: "Could not copy the link." });
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.bar}>
        {back}
        <p className={styles.note}>Preview. This is the page customers get for this item. Buttons do not work here.</p>
      </div>
      {notice && <p className={`${ui.banner} ${notice.tone === "error" ? ui.tone_danger : ui.tone_ok}`} role={notice.tone === "error" ? "alert" : "status"}>{notice.text}</p>}
      {undo && (
        <p className={styles.undo} role="status" data-testid="undo-bar">
          1 item will be deleted.
          <button type="button" className={ui.btnGhost} onClick={undoDelete}>Undo</button>
        </p>
      )}
      <div className={styles.grid}>
        <div className={styles.page} data-testid="item-preview">
          <ItemView
            layout="page"
            mode="preview"
            state="ready"
            item={detail}
            itemId={item.id}
            business={business}
            distanceKm={null}
            flash={detail.flash ? { banner: (shown) => <FlashLine pricing={shown} sale={detail.flash.sale} /> } : null}
          />
        </div>
        <aside className={styles.side} aria-label="Item controls">
          <section className={ui.card} aria-labelledby="item-status">
            <h2 id="item-status">{status.showing ? "Showing to customers" : "Not showing to customers"}</h2>
            {status.showing ? (
              <p className={ui.muted}>Customers can find this item in your shop.</p>
            ) : (
              <ul className={styles.reasons}>
                {status.reasons.map((r) => (
                  <li key={r.code}>
                    <span>{r.text}</span>
                    {r.fix?.to && <Link to={r.fix.to} className={ui.btn}>{r.fix.label}</Link>}
                    {r.fix && !r.fix.to && <button type="button" className={ui.btn} disabled={busy} onClick={() => fix(r.fix.id)}>{r.fix.label}</button>}
                  </li>
                ))}
              </ul>
            )}
            <div className={styles.row}>
              <a href={url} target="_blank" rel="noreferrer" className={ui.btnGhost}>Open live page</a>
              <button type="button" className={ui.btnGhost} onClick={copy}>Copy link</button>
            </div>
          </section>

          <section className={ui.card} aria-labelledby="item-stats">
            <h2 id="item-stats">Customer activity</h2>
            <div className={styles.ranges} role="group" aria-label="Period">
              {[7, 30, 90].map((d) => (
                <button key={d} type="button" className={styles.range} aria-pressed={range === d} onClick={() => setRange(d)}>{d} days</button>
              ))}
            </div>
            {stats.isPending && <p className={ui.muted} role="status">Loading</p>}
            {stats.isError && <p className={ui.muted} role="alert">{errorText(stats.error)}</p>}
            {stats.data && (
              <>
                <dl className={styles.totals}>
                  {[["views", "Views"], ["whatsapp", "WhatsApp taps"], ["call", "Call taps"]].map(([key, label]) => (
                    <div key={key}>
                      <dt>{label}</dt>
                      <dd>
                        <strong>{stats.data.totals[key]}</strong>
                        <span className={styles.delta}>{deltaText(stats.data.totals[key], stats.data.previous[key])}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className={styles.bars} role="img" aria-label={`Views per day over the last ${stats.data.days} days`}>
                  {barHeights(stats.data.daily, "views").map((h, i) => (
                    <span key={stats.data.daily[i].day} className={styles.bar} style={{ height: `${h}%` }} title={`${stats.data.daily[i].day}: ${stats.data.daily[i].views}`} />
                  ))}
                </div>
                <p className={ui.muted}>Each person counts once a day. Change is against the {stats.data.days} days before.</p>
              </>
            )}
          </section>

          <section className={ui.card} aria-labelledby="item-promos">
            <h2 id="item-promos">Flash sales and offers</h2>
            {itemSales.length === 0 && liveOffers.length === 0 && upcomingOffers.length === 0 && <p className={ui.muted}>No flash sale or offer on this item.</p>}
            <ul className={styles.list}>
              {itemSales.map((s) => (
                <li key={s.id}>
                  <strong>{s.status === "live" ? "Flash sale running" : "Flash sale scheduled"}</strong>
                  <span>{s.discountType === "percent" ? `${s.discountValue}% off` : `${formatKes(s.discountValue)} off`}. {endsText(s.endsAt)}</span>
                </li>
              ))}
              {[...liveOffers, ...upcomingOffers].map((o) => (
                <li key={o.id}>
                  <strong>{offerPhase(o, nowMs) === "live" ? "Offer running" : "Offer scheduled"}</strong>
                  <span>{offerLabel(o)}</span>
                </li>
              ))}
            </ul>
            <div className={styles.row}>
              <Link to="/business/flash" className={ui.btnGhost}>Flash sales</Link>
              <Link to="/business/offers" className={ui.btnGhost}>Offers</Link>
            </div>
          </section>

          <section className={ui.card} aria-labelledby="item-actions">
            <h2 id="item-actions">Actions</h2>
            <div className={styles.row}>
              {locked ? <button type="button" className={ui.btn} disabled>Edit</button> : <Link to={`/business/catalog/${item.id}/edit`} className={ui.btn}>Edit</Link>}
              {!isListed(item) ? (
                <button type="button" className={ui.btnGhost} disabled={locked || busy} onClick={restock}>Back in stock</button>
              ) : (
                <button type="button" className={ui.btnGhost} disabled={locked || busy} onClick={() => run(() => api.itemStock(item.id, "sold_out"), `${item.name} is out of stock. Customers no longer see it.`)}>Mark out of stock</button>
              )}
              <button type="button" className={ui.btnGhost} disabled={adminHidden || busy} onClick={toggle}>{hiding ? "Hide" : "Show"}</button>
              <button type="button" className={ui.btnGhost} disabled={locked || busy || undo} onClick={startDelete}>Delete</button>
            </div>
          </section>
        </aside>
      </div>
      <RestockDialog
        open={restocking}
        item={item}
        onClose={() => setRestocking(false)}
        onApply={async (count) => {
          await api.itemStock(item.id, "restock", count);
          await refresh();
          setNotice({ tone: "ok", text: `${item.name} is back in stock. Customers can see it again.` });
          setRestocking(false);
        }}
      />
    </div>
  );
}
