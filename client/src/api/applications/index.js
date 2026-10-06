const adapter = () => (import.meta.env.VITE_SUPABASE_URL ? import('./live') : import('./mock'));

export const getCatalogPricing = async (...args) => (await adapter()).getCatalogPricing(...args);
export const getLegalDocs = async (...args) => (await adapter()).getLegalDocs(...args);
export const submitApplication = async (...args) => (await adapter()).submitApplication(...args);

export const devTools = import.meta.env.DEV && !import.meta.env.VITE_SUPABASE_URL ? () => import('./mockStore') : null;
