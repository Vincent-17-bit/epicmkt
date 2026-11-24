import { categories } from "../../../backend/src/data/categories.js";

export { NotFoundError, ValidationError } from "../../../backend/src/errors.js";
export { COORD_DECIMALS, coarsenCoord, coarsenCoords, looksLikeCoordinates, scrubPayload } from "../../../backend/src/privacy.js";

export const store = { categories };
export const getCategories = async () => categories.map((c) => ({ ...c, count: 0 }));
