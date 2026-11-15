// Product search (Amazon-style results with per-kind filters). See search.js and facetCatalog.js.
export { searchProducts, parseSearch, writeSearch, describe as describeForSearch, kindOf, stem, EMPTY_SEARCH, SEARCH_SORTS, SEARCH_PAGE_SIZE, PRICE_PRESETS } from "./search.js";
export { FACETS, KINDS, KIND_BY_ID, COLOURS as SEARCH_COLOURS, readNumber, readers as searchReaders } from "./facetCatalog.js";
