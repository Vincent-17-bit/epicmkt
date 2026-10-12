import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { faPen, faPlus, faRotateLeft, faTrash } from "@fortawesome/free-solid-svg-icons";
import { discountLabel, flashStatus, formatCountdown, moderation, offerStatus, promoErrorMessage, salePrice, toMs } from "@epicmkt/shared";
import { promo } from "../../api/promo/index.js";
import { Button, Chip, EmptyState, Meter, ModerationNote, UpgradePrompt } from "../../components/ui.jsx";
import { toast } from "../../components/toast.js";
import { useNow } from "../../lib/now.js";
import { formatEat, formatKes } from "../../lib/time.js";
import { useItems, useUsage, useWorkspace } from "../../lib/workspace.js";
import OfferForm from "./OfferForm.jsx";
import FlashForm from "./FlashForm.jsx";
import styles from "./offers.module.css";

const STATUS_TONE = { active: "solid", scheduled: "primary", expired: undefined, running: "solid", ended: undefined };
const STATUS_LABEL = { active: "Active", scheduled: "Scheduled", expired: "Expired", running: "Running", ended: "Ended" };

function OfferCard({ offer, now, items, readOnly, onEdit, onDelete }) {
  const mod = moderation(offer);
  const status = offerStatus(offer, now);
  const end = toMs(offer.ends_at);
  const start = toMs(offer.starts_at);
  const names = offer.item_ids.map((id) => items.find((i) => i.id === id)?.name).filter(Boolean);
  return (
    <li className={styles.card}>
      {offer.banner_url && <img className={styles.banner} src={offer.banner_url} alt="" />}
      <h3 className={styles.cardTitle}>{offer.title}</h3>
      <div className={styles.chips}>
        {mod.state === "ok" && <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>}
        {offer.discount_type && <Chip tone="primary">{discountLabel(offer.discount_type, offer.discount_value)}</Chip>}
      </div>
      <ModerationNote row={offer} />
      {mod.state === "ok" && status === "active" && end && <p className={styles.count}>Ends in {formatCountdown(end - now)}</p>}
      {mod.state === "ok" && status === "scheduled" && <p className={styles.count}>Starts in {formatCountdown(start - now)}</p>}
      <p className={styles.meta}>{formatEat(offer.starts_at)} to {formatEat(offer.ends_at)} (Nairobi time)</p>
      <p className={styles.meta}>{names.length ? `Items: ${names.join(", ")}` : "Applies to your whole shop"}</p>
      {!readOnly && (
        <div className={styles.actions}>
          {mod.state !== "removed" && <Button size="sm" icon={faPen} onClick={() => onEdit(offer)}>Edit</Button>}
          <Button size="sm" variant="danger" icon={faTrash} onClick={() => onDelete(offer)}>Delete</Button>
        </div>
      )}
    </li>
  );
}

function FlashCard({ sale, now, items, readOnly, onRelist, onDelete }) {
  const mod = moderation(sale);
  const status = flashStatus(sale, now);
  const item = items.find((i) => i.id === sale.item_id);
  const price = item ? salePrice(item.price, sale.discount_type, sale.discount_value) : null;
  const unlisted = status === "ended" && sale.on_end === "unlist" && mod.state === "ok";
  return (
    <li className={styles.card}>
      <h3 className={styles.cardTitle}>{item?.name ?? "Item removed"}</h3>
      <div className={styles.chips}>
        {mod.state === "ok" && <Chip tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Chip>}
        <Chip tone="primary">{discountLabel(sale.discount_type, sale.discount_value)}</Chip>
      </div>
      <ModerationNote row={sale} />
      {item && price !== null && <p className={styles.price}><span className={styles.was}>{formatKes(item.price)}</span> {formatKes(price)}</p>}
      {mod.state === "ok" && status === "running" && <p className={styles.count}>Ends in {formatCountdown(toMs(sale.ends_at) - now)}</p>}
      {mod.state === "ok" && status === "scheduled" && <p className={styles.count}>Starts in {formatCountdown(toMs(sale.starts_at) - now)}</p>}
      <p className={styles.meta}>Ends {formatEat(sale.ends_at)} (Nairobi time)</p>
      <p className={styles.meta}>{unlisted ? "The item is unlisted." : sale.on_end === "unlist" ? "The item will be unlisted when it ends." : "The item stays listed when it ends."}</p>
      {!readOnly && (
        <div className={styles.actions}>
          {unlisted && <Button size="sm" icon={faRotateLeft} onClick={() => onRelist(sale)}>Relist item</Button>}
          <Button size="sm" variant="danger" icon={faTrash} onClick={() => onDelete(sale)}>Delete</Button>
        </div>
      )}
    </li>
  );
}

