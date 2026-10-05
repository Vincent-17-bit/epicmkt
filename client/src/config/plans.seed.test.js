import { describe, it, expect } from 'vitest';
import { categories } from '../data/categories';
import { TIER_PLANS, GLOBAL_LIMITS, planRows } from './plans.seed';

describe('plan seed data', () => {
  it('builds a standard and premium row for every category', () => {
    categories.forEach((c) => {
      const rows = planRows(c.id, c.tier);
      expect(rows.map((r) => r.plan_key)).toEqual(['standard', 'premium']);
      rows.forEach((r) => {
        expect(r.category_id).toBe(c.id);
        expect(r.price_kes).toBeGreaterThanOrEqual(0);
        expect(r.price_kes).toBeLessThanOrEqual(100000);
        expect(r.top_benefits).toHaveLength(3);
        expect([null, 'Best value', 'Popular']).toContain(r.badge);
      });
    });
  });

  it('prices premium above standard in every tier', () => {
    Object.values(TIER_PLANS).forEach((t) => {
      expect(t.premium.price).toBeGreaterThan(t.standard.price);
      expect(t.premium.items).toBeGreaterThan(t.standard.items);
    });
  });

  it('matches the specified prices and item limits', () => {
    expect(TIER_PLANS.A).toEqual({ standard: { price: 300, items: 15 }, premium: { price: 800, items: 40 } });
    expect(TIER_PLANS.B).toEqual({ standard: { price: 500, items: 25 }, premium: { price: 1300, items: 70 } });
    expect(TIER_PLANS.C).toEqual({ standard: { price: 800, items: 40 }, premium: { price: 2000, items: 100 } });
    expect(TIER_PLANS.D).toEqual({ standard: { price: 1200, items: 50 }, premium: { price: 3000, items: 150 } });
  });

  it('gives every category its own short benefits and grouped features', () => {
    const seen = new Set();
    categories.forEach((c) => {
      planRows(c.id, c.tier).forEach((r) => {
        r.top_benefits.forEach((b) => expect(b.length, `${c.id} ${b}`).toBeLessThanOrEqual(60));
        expect(Object.keys(r.features)).toEqual(['Visibility', 'Catalog', 'Promotions', 'Tools', 'Support']);
        expect(Object.values(r.features).flat().join(' ')).not.toMatch(/[{}]/);
        seen.add(r.top_benefits.join('|'));
      });
    });
    expect(seen.size).toBe(64);
  });

  it('keeps global limits consistent with the premium benefit text', () => {
    expect(GLOBAL_LIMITS.premium.flashSalesPerMonth).toBe(10);
    expect(GLOBAL_LIMITS.premium.activeOffers).toBeNull();
  });
});
