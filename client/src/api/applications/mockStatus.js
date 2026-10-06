import { categories } from '../../data/categories';
import { applicationSchema, normalizePhone } from '../../shared/validators';
import { docSlot, getPath, isDocPath, isEditablePath, setPath } from '../../shared/statusPaths';
import { findApplication, loadFile, readJson, saveFiles, updateApplication, writeJson, listApplications, saveApplication } from './mockStore';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const OTP_KEY = 'epicmkt.mock.otp';
const LOG_KEY = 'epicmkt.mock.otplog';
const SESSION_KEY = 'epicmkt.mock.sessions';
const DEV_CODE = '123456';
const MAX_ATTEMPTS = 5;
const SESSION_MS = 30 * 60_000;
const OTP_MS = 10 * 60_000;

const apiError = (code, details) => Object.assign(new Error(code), { details: { error: code, ...details } });
const REF = /^EPM-\d{4}-[A-Z0-9]{6}$/;
const PLAN_NAME = { standard: 'Standard', premium: 'Premium' };
const PUBLIC_EVENTS = ['submitted', 'under_review', 'changes_requested', 'approved', 'payment_submitted', 'activated', 'rejected'];

const pushEvent = (rec, type) => {
  rec.events = [...(rec.events ?? []), { type, at: new Date().toISOString() }];
};

const normRef = (v) => String(v ?? '').trim().toUpperCase();
const keyOf = (ref, phone) => `${ref}:${phone}`;

export async function requestStatusOtp({ referenceNo, phone }) {
  await wait(300);
  const generic = { ok: true, message: 'If these details match an application, we have sent a code.' };
  const ref = normRef(referenceNo);
  const norm = normalizePhone(String(phone ?? ''));
  if (!REF.test(ref) || !norm) return generic;

  const key = keyOf(ref, norm);
  const log = readJson(LOG_KEY, {});
  const now = Date.now();
  const recent = (log[key] ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length && now - recent[recent.length - 1] < 60_000) throw apiError('rate_limited', { retryAfter: 60 });
  if (recent.length >= 5) throw apiError('rate_limited', { retryAfter: 3600 });
  writeJson(LOG_KEY, { ...log, [key]: [...recent, now] });

  const rec = findApplication(ref);
  if (rec && rec.payload.phone === norm) {
    writeJson(OTP_KEY, { ...readJson(OTP_KEY, {}), [key]: { code: DEV_CODE, expiresAt: now + OTP_MS, attempts: 0 } });
  }
  return generic;
}

export async function verifyStatusOtp({ referenceNo, phone, code }) {
  await wait(300);
  const ref = normRef(referenceNo);
  const norm = normalizePhone(String(phone ?? ''));
  if (!REF.test(ref) || !norm || !/^\d{6}$/.test(String(code ?? '').trim())) throw apiError('invalid_code');

  const key = keyOf(ref, norm);
  const all = readJson(OTP_KEY, {});
  const otp = all[key];
  if (!otp || otp.expiresAt <= Date.now()) throw apiError('invalid_code');
  if (otp.attempts >= MAX_ATTEMPTS) throw apiError('too_many_attempts');

  otp.attempts += 1;
  if (String(code).trim() !== otp.code) {
    writeJson(OTP_KEY, { ...all, [key]: otp });
    throw apiError('invalid_code', { attemptsLeft: MAX_ATTEMPTS - otp.attempts });
  }
  const { [key]: _used, ...rest } = all;
  writeJson(OTP_KEY, rest);

  const token = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();
  writeJson(SESSION_KEY, { ...readJson(SESSION_KEY, {}), [token]: { ref, expiresAt } });
  return { token, expiresAt };
}

function sessionRecord(session) {
  const s = readJson(SESSION_KEY, {})[session?.token];
  if (!s || new Date(s.expiresAt).getTime() <= Date.now()) throw apiError('session_expired');
  const rec = findApplication(s.ref);
  if (!rec) throw apiError('session_expired');
  return rec;
}

const flagView = (f) => ({
  id: f.id,
  path: f.path,
  message: f.message,
  severity: f.severity ?? 'must_fix',
  status: f.status,
  addressed: !!f.addressedAt,
  createdAt: f.createdAt,
  ...(f.resolvedAt ? { resolvedAt: f.resolvedAt } : {})
});

