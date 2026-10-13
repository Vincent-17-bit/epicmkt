export const HOST = "127.0.0.1";
export const PORTS = { client: 4170, seller: 4171, admin: 4172 };
export const WIDTHS = [320, 375, 768, 1280];
export const HEIGHTS = { 320: 640, 375: 812, 768: 1024, 1280: 800 };
export const TOUCH_MAX = 768;
export const MIN_TARGET = 44;
export const FIXED_TIME = "2026-03-14T09:00:00+03:00";
export const SEED = 20260314;
export const origin = (app) => `http://${HOST}:${PORTS[app]}`;
