import { describe, it, expect } from 'vitest';
import { categories } from './categories';
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

  it('keeps global limits consistent with the premium benefit text', () => {
    expect(GLOBAL_LIMITS.premium.flashSalesPerMonth).toBe(10);
    expect(GLOBAL_LIMITS.premium.activeOffers).toBeNull();
  });
});
