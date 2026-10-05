import { describe, it, expect } from 'vitest';
import { sniff, pdfIsSafe, inspectFile, prepareFile, FILE_ERRORS } from './fileSecurity';

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const file = (bytes, name, type = '') => new File([new Uint8Array(bytes)], name, { type });
const pdfWith = (s) => [...PDF, ...new TextEncoder().encode(s)];

describe('sniff', () => {
  it('detects real types by magic bytes', () => {
    expect(sniff(new Uint8Array(PDF))).toBe('pdf');
    expect(sniff(new Uint8Array(JPG))).toBe('jpg');
    expect(sniff(new Uint8Array(PNG))).toBe('png');
    expect(sniff(new Uint8Array(WEBP))).toBe('webp');
    expect(sniff(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});

describe('pdfIsSafe', () => {
  it('rejects scripted or protected PDFs', () => {
    expect(pdfIsSafe(new Uint8Array(pdfWith('1 0 obj << /Type /Page >>')))).toBe(true);
    ['/JavaScript', '/JS', '/OpenAction', '/Launch', '/Encrypt', '/EmbeddedFile', '/RichMedia', '/AA'].forEach((k) =>
      expect(pdfIsSafe(new Uint8Array(pdfWith(`<< ${k} x >>`)))).toBe(false),
    );
  });
});

describe('inspectFile', () => {
  it('accepts valid files', async () => {
    expect(await inspectFile(file(PDF, 'permit.pdf'))).toEqual({ ok: true, kind: 'pdf', mime: 'application/pdf' });
    expect(await inspectFile(file(JPG, 'id.JPEG'))).toMatchObject({ ok: true, kind: 'jpg' });
  });

  it('rejects disguised, empty, unsafe and mislabelled files', async () => {
    expect(await inspectFile(file([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'virus.pdf'))).toMatchObject({ ok: false, reason: 'wrong_type' });
    expect(await inspectFile(file([], 'a.pdf'))).toMatchObject({ ok: false, reason: 'empty' });
    expect(await inspectFile(file(pdfWith('/JavaScript'), 'a.pdf'))).toMatchObject({ ok: false, reason: 'unsafe_pdf' });
    expect(await inspectFile(file(PNG, 'a.pdf'))).toMatchObject({ ok: false, reason: 'bad_extension' });
  });

  it('enforces size limits per kind', async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(PDF);
    expect(await inspectFile(new File([big], 'big.pdf'))).toMatchObject({ ok: false, reason: 'too_large' });
  });
});

describe('prepareFile', () => {
  it('returns a PDF with the correct type and an error message for bad files', async () => {
    const ok = await prepareFile(file(PDF, 'permit.pdf'));
    expect(ok.ok).toBe(true);
    expect(ok.file.type).toBe('application/pdf');
    const bad = await prepareFile(file([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'x.png'));
    expect(bad).toMatchObject({ ok: false, reason: 'wrong_type', message: FILE_ERRORS.wrong_type });
  });
});
