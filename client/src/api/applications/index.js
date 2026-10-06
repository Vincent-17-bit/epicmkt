const adapter = () => (import.meta.env.VITE_SUPABASE_URL ? import('./live') : import('./mock'));

export const getCatalogPricing = async (...args) => (await adapter()).getCatalogPricing(...args);
export const getLegalDocs = async (...args) => (await adapter()).getLegalDocs(...args);
export const submitApplication = async (...args) => (await adapter()).submitApplication(...args);

export const requestStatusOtp = async (...args) => (await adapter()).requestStatusOtp(...args);
export const verifyStatusOtp = async (...args) => (await adapter()).verifyStatusOtp(...args);
export const getApplication = async (...args) => (await adapter()).getApplication(...args);
export const saveCorrections = async (...args) => (await adapter()).saveCorrections(...args);
export const resubmitApplication = async (...args) => (await adapter()).resubmitApplication(...args);
export const submitPaymentCode = async (...args) => (await adapter()).submitPaymentCode(...args);

export const devTools = import.meta.env.DEV && !import.meta.env.VITE_SUPABASE_URL ? () => import('./devTools') : null;
