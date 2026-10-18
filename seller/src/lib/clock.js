let override = null;
export const now = () => (override ? new Date(override) : new Date());
export const setNow = (value) => { override = value; };

let offset = 0;
export const serverNow = () => (override ? new Date(override).getTime() : Date.now() + offset);
export const setServerOffset = (ms) => { offset = ms; };
