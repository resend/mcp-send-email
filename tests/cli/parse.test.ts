import type { ParsedArgs } from 'minimist';
import { describe, expect, it } from 'vitest';
import { parseArgs, parseReplierAddresses } from '../../src/cli/parse.js';

describe('parseArgs', () => {
  it('parses empty argv', () => {
    const parsed = parseArgs([]);
    expect(parsed._).toEqual([]);
    expect(parsed.key).toBeUndefined();
    expect(parsed.sender).toBeUndefined();
    expect(parsed['reply-to']).toBeUndefined();
  });

  it('parses --key', () => {
    const parsed = parseArgs(['--key', 're_abc']);
    expect(parsed.key).toBe('re_abc');
  });

  it('parses --sender', () => {
    const parsed = parseArgs(['--sender', 'onboarding@resend.dev']);
    expect(parsed.sender).toBe('onboarding@resend.dev');
  });

  it('parses -h and --help', () => {
    expect(parseArgs(['-h']).help).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });

  it('parses single --reply-to', () => {
    const parsed = parseArgs(['--reply-to', 'reply@example.com']);
    expect(parsed['reply-to']).toBe('reply@example.com');
  });

  it('parses multiple --reply-to into array', () => {
    const parsed = parseArgs([
      '--reply-to',
      'a@x.com',
      '--reply-to',
      'b@x.com',
    ]);
    expect(parsed['reply-to']).toEqual(['a@x.com', 'b@x.com']);
  });

  it('parses --http as boolean', () => {
    expect(parseArgs(['--http']).http).toBe(true);
  });

  it('parses --port', () => {
    const parsed = parseArgs(['--port', '8080']);
    expect(parsed.port).toBe('8080');
  });
});

describe('parseReplierAddresses', () => {
  it('returns array from parsed reply-to array', () => {
    const parsed: ParsedArgs = { _: [], 'reply-to': ['a@x.com', 'b@x.com'] };
    expect(parseReplierAddresses(parsed, {})).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns single-element array from parsed reply-to string', () => {
    const parsed: ParsedArgs = { _: [], 'reply-to': 'one@x.com' };
    expect(parseReplierAddresses(parsed, {})).toEqual(['one@x.com']);
  });

  it('uses env REPLY_TO_EMAIL_ADDRESSES when reply-to not in argv', () => {
    const parsed: ParsedArgs = { _: [] };
    expect(
      parseReplierAddresses(parsed, {
        REPLY_TO_EMAIL_ADDRESSES: 'a@x.com,b@x.com',
      }),
    ).toEqual(['a@x.com', 'b@x.com']);
  });

  it('trims and filters empty env values', () => {
    const parsed: ParsedArgs = { _: [] };
    expect(
      parseReplierAddresses(parsed, {
        REPLY_TO_EMAIL_ADDRESSES: ' a@x.com , , b@x.com ',
      }),
    ).toEqual(['a@x.com', 'b@x.com']);
  });

  it('returns empty array when neither argv nor env set', () => {
    const parsed: ParsedArgs = { _: [] };
    expect(parseReplierAddresses(parsed, {})).toEqual([]);
  });

  it('argv wins over env', () => {
    const parsed: ParsedArgs = { _: [], 'reply-to': 'cli@x.com' };
    expect(
      parseReplierAddresses(parsed, { REPLY_TO_EMAIL_ADDRESSES: 'env@x.com' }),
    ).toEqual(['cli@x.com']);
  });
});
