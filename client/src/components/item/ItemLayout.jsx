import { ItemView } from "@epicmkt/ui";
import { t } from "../../i18n/index.js";
import { kesText } from "../../lib/flash.js";
import Delivery from "./Delivery.jsx";
import Flash from "./Flash.jsx";
import FlashSticky from "./FlashSticky.jsx";
import Offers from "./Offers.jsx";
import Quantity from "./Quantity.jsx";
import Recommend from "./Recommend.jsx";
import SoldFrom from "./SoldFrom.jsx";
import styles from "../ItemDetail.module.css";

// Where each slot goes. The gallery, header (brand, title, price), options (variants) and details (highlights, description,
// specs) are drawn by ItemView from @epicmkt/ui; every other slot is handed to it through the props it already has.
// A slot with nothing to show renders null, so an empty slot adds no markup.
export default function ItemLayout({ ctx }) {
  const { item, shown, activeId, selectVariant, layout, business, track, Heading, titleRef, selective } = ctx;
  return (
    <>
      <FlashSticky ctx={ctx} />
      <ItemView
        item={item}
        shown={shown}
        activeId={activeId}
        onVariant={selectVariant}
        layout={layout}
        t={t}
        category={business.category}
        attributes={business.attributes}
        onExpandSpec={(panel) => track("spec_expand", { panel })}
        Heading={Heading}
        headingRef={titleRef}
        money={kesText}
        className={styles.layout}
        flash={<Flash ctx={ctx} />}
        offers={
          <>
            <Offers key={item.id} ctx={ctx} />
            <Quantity ctx={ctx} />
            <Delivery ctx={ctx} />
          </>
        }
        seller={<SoldFrom ctx={ctx} />}
        after={selective}
      />
      <Recommend key={`similar-${item.id}`} ctx={ctx} />
    </>
  );
}
