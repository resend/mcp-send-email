import { describe, expect, it } from 'vitest';
import { mailboxSchema } from '../../src/lib/mailbox-schema.js';

describe('mailboxSchema', () => {
  describe('accepts bare email addresses', () => {
    it.each([
      'user@example.com',
      'first.last@example.com',
      'user+tag@sub.example.co.uk',
    ])('accepts %s', (input) => {
      expect(mailboxSchema.safeParse(input).success).toBe(true);
    });
  });

  describe('accepts RFC 5322 mailbox form', () => {
    it.each([
      'Acme <onboarding@resend.dev>',
      'Jane Doe <jane@example.com>',
      '"Jane Doe" <jane@example.com>',
      'Support Team <help@example.com>',
      '  Padded  <user@example.com>  ',
      // Display name can contain common punctuation and symbols
      "O'Brien <obrien@example.com>",
      'Team @ Acme <team@example.com>',
    ])('accepts %s', (input) => {
      expect(mailboxSchema.safeParse(input).success).toBe(true);
    });
  });

  describe('rejects malformed input', () => {
    it.each([
      '',
      'not-an-email',
      'name@',
      '@domain.com',
      'user@',
      '<@example.com>',
      // Bracketed form without a display name is unusual — reject to keep
      // downstream `From:` headers intent-aligned.
      '<user@example.com>',
      // Display name with invalid inner address.
      'Name <bad email@example.com>',
      // Missing closing bracket.
      'Name <user@example.com',
    ])('rejects %s', (input) => {
      expect(mailboxSchema.safeParse(input).success).toBe(false);
    });
  });

  it('rejects non-string values', () => {
    // @ts-expect-error testing runtime guard on non-string input
    expect(mailboxSchema.safeParse(null).success).toBe(false);
    // @ts-expect-error testing runtime guard on non-string input
    expect(mailboxSchema.safeParse(42).success).toBe(false);
  });
});
