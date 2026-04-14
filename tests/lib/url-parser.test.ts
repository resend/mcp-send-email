import { describe, expect, it } from 'vitest';
import { extractIdFromUrl } from '../../src/lib/url-parser.js';

describe('extractIdFromUrl', () => {
  it('returns raw ID unchanged', () => {
    expect(extractIdFromUrl('abc-123')).toBe('abc-123');
  });

  it('extracts broadcast ID from URL', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/broadcasts/abc-123',
        'broadcasts',
      ),
    ).toBe('abc-123');
  });

  it('extracts template ID from URL', () => {
    expect(
      extractIdFromUrl(
        'https://resend.com/templates/tmpl_456',
        'templates',
      ),
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

  it('returns input as-is for mismatched resource type', () => {
    const url = 'https://resend.com/templates/tmpl_456';
    expect(extractIdFromUrl(url, 'broadcasts')).toBe(url);
  });

  it('returns input as-is for non-resend URLs', () => {
    const url = 'https://example.com/broadcasts/abc-123';
    expect(extractIdFromUrl(url, 'broadcasts')).toBe(url);
  });

  it('returns input as-is for URLs with insufficient path segments', () => {
    const url = 'https://resend.com/broadcasts';
    expect(extractIdFromUrl(url, 'broadcasts')).toBe(url);
  });

  it('extracts ID without expectedResource filter', () => {
    expect(
      extractIdFromUrl('https://resend.com/broadcasts/abc-123'),
    ).toBe('abc-123');
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
      extractIdFromUrl(
        'https://resend.com/broadcasts/abc-123/',
        'broadcasts',
      ),
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
