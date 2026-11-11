// Contract v1: product types, options and the item payloads that Lanes B (client) and C (seller) build against.
//
// This file holds the JSDoc typedefs and the small constants the validators share. It has no runtime behaviour; the rules live in
// validators.js and the data in productTypes.js and fixtures/. Every change to this contract is logged in docs/contracts/CHANGES.md.
//
// Contract v1 EXTENDS what already ships; it does not replace it:
//   - option axes, option variants, the availability matrix and the size chart keep the exact shape of publicOptions()
//     (shared/src/seller/options.js), so the payload items.getDetail returns today still validates;
//   - priceType stays one of ITEM_PRICE_TYPES (fixed | from | range | free | contact). No new price type: a price per kg is
//     { priceType: "fixed", unit: "kg" } and a tiered price is { priceType: "from", priceTiers: [...] };
//   - an item with productType null and no options is the legacy item and must look and behave exactly as before.

export const CONTRACT_VERSION = 1;

/** Product groups: what "related" means for typed items (same group, different item). */
export const PRODUCT_GROUPS = ["electronics", "lighting", "furniture", "food-drink", "fashion", "jewellery", "beauty", "services"];

/** Units a Dimensions value may use. */
export const DIMENSION_UNITS = ["mm", "cm", "m", "in"];

/** Extra fields a single option (variant) may carry, beyond price/status/sku: a product type lists the ones its form shows. */
export const VARIANT_FIELDS = ["dimensions", "weightGrams", "priceTiers"];

/** Extra fields an item itself may carry. */
export const ITEM_FIELDS = ["dimensions", "priceTiers", "quantity"];

