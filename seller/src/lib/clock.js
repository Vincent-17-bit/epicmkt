let override = null;
export const now = () => (override ? new Date(override) : new Date());
export const setNow = (value) => { override = value; };
