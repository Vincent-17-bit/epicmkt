import { describe, it, expect } from 'vitest';
import { phoneErrors, PHONE_HELP } from './formModel.js';

const base = { businessPhones: ['0712345678'], whatsapp: '254759217355', whatsappSame: false };

describe('phoneErrors', () => {
  it('accepts Kenyan and international numbers', () => {
    expect(phoneErrors(base)).toEqual([]);
    expect(phoneErrors({ ...base, businessPhones: ['+44 7911 123456', '0759217355'], whatsapp: '+1 415 555 2671' })).toEqual([]);
  });
  it('puts an empty first business phone on that input, not on the list', () => {
    expect(phoneErrors({ ...base, businessPhones: [''] })).toEqual([['contacts.businessPhones.0', 'Enter your business phone number']]);
    expect(phoneErrors({ ...base, businessPhones: [] })[0][0]).toBe('contacts.businessPhones.0');
  });
  it('ignores blank extra phones and flags the right index for a bad one', () => {
    expect(phoneErrors({ ...base, businessPhones: ['0712345678', ''] })).toEqual([]);
    expect(phoneErrors({ ...base, businessPhones: ['0712345678', '', '123'] })).toEqual([['contacts.businessPhones.2', PHONE_HELP]]);
  });
  it('does not blame WhatsApp when it is the same as the business phone', () => {
    expect(phoneErrors({ businessPhones: [''], whatsapp: '', whatsappSame: true }).map(([p]) => p)).toEqual(['contacts.businessPhones.0']);
    expect(phoneErrors({ businessPhones: ['0712345678'], whatsapp: '', whatsappSame: true })).toEqual([]);
  });
  it('flags a missing or bad WhatsApp number on its own input', () => {
    expect(phoneErrors({ ...base, whatsapp: '' })[0][0]).toBe('contacts.whatsapp');
    expect(phoneErrors({ ...base, whatsapp: '12345' })).toEqual([['contacts.whatsapp', PHONE_HELP]]);
  });
});
