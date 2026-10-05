import { describe, it, expect } from 'vitest';
import { legalDocs, TERMS_VERSION, PRIVACY_VERSION } from './legal';

describe('legal docs', () => {
  it('has terms and privacy with versions, body and key points', () => {
    expect(legalDocs.map((d) => d.key)).toEqual(['terms', 'privacy']);
    expect(legalDocs[0].version).toBe(TERMS_VERSION);
    expect(legalDocs[1].version).toBe(PRIVACY_VERSION);
    legalDocs.forEach((d) => {
      expect(d.title).toBeTruthy();
      expect(d.body.length).toBeGreaterThan(500);
      expect(d.keyPoints.length).toBeGreaterThanOrEqual(3);
      expect(d.version.length).toBeLessThanOrEqual(40);
    });
  });
});
