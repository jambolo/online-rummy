import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export function makeSessionId(): string {
  return randomUUID();
}

export function signSessionId(id: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(id).digest('base64url');
  return `${id}.${sig}`;
}

// Returns the raw session ID if signature is valid, otherwise null.
export function verifySessionId(signed: string, secret: string): string | null {
  const dot = signed.lastIndexOf('.');
  if (dot < 1) return null;
  const id = signed.slice(0, dot);
  const expected = signSessionId(id, secret);
  if (signed.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(signed), Buffer.from(expected)) ? id : null;
}
