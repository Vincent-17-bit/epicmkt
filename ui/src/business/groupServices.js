import { slugify } from "@epicmkt/shared";

export function groupServices(services) {
  const groups = [];
  services.forEach((svc) => {
    const id = svc.section ? slugify(svc.section) : null;
    let group = groups.find((g) => g.id === id);
    if (!group) {
      group = { id, name: svc.section ?? null, items: [] };
      groups.push(group);
    }
    group.items.push(svc);
  });
  return groups;
}

export const mapSrc = (lat, lng) => {
  const d = 0.004;
  const bbox = [lng - d, lat - d, lng + d, lat + d].join("%2C");
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
};
