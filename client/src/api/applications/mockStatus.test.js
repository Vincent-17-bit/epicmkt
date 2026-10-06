import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  requestStatusOtp, verifyStatusOtp, getApplication, saveCorrections, resubmitApplication, submitPaymentCode,
} from './mockStatus';
import { simSeed, simFlag, simSetStatus } from './mockStatus';
import { findApplication } from './mockStore';

const PHONE = '0712345678';
const login = async (ref) => {
  await requestStatusOtp({ referenceNo: ref, phone: PHONE });
  return verifyStatusOtp({ referenceNo: ref, phone: PHONE, code: '123456' });
};

beforeEach(() => {
  localStorage.clear();
  simSeed();
});
afterEach(() => vi.useRealTimers());

describe('status otp', () => {
  it('answers the same for matching and wrong details', async () => {
    const good = await requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE });
    const wrongPhone = await requestStatusOtp({ referenceNo: 'EPM-2026-DEMO02', phone: '0799999999' });
    const unknown = await requestStatusOtp({ referenceNo: 'EPM-2026-ZZZZZZ', phone: PHONE });
    const junk = await requestStatusOtp({ referenceNo: 'nope', phone: 'abc' });
    expect(wrongPhone).toEqual(good);
    expect(unknown).toEqual(good);
    expect(junk).toEqual(good);
    expect(good.message).toMatch(/if these details match/i);
  });

  it('gives no code and no session for wrong details', async () => {
    await requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: '0799999999' });
    await expect(verifyStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: '0799999999', code: '123456' })).rejects.toThrow('invalid_code');
  });

  it('limits wrong attempts per code', async () => {
    await requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE });
    for (let i = 0; i < 5; i++) {
      await expect(verifyStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE, code: '000000' })).rejects.toThrow('invalid_code');
    }
    await expect(verifyStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE, code: '123456' })).rejects.toThrow('too_many_attempts');
  });

  it('blocks a resend inside 60 seconds and more than 5 per hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T08:00:00Z'));
    await requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE });
    await expect(requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE })).rejects.toThrow('rate_limited');
    for (let i = 1; i < 5; i++) {
      vi.setSystemTime(new Date(`2026-10-06T08:0${i * 2}:00Z`));
      await requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE });
    }
    vi.setSystemTime(new Date('2026-10-06T08:11:00Z'));
    await expect(requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE })).rejects.toThrow('rate_limited');
  });

  it('expires a code after 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T08:00:00Z'));
    await requestStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE });
    vi.setSystemTime(new Date('2026-10-06T08:11:00Z'));
    await expect(verifyStatusOtp({ referenceNo: 'EPM-2026-DEMO01', phone: PHONE, code: '123456' })).rejects.toThrow('invalid_code');
  });
});

describe('status session', () => {
  it('returns no data without a valid token', async () => {
    await expect(getApplication({ token: 'nope' })).rejects.toThrow('session_expired');
    await expect(getApplication(undefined)).rejects.toThrow('session_expired');
    await expect(resubmitApplication({ token: 'nope' })).rejects.toThrow('session_expired');
    await expect(submitPaymentCode({ token: 'nope' }, 'ABCDE12345')).rejects.toThrow('session_expired');
  });

  it('returns the application with a valid token and expires after 30 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-06T08:00:00Z'));
    const session = await login('EPM-2026-DEMO01');
    const app = await getApplication(session);
    expect(app.referenceNo).toBe('EPM-2026-DEMO01');
    expect(app.payment).toBeNull();
    vi.setSystemTime(new Date('2026-10-06T08:31:00Z'));
    await expect(getApplication(session)).rejects.toThrow('session_expired');
  });

  it('shows payment details only when approved or confirming', async () => {
    expect((await getApplication(await login('EPM-2026-DEMO05'))).payment).toMatchObject({ method: 'till', amount: 500 });
    expect((await getApplication(await login('EPM-2026-DEMO07'))).payment).toBeNull();
  });
});

describe('corrections', () => {
  it('only accepts flagged paths and validates the value', async () => {
    const session = await login('EPM-2026-DEMO03');
    await expect(saveCorrections(session, { 'business.name': 'Other Name' })).rejects.toThrow('path_not_flagged');
    await expect(saveCorrections(session, { 'owner.fullName': '1' })).rejects.toMatchObject({ details: { error: 'invalid' } });
    await expect(saveCorrections(session, {}, [{ slot: 'signboard', file: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) }])).rejects.toThrow('invalid_file');
  });

  it('marks flags addressed, then resubmit is allowed only when all are', async () => {
    const session = await login('EPM-2026-DEMO03');
    await expect(resubmitApplication(session)).rejects.toThrow('flags_open');
    await saveCorrections(session, { 'owner.fullName': 'Jane Wanjiku Otieno', 'location.address': 'Opposite Maseno market gate' });
    await expect(resubmitApplication(session)).rejects.toThrow('flags_open');
    await saveCorrections(session, {}, [{ slot: 'sbp', file: new File(['%PDF-1.4'], 'permit.pdf', { type: 'application/pdf' }) }]);
    const view = await getApplication(session);
    expect(view.flags.every((f) => f.addressed)).toBe(true);
    expect(view.owner.fullName).toBe('Jane Wanjiku Otieno');
    expect(view.documents.find((d) => d.slot === 'sbp').name).toBe('permit.pdf');
    await expect(resubmitApplication(session)).resolves.toMatchObject({ status: 'submitted' });
    expect(findApplication('EPM-2026-DEMO03').flags.every((f) => f.status === 'fixed')).toBe(true);
  });

  it('refuses corrections when the status is not changes_requested', async () => {
    const session = await login('EPM-2026-DEMO01');
    await expect(saveCorrections(session, { 'owner.fullName': 'Jane Wanjiku' })).rejects.toThrow('not_editable');
  });

  it('reacts to a new flag added by the admin simulator', async () => {
    simFlag('EPM-2026-DEMO01', 'phone', 'Check this number');
    simSetStatus('EPM-2026-DEMO01', 'changes_requested');
    const view = await getApplication(await login('EPM-2026-DEMO01'));
    expect(view.status).toBe('changes_requested');
    expect(view.flags).toHaveLength(1);
  });
});

describe('payment code', () => {
  it('accepts a 10 character code once when approved', async () => {
    const session = await login('EPM-2026-DEMO05');
    await expect(submitPaymentCode(session, 'short')).rejects.toThrow('invalid_code_format');
    await expect(submitPaymentCode(session, 'qwe4rty5ui')).resolves.toMatchObject({ status: 'payment_confirming' });
    const view = await getApplication(session);
    expect(view.status).toBe('payment_confirming');
    expect(view.payment.code).toBe('QWE4RTY5UI');
    await expect(submitPaymentCode(session, 'QWE4RTY5UI')).rejects.toThrow('not_editable');
  });
});
