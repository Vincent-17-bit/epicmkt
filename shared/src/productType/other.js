// The explicit "Other" product type. It is a real row in product_types (so a saved item can carry it and the server can require a type),
// and it means "the seller said none of the types fits". Ranking therefore treats it exactly like no type at all: it is never evidence
// that two items are the same kind, and it never cancels a match that rests on the name or the section.

/** The id of the "Other" type. */
export const OTHER_TYPE_ID = "other";

/** True for the "Other" type, for no type at all, and for a blank value: none of them says what an item is. */
export const hasNoTypeEvidence = (typeId) => typeof typeId !== "string" || typeId.trim() === "" || typeId.trim().toLowerCase() === OTHER_TYPE_ID;
