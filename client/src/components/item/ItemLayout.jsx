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
import Quantity from "./Quantity.jsx";
import Recommend from "./Recommend.jsx";
import SoldFrom from "./SoldFrom.jsx";
import styles from "../ItemDetail.module.css";

// Where each slot goes. ItemView (from @epicmkt/ui) owns the page frame and hands each part its props: the gallery, header, options,
// details and specs slots are functions of those props, and every other slot is a node placed through the props ItemView already had.
// A slot with nothing to show renders null, so an empty slot adds no markup. The slot map is in README.md.
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
        gallery={(slot) => <Gallery ctx={ctx} slot={slot} />}
        header={(slot) => <Header ctx={ctx} slot={slot} />}
        options={(slot) => <Options ctx={ctx} slot={slot} />}
        details={(slot) => <Details ctx={ctx} slot={slot} />}
        specs={(slot) => <Specs key={`specs-${slot.item.id}`} ctx={ctx} slot={slot} />}
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
