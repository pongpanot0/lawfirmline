import { decryptToken, encryptToken } from './token-encryption.util';

describe('token-encryption.util', () => {
  const originalEnv = process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);
  });

  afterAll(() => {
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = originalEnv;
  });

  it('round-trips a token', () => {
    const plaintext = 'super-secret-refresh-token-value';
    const encrypted = encryptToken(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptToken(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext for the same input each time (random IV)', () => {
    const a = encryptToken('same-value');
    const b = encryptToken('same-value');
    expect(a).not.toBe(b);
    expect(decryptToken(a)).toBe('same-value');
    expect(decryptToken(b)).toBe('same-value');
  });

  it('throws if the encryption key is missing or malformed', () => {
    const saved = process.env.MAILBOX_TOKEN_ENCRYPTION_KEY;
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = 'too-short';
    expect(() => encryptToken('x')).toThrow(/64-character hex/);
    process.env.MAILBOX_TOKEN_ENCRYPTION_KEY = saved;
  });

  it('fails to decrypt tampered ciphertext (auth tag check)', () => {
    const encrypted = encryptToken('value');
    const tampered = encrypted.slice(0, -4) + 'abcd';
    expect(() => decryptToken(tampered)).toThrow();
  });
});
