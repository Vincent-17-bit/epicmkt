// Demo product ids are globally unique: the shop's id plus the product's name slug,
// e.g. "b_001-fade-and-beard". Business ids never contain a hyphen, so the first hyphen
// always splits shop from product. Live products use their database UUID instead.
export const demoItemId = (businessId, localId) => `${businessId}-${localId}`;

export const splitDemoItemId = (id) => {
  const at = String(id).indexOf("-");
  return at < 0 ? { businessId: null, localId: String(id) } : { businessId: id.slice(0, at), localId: id.slice(at + 1) };
};
