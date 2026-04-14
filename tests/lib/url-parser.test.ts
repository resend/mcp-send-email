import { describe, expect, it } from 'vitest';
import { extractIdFromUrl } from '../../src/lib/url-parser.js';

describe('extractIdFromUrl', () => {
  it('returns raw ID unchanged', () => {
    expect(extractIdFromUrl('abc-123')).toBe('abc-123');
  });

  it('extracts broadcast ID from URL', () => {
    expect(
      extractIdFromUrl('https://resend.com/broadcasts/abc-123', 'broadcasts'),
    ).toBe('abc-123');
  });

  it('extracts template ID from URL', () => {
    expect(
      extractIdFromUrl('https://resend.com/templates/tmpl_456', 'templates'),
    ).toBe('tmpl_456');
  });

  it('extracts automation ID from URL', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/automations/auto-789',
        'automations',
      ),
    ).toBe('auto-789');
  });

  it('handles www.resend.com URLs', () => {
    expect(
      extractIdFromUrl(
        'https://www.resend.com/broadcasts/abc-123',
        'broadcasts',
      ),
    ).toBe('abc-123');
  });

  it('throws for mismatched resource type', () => {
    expect(() =>
      extractIdFromUrl('https://resend.com/templates/tmpl_456', 'broadcasts'),
    ).toThrow(/expected a broadcasts URL, but got a templates URL/i);
  });

  it('throws for non-resend URLs', () => {
    expect(() =>
      extractIdFromUrl('https://example.com/broadcasts/abc-123', 'broadcasts'),
    ).toThrow(/unrecognized URL host/i);
  });

  it('throws for URLs with insufficient path segments', () => {
    expect(() =>
      extractIdFromUrl('https://resend.com/broadcasts', 'broadcasts'),
    ).toThrow(/missing a resource ID/i);
  });

  it('throws for unsupported resend.com resource paths', () => {
    expect(() =>
      extractIdFromUrl('https://resend.com/settings/some-id'),
    ).toThrow(/unsupported resource type/i);
  });

  it('extracts ID without expectedResource filter', () => {
    expect(extractIdFromUrl('https://resend.com/broadcasts/abc-123')).toBe(
      'abc-123',
    );
  });

  // New simple resource types
  it('extracts domain ID from URL', () => {
    expect(
      extractIdFromUrl('https://resend.com/domains/dom-123', 'domains'),
    ).toBe('dom-123');
  });

  it('extracts API key ID from URL', () => {
    expect(
      extractIdFromUrl('https://resend.com/api-keys/key-456', 'api-keys'),
    ).toBe('key-456');
  });

  it('extracts webhook ID from URL', () => {
    expect(
      extractIdFromUrl('https://resend.com/webhooks/wh-789', 'webhooks'),
    ).toBe('wh-789');
  });

  it('extracts log ID from URL', () => {
    expect(
      extractIdFromUrl('https://resend.com/logs/log-001', 'logs'),
    ).toBe('log-001');
  });

  it('extracts email ID from URL', () => {
    expect(
      extractIdFromUrl('https://resend.com/emails/em-999', 'emails'),
    ).toBe('em-999');
  });

  // Nested resource types (audience/*)
  it('extracts contact ID from nested audience URL', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/audience/contacts/ct-123',
        'audience/contacts',
      ),
    ).toBe('ct-123');
  });

  it('extracts segment ID from nested audience URL', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/audience/segments/seg-456',
        'audience/segments',
      ),
    ).toBe('seg-456');
  });

  it('extracts topic ID from nested audience URL', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/audience/topics/top-789',
        'audience/topics',
      ),
    ).toBe('top-789');
  });

  it('handles nested URLs with trailing slash', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/audience/contacts/ct-123/',
        'audience/contacts',
      ),
    ).toBe('ct-123');
  });

  it('handles nested URLs with query parameters', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/audience/segments/seg-456?tab=details',
        'audience/segments',
      ),
    ).toBe('seg-456');
  });

  it('throws for mismatched nested resource type', () => {
    expect(() =>
      extractIdFromUrl(
        'https://resend.com/audience/contacts/ct-123',
        'audience/segments',
      ),
    ).toThrow(/expected a audience\/segments URL/i);
  });

  it('throws when expecting nested resource but getting simple resource', () => {
    expect(() =>
      extractIdFromUrl(
        'https://resend.com/domains/dom-123',
        'audience/contacts',
      ),
    ).toThrow(/expected a audience\/contacts URL/i);
  });

  it('extracts nested ID without expectedResource filter', () => {
    expect(
      extractIdFromUrl('https://resend.com/audience/contacts/ct-123'),
    ).toBe('ct-123');
  });

  it('trims whitespace from input', () => {
    expect(
      extractIdFromUrl(
        '  https://resend.com/broadcasts/abc-123  ',
        'broadcasts',
      ),
    ).toBe('abc-123');
  });

  it('handles URLs with trailing slash', () => {
    expect(
      extractIdFromUrl('https://resend.com/broadcasts/abc-123/', 'broadcasts'),
    ).toBe('abc-123');
  });

  it('handles URLs with query parameters', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/broadcasts/abc-123?tab=content',
        'broadcasts',
      ),
    ).toBe('abc-123');
  });
});
