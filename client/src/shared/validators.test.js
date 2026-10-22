import { describe, it, expect } from 'vitest';
import { categories } from '../data/categories';
import { applicationSchema, normalizePhone, requiredSlots, allowedSlots, clean } from './validators';

const base = () => ({
  categoryId: 'bakery',
  planKey: 'standard',
  owner: { fullName: 'Jane Wanjiku', idType: 'national_id', idNumber: '12345678' },
  phone: '0712 345 678',
  altPhone: '',
  email: ' Jane@Example.com ',
  business: {
    name: 'Jane Bakes', registered: false, yearEstablished: 2020, sbpNumber: 'SBP-001',
    sbpExpiry: '2099-12-31', shortDescription: 'Fresh bread daily',
  },
  location: { county: 'Kisumu', town: 'Maseno', address: 'Market Road', lat: -0.0, lng: 34.6 },
  contacts: { businessPhones: ['0712345678'], whatsapp: '+254712345678', website: '', socials: {} },
  templateValues: {},
  conditionalDocs: {},
  termsVersion: 'v1',
  privacyVersion: 'v1',
  agreeTerms: true,
  agreePrivacy: true,
  authorised: true,
});

const paths = (r) => r.error.issues.map((i) => i.path.join('.'));

describe('normalizePhone', () => {
  it('accepts Kenyan and international formats and rejects the rest', () => {
    expect(normalizePhone('0712345678')).toBe('+254712345678');
    expect(normalizePhone('0112 345 678')).toBe('+254112345678');
    expect(normalizePhone('+254 712-345-678')).toBe('+254712345678');
    expect(normalizePhone('254712345678')).toBe('+254712345678');
    expect(normalizePhone('0202345678')).toBe('+254202345678');
    expect(normalizePhone('+44 7911 123456')).toBe('+447911123456');
    expect(normalizePhone('0044 7911 123456')).toBe('+447911123456');
    expect(normalizePhone('+1 (415) 555-2671')).toBe('+14155552671');
    expect(normalizePhone('12345')).toBeNull();
  });
});

describe('applicationSchema', () => {
  it('accepts a valid unregistered application and normalises it', () => {
    const r = applicationSchema.safeParse(base());
    expect(r.success).toBe(true);
    expect(r.data.phone).toBe('+254712345678');
    expect(r.data.email).toBe('jane@example.com');
    expect(r.data.altPhone).toBeUndefined();
    expect(r.data.contacts.website).toBeUndefined();
  });

  it('validates ID numbers by type', () => {
    const a = base();
    a.owner.idNumber = '123';
    expect(paths(applicationSchema.safeParse(a))).toContain('owner.idNumber');
    const b = base();
    b.owner.idType = 'passport';
    b.owner.idNumber = 'ab 123456';
    expect(applicationSchema.safeParse(b).success).toBe(true);
    b.owner.idNumber = 'A1';
    expect(paths(applicationSchema.safeParse(b))).toContain('owner.idNumber');
  });

  it('rejects an expired permit', () => {
    const a = base();
    a.business.sbpExpiry = '2020-01-01';
    expect(paths(applicationSchema.safeParse(a))).toContain('business.sbpExpiry');
  });

  it('requires registration details and a valid KRA PIN when registered', () => {
    const a = base();
    a.business.registered = true;
    expect(paths(applicationSchema.safeParse(a))).toEqual(expect.arrayContaining(['business.regType', 'business.regNumber', 'business.kraPin']));
    a.business.regType = 'sole_proprietor';
    a.business.regNumber = 'BN-123';
    a.business.kraPin = 'a123456789z';
    const ok = applicationSchema.safeParse(a);
    expect(ok.success).toBe(true);
    expect(ok.data.business.kraPin).toBe('A123456789Z');
  });

  it('checks an optional KRA PIN when not registered', () => {
    const a = base();
    a.business.kraPin = 'bad';
    expect(paths(applicationSchema.safeParse(a))).toContain('business.kraPin');
  });

  it('blocks links and emoji in names and strips tags', () => {
    const a = base();
    a.business.name = 'Visit www.spam.com';
    a.owner.fullName = 'Jane 😀 Doe';
    expect(paths(applicationSchema.safeParse(a))).toEqual(expect.arrayContaining(['business.name', 'owner.fullName']));
    expect(clean(' <b>Hi</b>   there ')).toBe('Hi there');
  });

  it('keeps coordinates inside Kenya bounds and requires consent', () => {
    const a = base();
    a.location.lat = 40;
    a.agreeTerms = false;
    expect(paths(applicationSchema.safeParse(a))).toEqual(expect.arrayContaining(['location.lat', 'agreeTerms']));
  });

  it('rejects bad phones, urls and too many business phones', () => {
    const a = base();
    a.contacts.businessPhones = ['0712345678', '0712345679', '0712345680', '0712345681'];
    a.contacts.website = 'ftp://x.com';
    expect(paths(applicationSchema.safeParse(a))).toEqual(expect.arrayContaining(['contacts.businessPhones', 'contacts.website']));
  });
});

