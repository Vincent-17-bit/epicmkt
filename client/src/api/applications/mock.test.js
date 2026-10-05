import { describe, it, expect, vi } from 'vitest';
import { getCatalogPricing, getLegalDocs, submitApplication } from './mock';
import { categories } from '../../data/categories';
import { legalDocs } from '../../data/legal';

const payload = () => ({
  categoryId: 'supermarket-minimart',
  planKey: 'standard',
  owner: { fullName: 'Jane Wanjiku', idType: 'passport', idNumber: 'A1234567' },
  phone: '0712345678',
  email: 'jane@example.com',
  business: { name: 'Jane Mart', registered: false, yearEstablished: 2020, sbpNumber: 'SBP-001', sbpExpiry: '2099-12-31' },
  location: { county: 'Kisumu', town: 'Maseno', address: 'Market Road', lat: 0, lng: 34.6 },
  contacts: { businessPhones: ['0712345678'], whatsapp: '0712345678' },
  termsVersion: legalDocs[0].version,
  privacyVersion: legalDocs[1].version,
  agreeTerms: true,
  agreePrivacy: true,
  authorised: true,
});

const slots = ['owner_id_front', 'sbp', 'signboard'];
const files = (list) => list.map((slot) => ({ slot, file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) }));

describe('mock adapter', () => {
  it('returns pricing in the live shape for every category', async () => {
    const { categories: cats, globalLimits } = await getCatalogPricing();
    expect(cats).toHaveLength(categories.length);
    cats.forEach((c) => {
      expect(c).toMatchObject({ id: expect.any(String), group: expect.any(String), tier: expect.any(String) });
      expect(Array.isArray(c.template)).toBe(true);
      expect(Array.isArray(c.extraDocs)).toBe(true);
      ['standard', 'premium'].forEach((k) => {
        expect(c.plans[k].price).toEqual(expect.any(Number));
        expect(c.plans[k].limits.items).toEqual(expect.any(Number));
        expect(c.plans[k].topBenefits).toHaveLength(3);
      });
    });
    expect(globalLimits.standard.photosPerItem).toBe(7);
  });

  it('returns legal docs keyed like the live adapter', async () => {
    const docs = await getLegalDocs();
    expect(Object.keys(docs)).toEqual(['terms', 'privacy']);
    expect(docs.terms.key_points.length).toBeGreaterThan(0);
  });

  describe('submitApplication', () => {
    const started = () => Date.now() - 60_000;

    it('returns a reference number and reports each file', async () => {
      const status = vi.fn();
      const r = await submitApplication({ payload: payload(), files: files(slots), startedAt: started(), hp: '' }, status);
      expect(r.referenceNo).toMatch(/^EPM-\d{4}-[A-HJ-NP-Z2-9]{6}$/);
      expect(status).toHaveBeenCalledWith('sbp', 'uploading');
      expect(status).toHaveBeenCalledWith('sbp', 'done');
    });

    it('rejects too-fast, invalid and incomplete submissions', async () => {
      await expect(submitApplication({ payload: payload(), files: files(slots), startedAt: Date.now() })).rejects.toThrow('too_fast');
      const bad = payload();
      bad.phone = 'x';
      await expect(submitApplication({ payload: bad, files: files(slots), startedAt: started() })).rejects.toMatchObject({ message: 'invalid' });
      await expect(submitApplication({ payload: payload(), files: files(['sbp']), startedAt: started() })).rejects.toMatchObject({
        message: 'missing_documents',
        details: { slots: ['owner_id_front', 'signboard'] },
      });
    });

    it('fakes success for a filled honeypot', async () => {
      const r = await submitApplication({ payload: {}, files: [], startedAt: 0, hp: 'bot' });
      expect(r.referenceNo).toMatch(/^EPM-/);
    });
  });
});
