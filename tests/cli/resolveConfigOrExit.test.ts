import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json' with { type: 'json' };
import { resolveConfigOrExit } from '../../src/cli/index.js';
import { parseArgs } from '../../src/cli/parse.js';

describe('resolveConfigOrExit', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((code?: string | number | null) => {
        throw new Error(`process.exit(${code})`);
      }) as ReturnType<typeof vi.spyOn>;
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it('calls process.exit(0) and prints help when --help', () => {
    expect(() => resolveConfigOrExit(parseArgs(['--help']), {})).toThrow();
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('RESEND_API_KEY'),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Usage'),
    );
  });

  it('calls process.exit(0) when -h', () => {
    expect(() => resolveConfigOrExit(parseArgs(['-h']), {})).toThrow();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('calls process.exit(0) and prints version when --version', () => {
    expect(() => resolveConfigOrExit(parseArgs(['--version']), {})).toThrow();
    expect(consoleLogSpy).toHaveBeenCalledWith(packageJson.version);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('calls process.exit(0) and prints version when -v', () => {
    expect(() => resolveConfigOrExit(parseArgs(['-v']), {})).toThrow();
    expect(consoleLogSpy).toHaveBeenCalledWith(packageJson.version);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('reports unknown flags before API key validation', () => {
    expect(() =>
      resolveConfigOrExit(parseArgs(['--definitely-not-a-real-flag']), {}),
    ).toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error:',
      'Unknown option: --definitely-not-a-real-flag',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) and console.error when config invalid', () => {
    const parsed = parseArgs([]);
    expect(() => resolveConfigOrExit(parsed, {})).toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error:',
      expect.stringContaining('API key'),
    );
  });

  it('returns config when valid', () => {
    const parsed = parseArgs(['--key', 're_abc', '--sender', 'x@r.dev']);
    const config = resolveConfigOrExit(parsed, {});
    expect(config).toEqual({
      apiKey: 're_abc',
      senderEmailAddress: 'x@r.dev',
      replierEmailAddresses: [],
      transport: 'stdio',
      port: 3000,
    });
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('returns config with transport http and port when --http', () => {
    const parsed = parseArgs(['--key', 're_abc', '--http', '--port', '8080']);
    const config = resolveConfigOrExit(parsed, {});
    expect(config.transport).toBe('http');
    expect(config.port).toBe(8080);
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
