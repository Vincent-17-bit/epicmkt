// The 14 Contract v1 fixtures. getFixtures() builds them on first use and returns the same list afterwards, so importing this file
// costs nothing. Each entry: { id, productType, detail, card } where `detail` is a full ItemDetail and `card` its ItemListCard.

import { buildDetail, toListCard } from "./build.js";
import { phone } from "./phone.js";
import { memoryCard } from "./memoryCard.js";
import { shoes } from "./shoes.js";
import { table } from "./table.js";
import { sofa } from "./sofa.js";
import { bread } from "./bread.js";
import { water } from "./water.js";
import { ledStrip } from "./ledStrip.js";
import { ledBulb } from "./ledBulb.js";
import { printing } from "./printing.js";
import { butcher } from "./butcher.js";
import { necklace } from "./necklace.js";
import { fragrance } from "./fragrance.js";
import { legacy } from "./legacy.js";

export { FIXTURE_BUSINESS_ID, fixtureBusinessCard } from "./build.js";

const SPECS = [phone, memoryCard, shoes, table, sofa, bread, water, ledStrip, ledBulb, printing, butcher, necklace, fragrance, legacy];

let cache = null;

/** @returns {{ id: string, productType: string|null, detail: import("../types.js").ItemDetail, card: import("../types.js").ItemListCard }[]} */
export function getFixtures() {
  if (!cache) {
    cache = SPECS.map((make, index) => {
      const detail = buildDetail(make(), index);
      return { id: detail.id, productType: detail.productType, detail, card: toListCard(detail) };
    });
  }
  return cache;
}

export const getFixture = (id) => getFixtures().find((f) => f.id === id) ?? null;
