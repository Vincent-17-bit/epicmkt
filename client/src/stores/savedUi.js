// "View list" in a toast, or any code with no router of its own, asks for the Saved drawer here. Layout (which has the router) listens and opens it.
const listeners = new Set();
export const onSavedOpenRequest = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const requestSavedOpen = () => {
  for (const fn of [...listeners]) fn();
};
