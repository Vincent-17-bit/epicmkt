import { describe, it, expect } from 'vitest';
import { formatKes, formatKesPerMonth, planLabel, planPrice, upgradeCost, priceRange, summarizePlan, getPlan, addCalendarMonth, graceEndsAt, listingState, categoryChangeQuote } from './billing';

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

const iso = (d) => d.toISOString().slice(0, 10);

describe('calendar months', () => {
  it('adds one calendar month and clamps to month end', () => {
    expect(iso(addCalendarMonth('2026-01-31'))).toBe('2026-02-28');
    expect(iso(addCalendarMonth('2028-01-31'))).toBe('2028-02-29');
    expect(iso(addCalendarMonth('2026-01-30'))).toBe('2026-02-28');
    expect(iso(addCalendarMonth('2026-03-15'))).toBe('2026-04-15');
    expect(iso(addCalendarMonth('2026-12-31'))).toBe('2027-01-31');
  });

  it('ends grace one day after paidUntil', () => {
    expect(iso(graceEndsAt('2026-02-28'))).toBe('2026-03-01');
  });

  it('derives the listing state in Nairobi time', () => {
    expect(listingState('2026-10-05', new Date('2026-10-05T20:59:00Z'))).toBe('active');
    expect(listingState('2026-10-05', new Date('2026-10-05T21:00:00Z'))).toBe('grace');
    expect(listingState('2026-10-05', new Date('2026-10-06T20:59:00Z'))).toBe('grace');
    expect(listingState('2026-10-05', new Date('2026-10-06T21:00:00Z'))).toBe('expired');
  });
});

describe('categoryChangeQuote', () => {
  const now = new Date('2026-10-05T09:00:00Z');
  it('charges the prorated difference, rounded up, for a dearer category', () => {
    const q = categoryChangeQuote({ oldPrice: 500, newPrice: 800, paidUntil: '2026-10-20', now });
    expect(q).toEqual({ extraDueNow: Math.ceil((300 * 15) / 30), appliesFromNextRenewal: true, newMonthlyPrice: 800 });
    expect(categoryChangeQuote({ oldPrice: 500, newPrice: 501, paidUntil: '2026-10-20', now }).extraDueNow).toBe(1);
  });

  it('charges nothing now for a cheaper category', () => {
    expect(categoryChangeQuote({ oldPrice: 800, newPrice: 500, paidUntil: '2026-10-20', now })).toEqual({
      extraDueNow: 0, appliesFromNextRenewal: true, newMonthlyPrice: 500,
    });
  });
});
