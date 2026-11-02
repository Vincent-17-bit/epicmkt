import { describe, it, expect } from 'vitest';
import * as icons from '@fortawesome/free-solid-svg-icons';
import { categories, FIELD_TYPES } from './categories';

const iconExport = (name) => 'fa' + name.split('-').map((p) => p[0].toUpperCase() + p.slice(1)).join('');

describe('categories', () => {
  it('has 36 unique, well-formed ids', () => {
    expect(categories).toHaveLength(36);
    expect(new Set(categories.map((c) => c.id)).size).toBe(36);
    categories.forEach((c) => expect(c.id).toMatch(/^[a-z0-9-]{2,50}$/));
  });

  it('uses valid tiers, groups and Font Awesome solid icons', () => {
    categories.forEach((c) => {
      expect(['A', 'B', 'C', 'D']).toContain(c.tier);
      expect(c.group).toBeTruthy();
      expect(icons[iconExport(c.icon)], `${c.id} icon ${c.icon}`).toBeDefined();
    });
  });

  it('defines valid key fields', () => {
    categories.forEach((c) => {
      expect(c.keyFields.length).toBeGreaterThan(0);
      const keys = c.keyFields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      c.keyFields.forEach((f) => {
        expect(FIELD_TYPES).toContain(f.type);
        expect(f.label).toBeTruthy();
        if (f.type === 'select' || f.type === 'multiselect') expect(f.options.length).toBeGreaterThan(1);
        if (f.showIf) expect(keys).toContain(f.showIf.field);
      });
    });
  });

  it('defines valid extra documents', () => {
    categories.forEach((c) => {
      const keys = c.extraDocs.map((d) => d.key);
      expect(new Set(keys).size).toBe(keys.length);
      c.extraDocs.forEach((d) => {
        expect(d.key).toMatch(/^[a-z0-9_]+$/);
        expect(['required', 'conditional', 'optional']).toContain(d.rule);
        expect(d.label && d.why).toBeTruthy();
        if (d.rule === 'conditional') expect(d.condition).toBeTruthy();
        else expect(d.condition).toBeUndefined();
      });
    });
  });

  it('matches the specified document rules', () => {
    const docs = (id) => categories.find((c) => c.id === id).extraDocs.map((d) => `${d.key}:${d.rule}`);
    expect(docs('chemist')).toEqual(['ppb_premises_licence:required', 'pharmacist_registration:required']);
    expect(docs('agrovet')).toEqual(['pcpb_licence:conditional', 'kvb_registration:conditional']);
    expect(docs('water-refill')).toEqual(['public_health_cert:required', 'kebs_mark:conditional']);
    expect(docs('supermarket-minimart')).toEqual([]);
    expect(docs('mpesa-airtime-agent')).toEqual(['agent_authorisation:required']);
  });
  it('adds Phones, Electronics, Fashion and Home categories with full details', () => {
    const by = (id) => categories.find((c) => c.id === id);
    const expected = {
      'phones-accessories': 'Phones and Accessories',
      'electronics-computers': 'Electronics and Computers',
      'fashion-boutiques': 'Fashion and Boutiques',
      'home-kitchen': 'Home and Kitchen',
    };
    Object.entries(expected).forEach(([id, name]) => {
      const c = by(id);
      expect(c, id).toBeDefined();
      expect(c.name).toBe(name);
      expect(c.keyFields.some((f) => f.required), `${id} has a required field`).toBe(true);
      expect(c.keyFields.some((f) => f.showOnCard), `${id} shows a field on the card`).toBe(true);
      expect(c.keyFields.some((f) => f.filterable), `${id} has a filter`).toBe(true);
      expect(c.keyFields.some((f) => f.key === 'delivery')).toBe(true);
    });
    // Footwear lives in Fashion and Boutiques, separate from tailors
    expect(by('fashion-boutiques').keyFields.map((f) => f.key)).toEqual(expect.arrayContaining(['footwear', 'footwearTypes']));
  });

  it('leaves Tailor and boutique exactly as it was', () => {
    const t = categories.find((c) => c.id === 'tailor-boutique');
    expect(t.name).toBe('Tailor and boutique');
    expect(t.keyFields.map((f) => f.key)).toEqual(['tailoring', 'alterations', 'readyMade', 'turnaround']);
  });
});