async function view(rec) {
  const p = rec.payload;
  const cat = categories.find((c) => c.id === p.categoryId);
  const documents = await Promise.all(
    (rec.documents ?? []).map(async (d) => {
      const blob = await loadFile(rec.referenceNo, d.slot);
      return { ...d, url: blob ? URL.createObjectURL(blob) : null };
    })
  );
  const showPay = rec.status === 'approved' || rec.status === 'payment_confirming';
  return {
    referenceNo: rec.referenceNo,
    status: rec.status,
    submittedAt: rec.createdAt,
    updatedAt: rec.updatedAt ?? rec.createdAt,
    category: { id: p.categoryId, name: cat?.name ?? p.categoryId },
    plan: { key: p.planKey, name: PLAN_NAME[p.planKey] },
    priceAtSubmission: rec.priceAtSubmission,
    owner: p.owner,
    phone: p.phone,
    altPhone: p.altPhone,
    email: p.email,
    business: p.business,
    templateValues: p.templateValues ?? {},
    conditionalDocs: p.conditionalDocs ?? {},
    location: p.location,
    contacts: p.contacts,
    documents,
    adminNote: rec.adminNote ?? null,
    rejectionReason: rec.status === 'rejected' ? rec.rejectionReason ?? null : null,
    flags: (rec.flags ?? []).map(flagView),
    events: (rec.events ?? []).filter((e) => PUBLIC_EVENTS.includes(e.type)),
    payment: showPay
      ? { method: 'till', number: '123456', account: null, name: 'EpicMKT (demo)', amount: rec.priceAtSubmission, code: rec.paymentCode ?? null }
      : null
  };
}

export async function getApplication(session) {
  await wait(200);
  return view(sessionRecord(session));
}

export async function saveCorrections(session, patch = {}, files = []) {
  await wait(300);
  const rec = sessionRecord(session);
  if (rec.status !== 'changes_requested') throw apiError('not_editable');
  const open = new Set((rec.flags ?? []).filter((f) => f.status === 'open').map((f) => f.path));

  for (const path of Object.keys(patch)) {
    if (!open.has(path) || !isEditablePath(path)) throw apiError('path_not_flagged', { path });
  }
  for (const { slot } of files) {
    if (!open.has(`documents.${slot}`)) throw apiError('invalid_file', { slot });
  }

  const paths = Object.keys(patch);
  let nextPayload = rec.payload;
  if (paths.length) {
    const draft = structuredClone(rec.payload);
    for (const [path, value] of Object.entries(patch)) setPath(draft, path, value);
    const parsed = applicationSchema.safeParse(draft);
    const issues = parsed.success
      ? []
      : parsed.error.issues
          .map((i) => ({ path: i.path.join('.'), message: i.message }))
          .filter((i) => paths.some((p) => i.path === p || i.path.startsWith(`${p}.`) || p.startsWith(`${i.path}.`)));
    if (issues.length || !parsed.success) throw apiError('invalid', { issues });
    nextPayload = parsed.data;
  }

  if (files.length) await saveFiles(rec.referenceNo, files);
  const addressed = [...paths, ...files.map((f) => `documents.${f.slot}`)];
  updateApplication(rec.referenceNo, (r) => {
    r.payload = nextPayload;
    r.flags = (r.flags ?? []).map((f) => (f.status === 'open' && addressed.includes(f.path) ? { ...f, addressedAt: new Date().toISOString() } : f));
    for (const { slot, file } of files) {
      const doc = { slot, name: file.name, mime: file.type, size: file.size };
      r.documents = [...(r.documents ?? []).filter((d) => d.slot !== slot), doc];
    }
    return r;
  });
  return { ok: true };
}

export async function resubmitApplication(session) {
  await wait(300);
  const rec = sessionRecord(session);
  if (rec.status !== 'changes_requested') throw apiError('not_editable');
  const open = (rec.flags ?? []).filter((f) => f.status === 'open');
  if (open.some((f) => !f.addressedAt)) throw apiError('flags_open', { count: open.filter((f) => !f.addressedAt).length });
  updateApplication(rec.referenceNo, (r) => {
    r.flags = r.flags.map((f) => (f.status === 'open' ? { ...f, status: 'fixed' } : f));
    r.status = 'submitted';
    pushEvent(r, 'submitted');
    return r;
  });
  return { ok: true, status: 'submitted' };
}

export async function submitPaymentCode(session, mpesaCode) {
  await wait(300);
  const rec = sessionRecord(session);
  if (rec.status !== 'approved') throw apiError('not_editable');
  const code = String(mpesaCode ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(code)) throw apiError('invalid_code_format');
  updateApplication(rec.referenceNo, (r) => {
    r.paymentCode = code;
    r.status = 'payment_confirming';
    pushEvent(r, 'payment_submitted');
    return r;
  });
  return { ok: true, status: 'payment_confirming' };
}

export { isDocPath, docSlot, getPath };

