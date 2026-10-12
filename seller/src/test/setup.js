import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { useSettings } from "../state/settings.js";
import { useToasts } from "../state/toast.js";

afterEach(() => {
  cleanup();
  useSettings.getState().reset();
  useToasts.getState().clear();
  for (const k of ["textSize", "density", "reduceMotion"]) delete document.documentElement.dataset[k];
});

HTMLDialogElement.prototype.showModal ??= function showModal() {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close ??= function close() {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

const defaultMatchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} });
window.matchMedia = defaultMatchMedia;
globalThis.__defaultMatchMedia = defaultMatchMedia;
