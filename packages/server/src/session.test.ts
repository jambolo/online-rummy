import { describe, expect, it } from 'vitest';
import { makeSessionId, signSessionId, verifySessionId } from './session.js';

const SECRET = 'test-secret-at-least-32-chars-long!!';

describe('makeSessionId', () => {
  it('returns a UUID-shaped string', () => {
    expect(makeSessionId()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns a fresh id each call', () => {
    expect(makeSessionId()).not.toBe(makeSessionId());
  });
});

describe('signSessionId', () => {
  it('produces "id.sig" format', () => {
    const id = 'abc-123';
    const signed = signSessionId(id, SECRET);
    expect(signed.startsWith(`${id}.`)).toBe(true);
    expect(signed.lastIndexOf('.')).toBeGreaterThan(0);
  });

  it('is deterministic for the same id+secret', () => {
    expect(signSessionId('x', SECRET)).toBe(signSessionId('x', SECRET));
  });

  it('differs with a different secret', () => {
    expect(signSessionId('x', SECRET)).not.toBe(signSessionId('x', `${SECRET}-other`));
  });
});

describe('verifySessionId', () => {
  it('round-trips a freshly signed id', () => {
    const id = makeSessionId();
    expect(verifySessionId(signSessionId(id, SECRET), SECRET)).toBe(id);
  });

  it('returns null when no dot present', () => {
    expect(verifySessionId('nodothere', SECRET)).toBeNull();
  });

  it('returns null when dot is at position 0 (empty id)', () => {
    expect(verifySessionId('.sig', SECRET)).toBeNull();
  });

  it('returns null on tampered signature', () => {
    const signed = signSessionId('abc', SECRET);
    const tampered = `${signed.slice(0, -1)}${signed.endsWith('A') ? 'B' : 'A'}`;
    expect(verifySessionId(tampered, SECRET)).toBeNull();
  });

  it('returns null on length mismatch (truncated signature)', () => {
    const signed = signSessionId('abc', SECRET);
    expect(verifySessionId(signed.slice(0, -3), SECRET)).toBeNull();
  });

  it('returns null when verified with the wrong secret', () => {
    const signed = signSessionId('abc', SECRET);
    expect(verifySessionId(signed, `${SECRET}-wrong`)).toBeNull();
  });

  it('returns null when id is tampered but signature length is preserved', () => {
    const id = 'aaaaaaaa';
    const signed = signSessionId(id, SECRET);
    const swapped = `bbbbbbbb${signed.slice(id.length)}`;
    expect(verifySessionId(swapped, SECRET)).toBeNull();
  });
});
