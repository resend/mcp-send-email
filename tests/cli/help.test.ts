import { describe, expect, it, vi } from 'vitest';
import { HELP_TEXT, printHelp } from '../../src/cli/help.js';

describe('help', () => {
  it('HELP_TEXT includes usage and main options', () => {
    expect(HELP_TEXT).toContain('Usage:');
    expect(HELP_TEXT).toContain('resend-mcp');
    expect(HELP_TEXT).toContain('--key');
    expect(HELP_TEXT).toContain('--sender');
    expect(HELP_TEXT).toContain('--reply-to');
    expect(HELP_TEXT).toContain('--http');
    expect(HELP_TEXT).toContain('--port');
    expect(HELP_TEXT).toContain('-h, --help');
    expect(HELP_TEXT).toContain('RESEND_API_KEY');
    expect(HELP_TEXT).toContain('MCP_PORT');
  });

  it('printHelp writes HELP_TEXT to console.error', () => {
    const stderr = vi.spyOn(console, 'error').mockImplementation(() => {});
    printHelp();
    expect(stderr).toHaveBeenCalledWith(HELP_TEXT);
    stderr.mockRestore();
  });
});
