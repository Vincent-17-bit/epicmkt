import { useMemo } from "react";
import CountdownTiles from "../components/CountdownTiles.jsx";
import FlashChip from "../components/FlashChip.jsx";
import FlashSaleCard from "../components/FlashSaleCard.jsx";
import FuseBar from "../components/FuseBar.jsx";
import PromoChip from "../components/PromoChip.jsx";
import Starburst from "../components/Starburst.jsx";
import styles from "./FlashBlocks.module.css";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const states = [
  ["calm", 50 * HOUR + 30 * MINUTE],
  ["soon", 6 * HOUR + 14 * MINUTE + 9 * SECOND],
  ["urgent", 42 * MINUTE + 20 * SECOND],
  ["critical", 3 * MINUTE + 30 * SECOND],
  ["ended", -SECOND]
];

const sparkPairs = {
  light: [
    ["flash-spark", "flash-tile-bg", 3],
    ["flash-tile-bg", "surface-3", 3]
  ],
  dark: [["flash-spark", "surface-3", 3]]
};

const flashPairs = [
  ["flash-band-text", "flash-gradient", 4.5],
  ["flash-tile-text", "flash-tile-bg", 4.5],
  ["flash-tile-label", "flash-tile-bg", 4.5],
  ["flash-tile-urgent-text", "flash-tile-bg", 4.5],
  ["flash-tile-critical-text", "flash-tile-critical-bg", 4.5],
  ["flash-tile-edge", "flash-tile-bg", 3],
  ["flash-burst-text", "flash-burst-gradient", 4.5],
  ["flash-save-text", "flash-save-bg", 4.5],
  ["flash-price-sale", "surface", 4.5],
  ["flash-price-sale", "flash-save-bg", 4.5],
  ["text", "flash-section-bg", 4.5],
  ["offer-stub-text", "offer-stub-gradient", 4.5],
  ["offer-body-text", "offer-body-bg", 4.5],
  ["offer-validity-text", "offer-validity-bg", 4.5],
  ["offer-validity-urgent-text", "offer-validity-urgent-bg", 4.5]
];

const art = (hue) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 60% 70%)"/><stop offset="1" stop-color="hsl(${hue + 40} 50% 40%)"/></linearGradient></defs><rect width="640" height="480" fill="url(#g)"/></svg>`
  )}`;

const business = { id: "b_style", slug: "fade-kings", name: "Fade Kings Barbershop", logo: null, verified: true, distanceKm: 1.4, isOpen: true };

const makeEntry = (id, name, hue, endsInMs, discount, extra = {}) => ({
  sale: {
    id,
    headline: extra.headline ?? null,
    quantityNote: extra.quantityNote ?? null,
    startsAt: new Date(Date.now() - 6 * HOUR).toISOString(),
    endsAt: new Date(Date.now() + endsInMs).toISOString(),
    discount
  },
  item: { id, name, imageUrl: art(hue) },
  pricing: extra.pricing ?? { regularPrice: 450, salePrice: 300, savings: 150, discountPercent: 33 },
  business
});

export default function FlashBlocks({ Block, Contrast, paneRef, theme }) {
  const ends = useMemo(() => states.map(([name, ms]) => [name, new Date(Date.now() + ms).toISOString()]), []);
  const cards = useMemo(
    () => [
      makeEntry("s1", "Skin fade and beard trim with hot towel finish", 20, 30 * HOUR, { type: "percent", value: 35 }, { headline: "Weekend fade deal", quantityNote: "Walk-ins only" }),
      makeEntry("s2", "Monthly gym membership", 150, 40 * MINUTE, { type: "amount_off", value: 150 }),
      makeEntry("s3", "Pressure cooker 5L", 300, 3 * MINUTE, { type: "sale_price", value: 300 }, { pricing: { regularPrice: 3860, salePrice: 2900, savings: 960, discountPercent: 25 } })
    ],
    []
  );
  const list = useMemo(() => [...flashPairs, ...sparkPairs[theme]], [theme]);
  const share = useMemo(() => [new Date(Date.now() - 6 * HOUR).toISOString(), new Date(Date.now() + 6 * HOUR).toISOString()], []);

  return (
    <>
      <Block title="Flash countdown states">
        <div className={styles.stack}>
          {ends.map(([name, endsAt]) => (
            <div key={name} className={styles.state}>
              <p className={styles.label}>{name}</p>
              <div className={styles.band}>
                <CountdownTiles endsAt={endsAt} variant="card" />
                <CountdownTiles endsAt={endsAt} variant="chip" />
                <CountdownTiles endsAt={endsAt} variant="inline" />
              </div>
              <div className={styles.band}>
                <CountdownTiles endsAt={endsAt} variant="banner" />
              </div>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Fuse bar and starburst">
        <div className={styles.stack}>
          <FuseBar startsAt={share[0]} endsAt={share[1]} animate />
          <div className={styles.row}>
            <Starburst discount={{ type: "percent", value: 35 }} />
            <Starburst discount={{ type: "amount_off", value: 150 }} />
            <Starburst discount={{ type: "sale_price", value: 15 }} />
          </div>
        </div>
      </Block>

      <Block title="Flash chips">
        <div className={styles.row}>
          <FlashChip endsAt={ends[1][1]} />
          <FlashChip endsAt={ends[3][1]} />
          <PromoChip promo={{ flash: 2, offers: 1 }} />
          <PromoChip promo={{ flash: 0, offers: 2 }} />
        </div>
      </Block>

      <Block title="Flash sale cards">
        <div className={styles.cards}>
          {cards.map((entry) => (
            <div key={entry.sale.id} className={styles.cell}>
              <FlashSaleCard entry={entry} />
            </div>
          ))}
          <div className={styles.compact}>
            <FlashSaleCard entry={cards[0]} size="compact" />
          </div>
        </div>
      </Block>

      <Block title="Flash and offer contrast">
        <Contrast paneRef={paneRef} list={list} />
      </Block>
    </>
  );
}
