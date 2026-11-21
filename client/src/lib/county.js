import { TOWNS } from "@epicmkt/shared";

// The county of a town the shopper chose ("Maseno" -> "Kisumu"), or null when no town is chosen (or it is not in the list).
export const countyOfTown = (town) => TOWNS.find((t) => t.name === town)?.county ?? null;
