import { describe, it, expect, vi, afterEach } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('applications api entry', () => {
  it('uses the mock adapter when VITE_SUPABASE_URL is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    const api = await import('./index');
    const { categories } = await api.getCatalogPricing();
    expect(categories.length).toBe(32);
    expect(Object.keys(await api.getLegalDocs())).toEqual(['terms', 'privacy']);
  });

  it('exposes the same function names as both adapters', async () => {
    const api = await import('./index');
    const mock = await import('./mock');
    expect(Object.keys(api).sort()).toEqual(Object.keys(mock).sort());
  });
});
