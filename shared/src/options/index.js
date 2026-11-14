// Option helpers shared by the client, the seller app and the mock API. Pure functions, no dependencies on a framework.
//   generateCombinations   every combination of the axes (editor "generate variants")
//   dependentValues        the values an axis offers now, derived from the sellable combinations
//   reconcileSelection     a buyer's choice made whole and consistent (keeps a value that still exists, else the default)
//   findDefaultVariant     the seller's default variant, else the cheapest one in stock
//   formatCapacityLabel    "1024 GB" -> "1 TB"
//   choiceToParam / choiceFromParam   the choice in the URL (?v=grey.256)
//   valueStatus / axisCards   what each value of an axis shows next to the current choice
//   applyVariantSpecs      the item's spec rows with one variant's overrides applied
export * from "./combinations.js";
export * from "./defaultVariant.js";
export * from "./dependent.js";
export * from "./capacity.js";
export * from "./specs.js";
export * from "./selection.js";
export * from "./editor.js";
export * from "./customSize.js";
export * from "./priceModes.js";
export * from "./colourPhotos.js";
export * from "./sizeGuide.js";
export * from "./optionPhotos.js";
