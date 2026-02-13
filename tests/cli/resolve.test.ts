import { describe, expect, it } from 'vitest';
import { parseArgs } from '../../src/cli/parse.js';
import { resolveConfig } from '../../src/cli/resolve.js';

describe('resolveConfig', () => {
  it('returns error when no API key', () => {
    const parsed = parseArgs([]);
    const result = resolveConfig(parsed, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('API key');
    }
  });

  it('returns error when API key is whitespace only', () => {
    const result = resolveConfig(parseArgs(['--key', '   ']), {
      RESEND_API_KEY: '   ',
    });
    expect(result.ok).toBe(false);
  });

  it('resolves config from --key', () => {
    const parsed = parseArgs(['--key', '  re_abc  ']);
    const result = resolveConfig(parsed, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.apiKey).toBe('re_abc');
      expect(result.config.senderEmailAddress).toBe('');
      expect(result.config.replierEmailAddresses).toEqual([]);
    }
  });

  it('resolves config from RESEND_API_KEY when --key not set', () => {
    const parsed = parseArgs([]);
    const result = resolveConfig(parsed, { RESEND_API_KEY: 're_env' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.apiKey).toBe('re_env');
    }
  });

  it('--key overrides RESEND_API_KEY', () => {
    const parsed = parseArgs(['--key', 're_cli']);
    const result = resolveConfig(parsed, { RESEND_API_KEY: 're_env' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.apiKey).toBe('re_cli');
    }
  });

  it('includes sender from --sender', () => {
    const parsed = parseArgs(['--key', 're_x', '--sender', 'from@resend.dev']);
    const result = resolveConfig(parsed, {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.senderEmailAddress).toBe('from@resend.dev');
    }
  });

  it('includes sender from SENDER_EMAIL_ADDRESS', () => {
    const parsed = parseArgs(['--key', 're_x']);
    const result = resolveConfig(parsed, {
      RESEND_API_KEY: 're_x',
      SENDER_EMAIL_ADDRESS: ' env@resend.dev ',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.senderEmailAddress).toBe('env@resend.dev');
    }
  });

  it('defaults sender to empty string when not set', () => {
    const parsed = parseArgs(['--key', 're_x']);
    const result = resolveConfig(parsed, { RESEND_API_KEY: 're_x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.senderEmailAddress).toBe('');
    }
  });

  it('includes replier addresses from env', () => {
    const parsed = parseArgs(['--key', 're_x']);
    const result = resolveConfig(parsed, {
      RESEND_API_KEY: 're_x',
      REPLY_TO_EMAIL_ADDRESSES: 'r1@x.com,r2@x.com',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.replierEmailAddresses).toEqual([
        'r1@x.com',
        'r2@x.com',
      ]);
    }
  });

  it('defaults transport to stdio and port to 3000', () => {
    const parsed = parseArgs(['--key', 're_x']);
    const result = resolveConfig(parsed, { RESEND_API_KEY: 're_x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.transport).toBe('stdio');
      expect(result.config.port).toBe(3000);
    }
  });

  it('sets transport to http and uses default port when --http', () => {
    const parsed = parseArgs(['--key', 're_x', '--http']);
    const result = resolveConfig(parsed, { RESEND_API_KEY: 're_x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.transport).toBe('http');
      expect(result.config.port).toBe(3000);
    }
  });

  it('uses --port when provided with --http', () => {
    const parsed = parseArgs(['--key', 're_x', '--http', '--port', '8080']);
    const result = resolveConfig(parsed, { RESEND_API_KEY: 're_x' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.transport).toBe('http');
      expect(result.config.port).toBe(8080);
    }
  });

  it('uses MCP_PORT when --port not set', () => {
    const parsed = parseArgs(['--key', 're_x', '--http']);
    const result = resolveConfig(parsed, {
      RESEND_API_KEY: 're_x',
      MCP_PORT: '9000',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.port).toBe(9000);
    }
  });

  it('--port overrides MCP_PORT', () => {
    const parsed = parseArgs(['--key', 're_x', '--http', '--port', '4000']);
    const result = resolveConfig(parsed, {
      RESEND_API_KEY: 're_x',
      MCP_PORT: '9000',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.port).toBe(4000);
    }
  });

  it('invalid or out-of-range port falls back to default', () => {
    const invalid = resolveConfig(
      parseArgs(['--key', 're_x', '--http', '--port', 'not-a-number']),
      { RESEND_API_KEY: 're_x' },
    );
    const outOfRange = resolveConfig(parseArgs(['--key', 're_x', '--http']), {
      RESEND_API_KEY: 're_x',
      MCP_PORT: '99999',
    });
    expect(invalid.ok && outOfRange.ok).toBe(true);
    if (invalid.ok) expect(invalid.config.port).toBe(3000);
    if (outOfRange.ok) expect(outOfRange.config.port).toBe(3000);
  });
});
