import { supabase } from './supabaseClient';

const normalizePlan = (p) => ({
  price: p.price_kes,
  limits: { items: p.items_limit },
  topBenefits: p.top_benefits,
  features: p.features,
  badge: p.badge,
  updatedAt: p.updated_at,
});

export async function getCatalogPricing() {
  const [cats, limits] = await Promise.all([
    supabase
      .from('categories')
      .select('id,name,grp,icon,tier,sort,template,extra_docs,plans(plan_key,price_kes,items_limit,top_benefits,features,badge,updated_at)')
      .eq('active', true)
      .order('sort'),
    supabase.from('global_limits').select('standard,premium,updated_at').eq('id', 1).single(),
  ]);
  if (cats.error) throw cats.error;
  if (limits.error) throw limits.error;
  return {
    categories: cats.data.map((c) => ({
      id: c.id, name: c.name, group: c.grp, icon: c.icon, tier: c.tier,
      template: c.template, extraDocs: c.extra_docs,
      plans: Object.fromEntries(c.plans.map((p) => [p.plan_key, normalizePlan(p)])),
    })),
    globalLimits: limits.data,
  };
}

export async function getLegalDocs() {
  const { data, error } = await supabase.from('legal_docs').select('key,version,title,body,key_points');
  if (error) throw error;
  return Object.fromEntries(data.map((d) => [d.key, d]));
}

async function toApiError(error) {
  try {
    const body = await error.context.json();
    return Object.assign(new Error(body.error ?? 'request_failed'), { details: body });
  } catch {
    return error;
  }
}

export async function submitApplication({ payload, files, turnstileToken, startedAt, hp }, onFileStatus = () => {}) {
  const manifest = files.map(({ slot, file }) => ({ slot, name: file.name, mime: file.type, size: file.size }));

  const start = await supabase.functions.invoke('submit-application', {
    body: { payload, files: manifest, turnstileToken, startedAt, hp },
  });
  if (start.error) throw await toApiError(start.error);
  const { applicationId, finalizeToken, uploads } = start.data;

  for (const up of uploads) {
    const item = files.find((f) => f.slot === up.slot);
    onFileStatus(up.slot, 'uploading');
    const { error } = await supabase.storage
      .from('applications')
      .uploadToSignedUrl(up.path, up.token, item.file, { contentType: item.file.type });
    if (error) { onFileStatus(up.slot, 'failed'); throw error; }
    onFileStatus(up.slot, 'done');
  }

  const fin = await supabase.functions.invoke('finalize-application', { body: { applicationId, finalizeToken } });
  if (fin.error) throw await toApiError(fin.error);
  return { referenceNo: fin.data.referenceNo };
}

async function call(name, body) {
  const res = await supabase.functions.invoke(name, { body });
  if (res.error) throw await toApiError(res.error);
  return res.data;
}

export const requestStatusOtp = ({ referenceNo, phone }) => call('status-request-otp', { referenceNo, phone });

export const verifyStatusOtp = ({ referenceNo, phone, code }) => call('status-verify-otp', { referenceNo, phone, code });

export async function getApplication(session) {
  const data = await call('status-get', { token: session.token });
  return data.application;
}

export async function saveCorrections(session, patch, files = []) {
  const manifest = files.map(({ slot, file }) => ({ slot, name: file.name, mime: file.type, size: file.size }));
  const start = await call('status-correct', { token: session.token, patch, files: manifest });
  for (const up of start.uploads ?? []) {
    const item = files.find((f) => f.slot === up.slot);
    const { error } = await supabase.storage
      .from('applications')
      .uploadToSignedUrl(up.path, up.token, item.file, { contentType: item.file.type });
    if (error) throw error;
  }
  if (files.length) await call('status-correct', { token: session.token, confirm: files.map((f) => f.slot) });
  return { ok: true };
}

export const resubmitApplication = (session) => call('status-resubmit', { token: session.token });

export const submitPaymentCode = (session, mpesaCode) =>
  call('status-payment-code', { token: session.token, code: mpesaCode });