export const simList = () => listApplications().map((a) => ({ referenceNo: a.referenceNo, status: a.status, flags: a.flags ?? [], name: a.payload.business.name }));

export function simSetStatus(ref, status, extra = {}) {
  return updateApplication(ref, (r) => {
    r.status = status;
    if (extra.note !== undefined) r.adminNote = extra.note;
    if (extra.reason !== undefined) r.rejectionReason = extra.reason;
    if (status === 'payment_confirming') r.paymentConfirmed = !!extra.paymentConfirmed;
    pushEvent(r, status);
    return r;
  });
}

export const simNote = (ref, note) => updateApplication(ref, { adminNote: note });

export function simFlag(ref, path, message) {
  return updateApplication(ref, (r) => {
    r.flags = [
      ...(r.flags ?? []),
      { id: crypto.randomUUID(), path, message, severity: 'must_fix', status: 'open', createdAt: new Date().toISOString() }
    ];
    return r;
  });
}

export const simConfirmFlag = (ref, id) =>
  updateApplication(ref, (r) => {
    r.flags = r.flags.map((f) => (f.id === id ? { ...f, status: 'confirmed', resolvedAt: new Date().toISOString() } : f));
    return r;
  });

export const simClear = () => {
  writeJson('epicmkt.mock.applications', listApplications().filter((a) => !a.demo));
};

const demoPayload = (name, extra = {}) =>
  applicationSchema.parse({
    categoryId: 'bakery',
    planKey: 'standard',
    owner: { fullName: 'Jane Wanjiku', idType: 'national_id', idNumber: '12345678' },
    phone: '0712345678',
    email: 'jane@example.com',
    business: { name, registered: false, yearEstablished: 2019, sbpNumber: 'SBP-2026-0042', sbpExpiry: '2027-12-31' },
    location: { county: 'Kisumu', town: 'Maseno', address: 'Next to Maseno market gate', lat: -0.0053, lng: 34.6, ...extra.location },
    contacts: { businessPhones: ['0712345678'], whatsapp: '0712345678', socials: {} },
    templateValues: {},
    conditionalDocs: {},
    termsVersion: '1',
    privacyVersion: '1',
    agreeTerms: true,
    agreePrivacy: true,
    authorised: true
  });

const DOCS = ['owner_id_front', 'owner_id_back', 'sbp', 'signboard'].map((slot, i) => ({
  slot,
  name: `${slot}.${i % 2 ? 'jpg' : 'pdf'}`,
  mime: i % 2 ? 'image/jpeg' : 'application/pdf',
  size: 120_000 + i * 9_000
}));

export function simSeed() {
  const now = new Date().toISOString();
  const flag = (path, message, extra = {}) => ({
    id: crypto.randomUUID(), path, message, severity: 'must_fix', status: 'open', createdAt: now, ...extra
  });
  const rows = [
    ['DEMO01', 'submitted', 'Mama Njeri Bakes', {}],
    ['DEMO02', 'under_review', 'Kisumu Fresh Loaves', {}],
    [
      'DEMO03', 'changes_requested', 'Lakeview Bakery',
      {
        adminNote: 'Please fix the items below and resubmit.',
        flags: [
          flag('owner.fullName', 'Write your full names exactly as on your ID.'),
          flag('documents.sbp', 'The permit photo is blurry. Upload a clear photo or PDF.'),
          flag('location.address', 'Add a landmark customers can find.')
        ]
      }
    ],
    [
      'DEMO04', 'changes_requested', 'Sunrise Bakers',
      { flags: [flag('business.sbpNumber', 'The permit number does not match the document.', { addressedAt: now })] }
    ],
    ['DEMO05', 'approved', 'Dala Cakes', { adminNote: 'Welcome. Please pay to activate.' }],
    ['DEMO06', 'payment_confirming', 'Pwani Pastries', { paymentCode: 'QWE4RTY5UI' }],
    ['DEMO07', 'activated', 'Nyanza Breads', {}],
    ['DEMO08', 'rejected', 'Quick Cakes', { rejectionReason: 'The permit has been cancelled by the county.' }]
  ];
  const kept = listApplications().filter((a) => !a.demo);
  const demos = rows.map(([tail, status, name, extra]) => ({
    referenceNo: `EPM-2026-${tail}`,
    demo: true,
    status,
    createdAt: now,
    updatedAt: now,
    payload: demoPayload(name),
    priceAtSubmission: 500,
    planSnapshot: {},
    documents: DOCS,
    flags: [],
    events: [{ type: 'submitted', at: now }],
    ...extra
  }));
  writeJson('epicmkt.mock.applications', [...kept, ...demos]);
  return demos.map((d) => d.referenceNo);
}
