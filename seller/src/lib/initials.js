// "Sunrise Bakery" -> "SB". What the round logo shows until the seller adds a picture.
export const initialsOf = (name) => (name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "E";