/**
 * @typedef {"mm"|"cm"|"m"|"in"} DimensionUnit
 *
 * @typedef {object} Dimensions  Size of one option (or of the whole item). All three are positive numbers in `unit`.
 * @property {number} length
 * @property {number} width
 * @property {number} height
 * @property {DimensionUnit} unit
 *
 * @typedef {object} PriceTier  One step of a quantity price. Tiers cover 1..infinity with no gap and no overlap.
 * @property {number} minQty     whole number, 1 for the first tier, previous maxQty + 1 after that
 * @property {number|null} maxQty  whole number >= minQty, null only on the last tier ("200 and more")
 * @property {number} unitPrice  KES per unit at this quantity, 0 or more
 *
 * @typedef {object} Quantity  How an item sold by weight or length is ordered (a butcher's kilos).
 * @property {number} min    smallest order, > 0
 * @property {number} step   increment, > 0
 * @property {string} unit   "kg", "m", ...
 *
 * @typedef {object} OptionValue
 * @property {string} id       slug, unique within its axis
 * @property {string} label
 * @property {string} [color]  "#rrggbb", for a swatch
 * @property {string} [mediaId]
 *
 * @typedef {object} AxisDependency  This axis's values depend on another axis (SanDisk: Capacity depends on Style).
 *   A hint for pickers; the availability matrix stays the truth for what can be bought.
 * @property {string} axis                            key of the axis it depends on (listed before this one)
 * @property {Object<string,string[]>} allowed        value id of that axis -> value ids of this axis that exist with it
 *
 * @typedef {object} OptionAxis  One row of `options` on an item (publicOptions shape).
 * @property {string} key
 * @property {string} label
 * @property {"swatch"|"image-card"|"button"|"dropdown"|"text-card"} display
 * @property {OptionValue[]} values
 * @property {AxisDependency} [dependsOn]
 *
 * @typedef {object} OptionVariant  One purchasable combination (one entry of `optionVariants`).
 * @property {string|null} id
 * @property {string} label           "Black / 128 GB"
 * @property {Object<string,string>} choice   axis key -> value id, one entry per axis
 * @property {number|null} price
 * @property {number|null} salePrice
 * @property {"available"|"limited_stock"|"out_of_stock"|"unavailable"} status
 * @property {string|null} sku
 * @property {string[]} mediaIds
 * @property {number|null} stockLeft
 * @property {Dimensions} [dimensions]   v1: per-option size (table, sofa)
 * @property {number} [weightGrams]      v1: per-option weight (gold necklace)
 * @property {PriceTier[]} [priceTiers]  v1: this option's own tiers; absent means the item's tiers apply
 *
 * @typedef {object} AxisTemplate  An axis a product type asks the seller for. Becomes an OptionAxis on an item.
 * @property {string} key
 * @property {string} label
 * @property {"swatch"|"image-card"|"button"|"dropdown"|"text-card"} display
 * @property {string} [dependsOn]          key of another axis of the same type
 * @property {{id: string, label: string}[]} [suggested]  values offered as one-tap suggestions in the seller form
 *
 * @typedef {object} ProductType  One row of seller_product_types.
 * @property {string} id            slug, stable forever
 * @property {string} name
 * @property {string} group         one of PRODUCT_GROUPS
 * @property {string} priceType     default price type for new items of this type (one of ITEM_PRICE_TYPES)
 * @property {string|null} unit     default unit ("kg", "page") or null
 * @property {AxisTemplate[]} axes  0 to 3 axes, in the order a picker shows them
 * @property {string[]} variantFields  subset of VARIANT_FIELDS shown per option
 * @property {string[]} itemFields     subset of ITEM_FIELDS shown on the item
 * @property {SpecRowDef[]} [specRows]  spec rows the seller form asks for; at most 4 required. Absent: the generic goods template applies
 *
 * @typedef {object} SpecRowDef  One spec row of a product type. A value is the item's `specs` entry with the same label.
 * @property {string} key
 * @property {string} label
 * @property {"required"|"recommended"|"optional"} level
 * @property {"text"|"number"|"choice"|"openValue"|"boolean"|"dimension"} input
 * @property {string[]} [choices]   for a choice row
 * @property {object} [requiredIf]  evaluated by Prompt 5.3
 * @property {object} [showIf]      evaluated by Prompt 5.3
 *
 * @typedef {object} SellerCard  The shop block on an item (same as the card the mock API builds today).
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} categoryId
 * @property {string} townSlug
 * @property {string|null} logo
 * @property {boolean} verified
 * @property {string} townName
 * @property {number} lat
 * @property {number} lng
 * @property {string} phone
 * @property {string} whatsapp
 * @property {boolean} isOpen
 * @property {string} statusLine
 * @property {number|null} distanceKm
 *
 * @typedef {object} ItemPricing  What items.getDetail / getList put in `pricing` (no sale on a fixture).
 * @property {number} regularPrice
 * @property {number} salePrice
 * @property {number} savings
 * @property {number} discountPercent
 * @property {string|null} unit
 * @property {string} priceType
 * @property {object[]} variants       the LEGACY variants' prices; [] for an item that uses options
 *
 * @typedef {object} ItemDetail  The payload of items.getDetail. Everything shipping today, plus the v1 fields marked (v1).
 * @property {string} id
 * @property {string} businessId
 * @property {string} businessSlug
 * @property {string} name
 * @property {string} description
 * @property {string} shortDescription
 * @property {string|null} brand
 * @property {Array<string|{title?: string, text: string}>} highlights
 * @property {string[]} includes
 * @property {string} terms
 * @property {string|null} duration
 * @property {string|null} term
 * @property {string|null} packSize
 * @property {string} imageUrl
 * @property {{id: string, url: string, caption: string}[]} images
 * @property {object[]} videos
 * @property {object[]} media
 * @property {number|null} regularPrice   the "from" price when options differ in price
 * @property {string} priceType
 * @property {string|null} unit
 * @property {"listed"} status
 * @property {string|null} unlistReason
 * @property {string} kind                "product" | "service"
 * @property {string|null} section
 * @property {string} availability
 * @property {number|null} stockLeft
 * @property {object[]} variants          LEGACY list; [] when the item uses options
 * @property {{label: string, value: string, group?: string}[]} specs
 * @property {string} createdAt           ISO 8601
 * @property {string|null} productType    (v1) a ProductType id, or null: the legacy item
 * @property {PriceTier[]|null} priceTiers (v1) item-level tiers, or null
 * @property {Quantity|null} quantity      (v1) how an item sold by weight is ordered, or null
 * @property {Dimensions|null} dimensions  (v1) item-level size, or null
 * @property {OptionAxis[]} options
 * @property {OptionVariant[]} optionVariants
 * @property {object} optionAvailability   { axes, missing, cells, values } (buildAvailability shape)
 * @property {object|null} sizeChart
 * @property {SellerCard} business
 * @property {ItemPricing|null} pricing
 * @property {object|null} flash
 * @property {object[]} offers
 *
 * @typedef {object} ItemListCard  One row of items.getList / items.getRelated: the lean item (no option payload) plus v1 type fields.
 *   Same fields as ItemDetail without options, optionVariants, optionAvailability, sizeChart and offers, plus `offer`.
 * @property {string|null} productType
 * @property {PriceTier[]|null} priceTiers
 * @property {object|null} offer
 */

export {};
