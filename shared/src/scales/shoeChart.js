// Shoe conversion data as a plain table. A05 will let an admin edit it, so keep it data only (no logic).
// Each row is one whole EU size: UK, US men, US women and the foot length in cm for the same fit.
// These are common retail averages; brands differ by up to a size. Kids rows carry EU and cm only
// (UK and US kids sizes restart at 1, so they are not part of this chart yet).
export const SHOE_CHART = {
  version: 1,
  systems: ["eu", "uk", "us-m", "us-w", "cm"],
  adult: [
    { eu: 35, uk: 2.5, usM: 3.5, usW: 4.5, cm: 22.1 },
    { eu: 36, uk: 3.5, usM: 4.5, usW: 5.5, cm: 22.7 },
    { eu: 37, uk: 4, usM: 5, usW: 6, cm: 23.4 },
    { eu: 38, uk: 5, usM: 6, usW: 7, cm: 24.1 },
    { eu: 39, uk: 6, usM: 7, usW: 8, cm: 24.7 },
    { eu: 40, uk: 6.5, usM: 7.5, usW: 8.5, cm: 25.4 },
    { eu: 41, uk: 7.5, usM: 8.5, usW: 9.5, cm: 26.1 },
    { eu: 42, uk: 8, usM: 9, usW: 10, cm: 26.7 },
    { eu: 43, uk: 9, usM: 10, usW: 11, cm: 27.4 },
    { eu: 44, uk: 9.5, usM: 10.5, usW: 11.5, cm: 28.1 },
    { eu: 45, uk: 10.5, usM: 11.5, usW: 12.5, cm: 28.7 },
    { eu: 46, uk: 11, usM: 12, usW: 13, cm: 29.4 },
    { eu: 47, uk: 12, usM: 13, usW: 14, cm: 30.1 },
    { eu: 48, uk: 12.5, usM: 13.5, usW: 14.5, cm: 30.7 }
  ],
  kids: [
    { eu: 19, uk: null, usM: null, usW: null, cm: 11.4 },
    { eu: 20, uk: null, usM: null, usW: null, cm: 12.1 },
    { eu: 21, uk: null, usM: null, usW: null, cm: 12.7 },
    { eu: 22, uk: null, usM: null, usW: null, cm: 13.4 },
    { eu: 23, uk: null, usM: null, usW: null, cm: 14.1 },
    { eu: 24, uk: null, usM: null, usW: null, cm: 14.7 },
    { eu: 25, uk: null, usM: null, usW: null, cm: 15.4 },
    { eu: 26, uk: null, usM: null, usW: null, cm: 16.1 },
    { eu: 27, uk: null, usM: null, usW: null, cm: 16.7 },
    { eu: 28, uk: null, usM: null, usW: null, cm: 17.4 },
    { eu: 29, uk: null, usM: null, usW: null, cm: 18.1 },
    { eu: 30, uk: null, usM: null, usW: null, cm: 18.7 },
    { eu: 31, uk: null, usM: null, usW: null, cm: 19.4 },
    { eu: 32, uk: null, usM: null, usW: null, cm: 20.1 },
    { eu: 33, uk: null, usM: null, usW: null, cm: 20.7 },
    { eu: 34, uk: null, usM: null, usW: null, cm: 21.4 }
  ],
  widths: ["narrow", "regular", "wide", "extra-wide"]
};