describe('document slots', () => {
  const cat = {
    extraDocs: [
      { key: 'a', rule: 'required' },
      { key: 'b', rule: 'conditional' },
      { key: 'c', rule: 'optional' },
    ],
  };

  it('computes required slots', () => {
    expect(requiredSlots(cat, { ownerIdType: 'passport', registered: false })).toEqual(['owner_id_front', 'sbp', 'signboard', 'cat_a']);
    expect(requiredSlots(cat, { ownerIdType: 'national_id', registered: true, conditionalDocs: { b: true } })).toEqual([
      'owner_id_front', 'sbp', 'signboard', 'owner_id_back', 'br_cert', 'kra_pin_cert', 'cat_a', 'cat_b',
    ]);
  });

  it('computes allowed slots including optional documents', () => {
    expect(allowedSlots(cat)).toEqual(expect.arrayContaining(['cat_a', 'cat_b', 'cat_c', 'br_cert']));
  });

  it('also reads the database field name extra_docs', () => {
    expect(allowedSlots({ extra_docs: [{ key: 'z', rule: 'optional' }] })).toContain('cat_z');
  });
});

describe('required slots for real categories', () => {
  const cat = (id) => categories.find((c) => c.id === id);
  const base = { ownerIdType: 'passport', registered: false, conditionalDocs: {} };

  it('handles registered, unregistered and ID type', () => {
    const shop = cat('supermarket-minimart');
    expect(requiredSlots(shop, base)).toEqual(['owner_id_front', 'sbp', 'signboard']);
    expect(requiredSlots(shop, { ...base, ownerIdType: 'national_id' })).toContain('owner_id_back');
    expect(requiredSlots(shop, { ...base, registered: true })).toEqual(expect.arrayContaining(['br_cert', 'kra_pin_cert']));
    expect(requiredSlots(shop, base)).not.toContain('br_cert');
  });

  it('adds category documents', () => {
    expect(requiredSlots(cat('chemist'), base)).toEqual(expect.arrayContaining(['cat_ppb_premises_licence', 'cat_pharmacist_registration']));
    const agro = (d) => requiredSlots(cat('agrovet'), { ...base, conditionalDocs: d });
    expect(agro({})).not.toContain('cat_pcpb_licence');
    expect(agro({ pcpb_licence: true })).toContain('cat_pcpb_licence');
    expect(agro({ pcpb_licence: true })).not.toContain('cat_kvb_registration');
    expect(agro({ pcpb_licence: true, kvb_registration: true })).toEqual(expect.arrayContaining(['cat_pcpb_licence', 'cat_kvb_registration']));
  });

  it('asks for the KEBS mark only when the seller says so', () => {
    const water = (d) => requiredSlots(cat('water-refill'), { ...base, conditionalDocs: d });
    expect(water({})).toContain('cat_public_health_cert');
    expect(water({})).not.toContain('cat_kebs_mark');
    expect(water({ kebs_mark: true })).toContain('cat_kebs_mark');
  });
});

describe('Maisha Card and optional year', () => {
  it('accepts a Maisha Card number of 7 to 9 digits and rejects the rest', () => {
    for (const ok of ['1234567', '12345678', '123456789', '123 456 789']) {
      const a = base();
      a.owner.idType = 'maisha_card';
      a.owner.idNumber = ok;
      expect(applicationSchema.safeParse(a).success, ok).toBe(true);
    }
    for (const bad of ['123456', '1234567890', '12345678A', '']) {
      const a = base();
      a.owner.idType = 'maisha_card';
      a.owner.idNumber = bad;
      expect(paths(applicationSchema.safeParse(a)), bad).toContain('owner.idNumber');
    }
  });

  it('keeps National ID at 7 or 8 digits', () => {
    const a = base();
    a.owner.idNumber = '123456789';
    expect(paths(applicationSchema.safeParse(a))).toContain('owner.idNumber');
  });

  it('needs the back of a Maisha Card like a National ID, but not of a passport', () => {
    const cat = categories.find((c) => c.id === 'bakery');
    const need = (ownerIdType) => requiredSlots(cat, { ownerIdType, registered: false, conditionalDocs: {} });
    expect(need('maisha_card')).toContain('owner_id_back');
    expect(need('national_id')).toContain('owner_id_back');
    expect(need('passport')).not.toContain('owner_id_back');
  });

  it('does not require the year established', () => {
    const a = base();
    delete a.business.yearEstablished;
    expect(applicationSchema.safeParse(a).success).toBe(true);
    a.business.yearEstablished = 1850;
    expect(paths(applicationSchema.safeParse(a))).toContain('business.yearEstablished');
  });
});
