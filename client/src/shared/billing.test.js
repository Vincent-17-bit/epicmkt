import { describe, it, expect } from 'vitest';
import { formatKes, formatKesPerMonth, planLabel, planPrice, upgradeCost, priceRange, summarizePlan, getPlan } from './billing';

const cat = {
  id: 'bakery',
  name: 'Bakery',
  plans: {
    standard: { price: 500, limits: { items: 30 }, topBenefits: ['a', 'b', 'c'], badge: null },
    premium: { price: 1000, limits: { items: 100 }, topBenefits: ['d', 'e', 'f'], badge: 'Best value' },
  },
};

describe('billing helpers', () => {
  it('formats money', () => {
    expect(formatKes(1500)).toBe('KES 1,500');
    expect(formatKes(0)).toBe('Free');
    expect(formatKes(NaN)).toBe('');
    expect(formatKesPerMonth(500)).toBe('KES 500 / month');
  });

  it('reads plans and prices', () => {
    expect(planLabel('premium')).toBe('Premium');
    expect(getPlan(cat, 'standard').price).toBe(500);
    expect(planPrice(cat, 'premium')).toBe(1000);
    expect(planPrice(cat, 'gold')).toBeNull();
    expect(upgradeCost(cat)).toBe(500);
    expect(upgradeCost({ plans: {} })).toBeNull();
  });

  it('computes the price range', () => {
    expect(priceRange([cat, { plans: { standard: { price: 300 }, premium: { price: 2500 } } }])).toEqual({ min: 300, max: 2500 });
    expect(priceRange([])).toBeNull();
  });

  it('summarises a plan', () => {
    expect(summarizePlan(cat, 'premium')).toMatchObject({
      categoryId: 'bakery', label: 'Premium', price: 1000, priceText: 'KES 1,000', perMonthText: 'KES 1,000 / month', itemsLimit: 100, badge: 'Best value',
    });
    expect(summarizePlan(cat, 'gold')).toBeNull();
  });
});
