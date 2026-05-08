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
      extractIdFromUrl('https://resend.com/domains/some-id'),
    ).toThrow(/unsupported resource type/i);
  });

  it('extracts ID without expectedResource filter', () => {
    expect(extractIdFromUrl('https://resend.com/broadcasts/abc-123')).toBe(
      'abc-123',
    );
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
