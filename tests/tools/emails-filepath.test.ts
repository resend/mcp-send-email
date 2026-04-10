import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

/**
 * CWE-22: Arbitrary file read via send-email attachment filePath parameter.
 *
 * The `send-email` tool accepts a `filePath` parameter in attachments.
 * An attacker who can influence MCP tool calls (e.g., via prompt injection)
 * can set filePath to any path like '/etc/passwd' or '~/.ssh/id_rsa'.
 * The server reads the file with no path validation and sends its contents
 * as an email attachment to an attacker-controlled recipient address.
 *
 * Fix: Remove the filePath option entirely. Only allow url or base64 content.
 */

// We test by checking the Zod schema no longer accepts filePath,
// and that the handler code no longer calls fs.readFile for attachments.

describe('CWE-22: filePath attachment path traversal', () => {
  it('should not expose filePath in the send-email input schema', async () => {
    // Dynamically import the module to get the addEmailTools function
    const { addEmailTools } = await import('../../src/tools/emails.js');

    // Capture the registered tool schema
    let registeredSchema: Record<string, unknown> | null = null;

    const mockServer = {
      registerTool: (
        name: string,
        config: { inputSchema: Record<string, unknown> },
        _handler: unknown,
      ) => {
        if (name === 'send-email') {
          registeredSchema = config.inputSchema;
        }
      },
    };

    const mockResend = {} as any;

    addEmailTools(mockServer as any, mockResend, {
      senderEmailAddress: 'test@example.com',
      replierEmailAddresses: ['reply@example.com'],
    });

    expect(registeredSchema).not.toBeNull();

    // The attachments schema should not contain filePath
    const attachmentsSchema = registeredSchema!.attachments as any;
    expect(attachmentsSchema).toBeDefined();

    // Parse it to see the shape - the inner object schema should not have filePath
    const schemaShape =
      attachmentsSchema?._def?.innerType?._def?.type?._def?.shape?.() ??
      attachmentsSchema?._def?.type?._def?.shape?.() ??
      null;

    if (schemaShape) {
      expect(schemaShape).not.toHaveProperty('filePath');
    } else {
      // Fallback: try to parse a payload with filePath and verify it's stripped or rejected
      // If we can't introspect the schema, inspect the source code directly
      const sourceCode = await fs.readFile(
        path.join(
          import.meta.dirname,
          '../../src/tools/emails.ts',
        ),
        'utf8',
      );
      // The source should not contain fs.readFile for attachment processing
      // Check that filePath is not used in the attachment processing logic
      const attachmentProcessingMatch = sourceCode.match(
        /if\s*\(\s*att\.filePath\s*\)/,
      );
      expect(attachmentProcessingMatch).toBeNull();
    }
  });

  it('should not call fs.readFile for attachment file paths', async () => {
    const sourceCode = await fs.readFile(
      path.join(
        import.meta.dirname,
        '../../src/tools/emails.ts',
      ),
      'utf8',
    );

    // The source should not contain fs.readFile(att.filePath) pattern
    expect(sourceCode).not.toMatch(/fs\.readFile\s*\(\s*att\.filePath\s*\)/);
  });

  it('should not import node:fs/promises if filePath is removed', async () => {
    const sourceCode = await fs.readFile(
      path.join(
        import.meta.dirname,
        '../../src/tools/emails.ts',
      ),
      'utf8',
    );

    // If filePath is removed, there's no reason to import fs
    expect(sourceCode).not.toMatch(
      /import\s+fs\s+from\s+['"]node:fs\/promises['"]/,
    );
  });

  // Variant attack paths documented:
  // 1. Symlink escape: attacker provides filePath pointing to a symlink
  //    that resolves outside any sandbox → same issue, fs.readFile follows symlinks
  // 2. Encoding variants: filePath with URL-encoded '..' like '%2e%2e' —
  //    Node's fs.readFile interprets paths literally so '%2e%2e' isn't '..',
  //    but the direct '..' traversal works without encoding tricks
  // Both are eliminated by removing filePath entirely.
});
