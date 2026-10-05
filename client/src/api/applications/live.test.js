import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
const uploadToSignedUrl = vi.fn();
const from = vi.fn();

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: (...a) => from(...a),
    functions: { invoke: (...a) => invoke(...a) },
    storage: { from: () => ({ uploadToSignedUrl: (...a) => uploadToSignedUrl(...a) }) },
  },
}));

const { getCatalogPricing, getLegalDocs, submitApplication } = await import('./live');

const query = (result) => {
  const q = { select: () => q, eq: () => q, order: () => q, single: () => q, then: (res) => res(result) };
  return q;
};

const item = (slot) => ({ slot, file: new File(['x'], `${slot}.jpg`, { type: 'image/jpeg' }) });

beforeEach(() => {
  invoke.mockReset();
  uploadToSignedUrl.mockReset();
  from.mockReset();
});

describe('live adapter', () => {
  it('normalises pricing rows', async () => {
    from.mockImplementation((table) =>
      table === 'categories'
        ? query({
            data: [{
              id: 'bakery', name: 'Bakery', grp: 'Food', icon: 'bread-slice', tier: 'B', template: [], extra_docs: [],
              plans: [{ plan_key: 'standard', price_kes: 500, items_limit: 30, top_benefits: ['a', 'b', 'c'], features: {}, badge: null, updated_at: 't' }],
            }],
            error: null,
          })
        : query({ data: { standard: {}, premium: {}, updated_at: 't' }, error: null }),
    );
    const r = await getCatalogPricing();
    expect(r.categories[0]).toMatchObject({ id: 'bakery', group: 'Food', plans: { standard: { price: 500, limits: { items: 30 } } } });
    expect(r.globalLimits.updated_at).toBe('t');
  });

  it('throws database errors', async () => {
    from.mockImplementation(() => query({ data: null, error: new Error('denied') }));
    await expect(getCatalogPricing()).rejects.toThrow('denied');
    await expect(getLegalDocs()).rejects.toThrow('denied');
  });

  it('runs submit, uploads, then finalize in order', async () => {
    invoke
      .mockResolvedValueOnce({
        data: { applicationId: 'a1', finalizeToken: 't1', uploads: [{ slot: 'sbp', path: 'a1/x.jpg', token: 'tok' }] },
        error: null,
      })
      .mockResolvedValueOnce({ data: { referenceNo: 'EPM-2026-ABC234' }, error: null });
    uploadToSignedUrl.mockResolvedValue({ error: null });
    const status = vi.fn();
    const r = await submitApplication({ payload: { x: 1 }, files: [item('sbp')], turnstileToken: 'ts', startedAt: 1, hp: '' }, status);
    expect(r).toEqual({ referenceNo: 'EPM-2026-ABC234' });
    expect(invoke.mock.calls[0][0]).toBe('submit-application');
    expect(invoke.mock.calls[0][1].body.files).toEqual([{ slot: 'sbp', name: 'sbp.jpg', mime: 'image/jpeg', size: 1 }]);
    expect(uploadToSignedUrl).toHaveBeenCalledWith('a1/x.jpg', 'tok', expect.any(File), { contentType: 'image/jpeg' });
    expect(invoke.mock.calls[1]).toEqual(['finalize-application', { body: { applicationId: 'a1', finalizeToken: 't1' } }]);
    expect(status.mock.calls).toEqual([['sbp', 'uploading'], ['sbp', 'done']]);
  });

  it('surfaces the server error code', async () => {
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: { json: async () => ({ error: 'rate_limited' }) } },
    });
    await expect(submitApplication({ payload: {}, files: [], turnstileToken: '', startedAt: 1, hp: '' })).rejects.toMatchObject({
      message: 'rate_limited',
      details: { error: 'rate_limited' },
    });
  });

  it('marks a failed upload and stops before finalize', async () => {
    invoke.mockResolvedValueOnce({
      data: { applicationId: 'a1', finalizeToken: 't1', uploads: [{ slot: 'sbp', path: 'p', token: 't' }] },
      error: null,
    });
    uploadToSignedUrl.mockResolvedValue({ error: new Error('network') });
    const status = vi.fn();
    await expect(submitApplication({ payload: {}, files: [item('sbp')], turnstileToken: '', startedAt: 1, hp: '' }, status)).rejects.toThrow('network');
    expect(status).toHaveBeenLastCalledWith('sbp', 'failed');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});