export default function OffersPage() {
  const qc = useQueryClient();
  const now = useNow();
  const ws = useWorkspace();
  const usage = useUsage();
  const items = useItems();
  const offers = useQuery({ queryKey: ["offers"], queryFn: () => promo.listOffers() });
  const flash = useQuery({ queryKey: ["flash"], queryFn: () => promo.listFlash() });
  const [offerDialog, setOfferDialog] = useState({ open: false, offer: null });
  const [flashOpen, setFlashOpen] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["offers"] });
    qc.invalidateQueries({ queryKey: ["flash"] });
    qc.invalidateQueries({ queryKey: ["usage"] });
  };
  const onError = (e) => toast(promoErrorMessage(e, ws.plan, ws.global));
  const delOffer = useMutation({ mutationFn: (o) => promo.deleteOffer(o.id), onSuccess: () => (refresh(), toast("Offer deleted")), onError });
  const delFlash = useMutation({ mutationFn: (s) => promo.deleteFlash(s.id), onSuccess: () => (refresh(), toast("Flash sale deleted")), onError });
  const relist = useMutation({ mutationFn: (s) => promo.updateFlash(s.id, { on_end: "keep" }), onSuccess: () => (refresh(), toast("Item relisted")), onError });

  if (ws.isPending) return null;

  const u = usage.data ?? { activeOffers: 0, flashMonth: 0, flashRunning: 0 };
  const offerFull = ws.limits.activeOffers !== null && u.activeOffers >= ws.limits.activeOffers;
  const monthFull = u.flashMonth >= ws.limits.flashSalesPerMonth;
  const runningFull = u.flashRunning >= ws.limits.flashSalesConcurrent;
  const flashFull = monthFull || runningFull;
  const itemList = items.data ?? [];

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Offers and flash sales</h1>
      </div>

      <div className={styles.meters}>
        <Meter label="Active offers" used={u.activeOffers} limit={ws.limits.activeOffers} />
        <Meter label="Flash sales this month" used={u.flashMonth} limit={ws.limits.flashSalesPerMonth} />
        <Meter label="Flash sales running now" used={u.flashRunning} limit={ws.limits.flashSalesConcurrent} />
      </div>

      <section className={styles.section} aria-labelledby="offers-h">
        <div className={styles.head}>
          <h2 id="offers-h" className={styles.sub}>Offers</h2>
          {!ws.readOnly && <Button variant="primary" icon={faPlus} disabled={offerFull} onClick={() => setOfferDialog({ open: true, offer: null })}>New offer</Button>}
        </div>
        {offerFull && !ws.readOnly && !ws.premium && <UpgradePrompt>You have used all {ws.limits.activeOffers} active offers. Premium has no limit and lets you schedule offers ahead.</UpgradePrompt>}
        {offerFull && !ws.readOnly && ws.premium && <p className={styles.meta}>You have used all your active offers. End or delete one to add another.</p>}
        {!offers.data?.length ? (
          <EmptyState title="No offers yet" action={!ws.readOnly && <Button icon={faPlus} onClick={() => setOfferDialog({ open: true, offer: null })}>Create your first offer</Button>}>
            Offers show on your page with a countdown while they run.
          </EmptyState>
        ) : (
          <ul className={styles.list}>
            {offers.data.map((o) => (
              <OfferCard key={o.id} offer={o} now={now} items={itemList} readOnly={ws.readOnly} onEdit={(offer) => setOfferDialog({ open: true, offer })} onDelete={(x) => delOffer.mutate(x)} />
            ))}
          </ul>
        )}
      </section>

      <section className={styles.section} aria-labelledby="flash-h">
        <div className={styles.head}>
          <h2 id="flash-h" className={styles.sub}>Flash sales</h2>
          {!ws.readOnly && <Button variant="primary" icon={faPlus} disabled={flashFull || !itemList.length} onClick={() => setFlashOpen(true)}>New flash sale</Button>}
        </div>
        {flashFull && !ws.readOnly && (
          <p className={styles.meta}>
            {monthFull ? `You have used all ${ws.limits.flashSalesPerMonth} flash sales for this month.` : `Your plan allows ${ws.limits.flashSalesConcurrent} flash ${ws.limits.flashSalesConcurrent === 1 ? "sale" : "sales"} at a time.`}
          </p>
        )}
        {flashFull && !ws.readOnly && !ws.premium && <UpgradePrompt>Premium gives you 10 flash sales a month and 5 running at once.</UpgradePrompt>}
        {!flash.data?.length ? (
          <EmptyState title="No flash sales yet">A flash sale puts one item at a lower price until the time you choose.</EmptyState>
        ) : (
          <ul className={styles.list}>
            {flash.data.map((s) => (
              <FlashCard key={s.id} sale={s} now={now} items={itemList} readOnly={ws.readOnly} onRelist={(x) => relist.mutate(x)} onDelete={(x) => delFlash.mutate(x)} />
            ))}
          </ul>
        )}
      </section>

      <OfferForm open={offerDialog.open} offer={offerDialog.offer} items={itemList} plan={ws.plan} premium={ws.premium} global={ws.global} onClose={() => setOfferDialog({ open: false, offer: null })} />
      <FlashForm open={flashOpen} items={itemList} plan={ws.plan} global={ws.global} onClose={() => setFlashOpen(false)} />
    </div>
  );
}
