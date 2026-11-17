import { buildInfoGroups } from "@epicmkt/shared";
import { ItemView } from "@epicmkt/ui";
import { t } from "../../i18n/index.js";
import { kesText } from "../../lib/flash.js";
import Delivery from "./Delivery.jsx";
import Details, { Specs } from "./Details.jsx";
import Flash from "./Flash.jsx";
import FlashSticky from "./FlashSticky.jsx";
import Gallery from "./Gallery.jsx";
import Header from "./Header.jsx";
import Offers from "./Offers.jsx";
import Options from "./Options.jsx";
import ProductInformation, { openProductInfo } from "./ProductInformation.jsx";
import Quantity from "./Quantity.jsx";
import Recommend, { RecommendSection } from "./Recommend.jsx";
import SoldFrom from "./SoldFrom.jsx";
import styles from "../ItemDetail.module.css";

// Where each slot goes. ItemView (from @epicmkt/ui) owns the page frame and hands each part its props: the gallery, header, options,
// details and specs slots are functions of those props, and every other slot is a node placed through the props ItemView already had.
// A slot with nothing to show renders null, so an empty slot adds no markup. The slot map is in README.md.
export default function ItemLayout({ ctx }) {
  const { item, shown, activeId, selectVariant, layout, business, track, Heading, titleRef, selective } = ctx;
  const hasInfo = buildInfoGroups(item.specs).length > 0;
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
        gallery={(slot) => <div id="item-overview"><Gallery ctx={ctx} slot={slot} /></div>}
        header={(slot) => <Header ctx={ctx} slot={slot} />}
        options={(slot) => <Options ctx={ctx} slot={slot} />}
        details={(slot) => <div id="item-details"><Details ctx={ctx} slot={hasInfo ? { ...slot, onMoreSpecs: openProductInfo, onMoreInfo: openProductInfo } : slot} /></div>}
        specs={(slot) => <div id="item-specs"><Specs key={`specs-${slot.item.id}`} ctx={ctx} slot={slot} /></div>}
        flash={<Flash ctx={ctx} />}
        offers={
          <>
            <Offers key={item.id} ctx={ctx} />
            <Quantity ctx={ctx} slot={{ item }} />
            <div id="item-delivery"><Delivery ctx={ctx} /></div>
          </>
        }
        seller={<SoldFrom ctx={ctx} />}
        after={selective}
      />
      <ProductInformation key={`info-${item.id}`} item={item} />
      <RecommendSection key={`recommend-${item.id}`} ctx={ctx} />
      <Recommend key={`similar-${item.id}`} ctx={ctx} />
    </>
  );
}
