// Product search (Amazon-style results with per-kind filters). See search.js and data/facetCatalog.js.
export { searchProducts, parseSearch, writeSearch, describe as describeForSearch, kindOf, coloursOf as productColours, stem, EMPTY_SEARCH, SEARCH_SORTS, SEARCH_PAGE_SIZE, PRICE_PRESETS } from "./search.js";
export { FACETS, KINDS, KIND_BY_ID, SERVICE_CATEGORIES, COLOURS as SEARCH_COLOURS, readNumber, readers as searchReaders } from "./data/facetCatalog.js";
export { tidyTrending } from "./trending.js";
export { measureTokens, splitMeasures, canonicalMeasureKey } from "./measure.js";
export { understandQuery, placePhrases } from "./understand.js";
export { distance, closestWords } from "./fuzzy.js";
