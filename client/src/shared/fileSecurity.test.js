import { describe, it, expect, vi, afterEach } from 'vitest';
import { sniff, pdfIsSafe, inspectFile, prepareFile, checkFileCount, FILE_ERRORS } from './fileSecurity';

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

describe('blocked and extra cases', () => {
  const text = (s) => [...new TextEncoder().encode(s)];

  it('rejects SVG, HTML, archives, executables and scripts with a clear message', async () => {
    for (const [bytes, name] of [
      [text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'logo.svg'],
      [text('<!doctype html><script>alert(1)</script>'), 'page.html'],
      [[0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0], 'bundle.zip'],
      [[0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0], 'letter.docx'],
      [[0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0], 'virus.pdf'],
      [text('#!/bin/sh\nrm -rf /'), 'run.pdf'],
    ]) {
      expect(await inspectFile(file(bytes, name)), name).toMatchObject({ ok: false, reason: 'blocked_type' });
    }
    expect(FILE_ERRORS.blocked_type).toMatch(/SVG/);
  });

  it('rejects a magic-byte mismatch and an encrypted PDF', async () => {
    expect(await inspectFile(file(JPG, 'id.png'))).toMatchObject({ ok: false, reason: 'bad_extension' });
    expect(await inspectFile(file(pdfWith('<< /Encrypt 5 0 R >>'), 'a.pdf'))).toMatchObject({ ok: false, reason: 'unsafe_pdf' });
  });

  it('rejects oversized images and accepts PNG and WebP', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(JPG);
    expect(await inspectFile(new File([big], 'big.jpg'))).toMatchObject({ ok: false, reason: 'too_large' });
    expect(await inspectFile(file(PNG, 'a.png'))).toMatchObject({ ok: true, kind: 'png' });
    expect(await inspectFile(file(WEBP, 'a.webp'))).toMatchObject({ ok: true, kind: 'webp' });
  });

  it('limits the total number of files to 14', () => {
    expect(checkFileCount(14).ok).toBe(true);
    expect(checkFileCount(15)).toMatchObject({ ok: false, reason: 'too_many' });
  });

  it('gives a friendly message when HEIC cannot be decoded', async () => {
    const heic = [0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0];
    expect(await inspectFile(file(heic, 'IMG_1.HEIC'))).toMatchObject({ ok: true, kind: 'heic' });
    expect(await prepareFile(file(heic, 'IMG_1.HEIC'))).toMatchObject({ ok: false, reason: 'heic_unsupported' });
  });
});

describe('image re-encoding', () => {
  afterEach(() => vi.restoreAllMocks());

  it('outputs a fresh image with EXIF and GPS removed', async () => {
    const exif = [...new TextEncoder().encode('Exif\0\0GPSLatitude')];
    const source = file([0xff, 0xd8, 0xff, 0xe1, 0, 20, ...exif, 0xff, 0xd9], 'photo.jpg', 'image/jpeg');
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 2000, close() {} }));
    const drawn = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag !== 'canvas') return realCreate(tag);
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: (...a) => drawn.push(a) }),
        toBlob(cb, type) { cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 0xff, 0xd9])], { type })); },
      };
    });
    const out = await prepareFile(source);
    expect(out.ok).toBe(true);
    const bytes = new Uint8Array(await out.file.arrayBuffer());
    expect(new TextDecoder('latin1').decode(bytes)).not.toMatch(/Exif|GPS/);
    expect(drawn[0].slice(3)).toEqual([2000, 1000]);
    vi.unstubAllGlobals();
  });
});
