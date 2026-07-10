import { readFile } from 'node:fs/promises';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';

export function addContactImportTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-contact-import',
    {
      title: 'Create Contact Import',
      description:
        'Bulk-import contacts from a CSV file into Resend. The import is processed asynchronously: this returns an import ID immediately, then use get-contact-import to poll its status and counts. Provide the CSV via exactly one of `filePath`, `content`, or `url`. Max file size 100MB.',
      inputSchema: {
        filePath: z
          .string()
          .optional()
          .describe(
            'Local path to a CSV file to read and upload. Use one of filePath, content, or url.',
          ),
        content: z
          .string()
          .optional()
          .describe(
            'Raw CSV text to upload (e.g. "email,first_name\\na@b.com,Ada"). Use one of filePath, content, or url.',
          ),
        url: z
          .string()
          .optional()
          .describe(
            'URL of a CSV file to fetch and upload. Use one of filePath, content, or url.',
          ),
        filename: z
          .string()
          .optional()
          .describe('Name for the uploaded file. Defaults to "contacts.csv".'),
        columnMap: z
          .object({
            email: z
              .string()
              .optional()
              .describe('CSV header name that contains email addresses.'),
            firstName: z
              .string()
              .optional()
              .describe('CSV header name that contains first names.'),
            lastName: z
              .string()
              .optional()
              .describe('CSV header name that contains last names.'),
            unsubscribed: z
              .string()
              .optional()
              .describe('CSV header name that contains the unsubscribed flag.'),
            properties: z
              .record(
                z.string(),
                z.object({
                  column: z
                    .string()
                    .describe('CSV header name to map to this property.'),
                  type: z
                    .enum(['string', 'number', 'boolean'])
                    .optional()
                    .describe('Property type. Defaults to "string".'),
                }),
              )
              .optional()
              .describe(
                'Maps custom property keys to CSV columns (e.g. { "company_name": { "column": "Company" } }).',
              ),
          })
          .optional()
          .describe(
            'Maps contact fields to CSV header names. When omitted, headers are matched case-sensitively to "email", "first_name", and "last_name".',
          ),
        onConflict: z
          .enum(['upsert', 'skip'])
          .optional()
          .describe(
            'How to handle contacts that already exist: "upsert" updates them, "skip" leaves them unchanged. Defaults to "upsert".',
          ),
        segmentIds: z
          .array(z.string())
          .optional()
          .describe('Array of segment IDs to assign the imported contacts to.'),
        topics: z
          .array(
            z.object({
              id: z.string().describe('Topic ID'),
              subscription: z
                .enum(['opt_in', 'opt_out'])
                .describe('Subscription preference for this topic'),
            }),
          )
          .optional()
          .describe(
            'Topic subscription configurations applied to the imported contacts.',
          ),
      },
    },
    async ({
      filePath,
      content,
      url,
      filename,
      columnMap,
      onConflict,
      segmentIds,
      topics,
    }) => {
      const sources = [filePath, content, url].filter(
        (s) => s !== undefined,
      ).length;
      if (sources !== 1) {
        throw new Error(
          'Provide exactly one of "filePath", "content", or "url" for the CSV file.',
        );
      }

      let fileData: BlobPart;
      if (filePath !== undefined) {
        fileData = await readFile(filePath);
      } else if (url !== undefined) {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch CSV from url (${res.status} ${res.statusText}).`,
          );
        }
        fileData = await res.arrayBuffer();
      } else {
        fileData = content as string;
      }

      const file = new File([fileData], filename ?? 'contacts.csv', {
        type: 'text/csv',
      });

      const response = await resend.contacts.imports.create({
        file,
        columnMap,
        onConflict,
        segments: segmentIds?.map((id) => ({ id })),
        topics,
      });

      if (response.error) {
        throw new Error(
          `Failed to create contact import: ${JSON.stringify(response.error)}`,
        );
      }

      const created = response.data;
      return {
        content: [
          { type: 'text', text: 'Contact import created successfully.' },
          { type: 'text', text: `Import ID: ${created.id}` },
          {
            type: 'text',
            text: 'The import runs asynchronously. Use get-contact-import with this ID to check its status and counts.',
          },
        ],
      };
    },
  );

  server.registerTool(
    'get-contact-import',
    {
      title: 'Get Contact Import',
      description:
        'Get the status and counts of a contact import by ID. Use after create-contact-import to track progress (queued, in_progress, completed, failed).',
      inputSchema: {
        id: z.string().describe('Contact import ID'),
      },
    },
    async ({ id }) => {
      const response = await resend.contacts.imports.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get contact import: ${JSON.stringify(response.error)}`,
        );
      }

      const item = response.data;
      const counts = item.counts;
      return {
        content: [
          {
            type: 'text',
            text: [
              `ID: ${item.id}`,
              `Status: ${item.status}`,
              `Total: ${counts.total}`,
              `Created: ${counts.created}`,
              `Updated: ${counts.updated}`,
              `Skipped: ${counts.skipped}`,
              `Failed: ${counts.failed}`,
              `Created at: ${item.created_at}`,
              item.completed_at != null && `Completed at: ${item.completed_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          },
        ],
      };
    },
  );

  server.registerTool(
    'list-contact-imports',
    {
      title: 'List Contact Imports',
      description:
        'List contact imports from Resend. Optionally filter by status. Use to discover import IDs or review past imports.',
      inputSchema: {
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe(
            'Number of contact imports to retrieve. Default: 10, Max: 100, Min: 1',
          ),
        after: z
          .string()
          .optional()
          .describe(
            'Contact import ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
          ),
        before: z
          .string()
          .optional()
          .describe(
            'Contact import ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
          ),
        status: z
          .enum(['queued', 'in_progress', 'completed', 'failed'])
          .optional()
          .describe('Filter imports by status.'),
      },
    },
    async ({ limit, after, before, status }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      const options: Record<string, unknown> = {};
      if (limit !== undefined) options.limit = limit;
      if (after) options.after = after;
      if (before) options.before = before;
      if (status) options.status = status;

      const response = await resend.contacts.imports.list(
        Object.keys(options).length > 0 ? options : undefined,
      );

      if (response.error) {
        throw new Error(
          `Failed to list contact imports: ${JSON.stringify(response.error)}`,
        );
      }

      const imports = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (imports.length === 0) {
        return {
          content: [{ type: 'text', text: 'No contact imports found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${imports.length} contact import${imports.length === 1 ? '' : 's'}:`,
          },
          ...imports.map((item) => ({
            type: 'text' as const,
            text: [
              `ID: ${item.id}`,
              `Status: ${item.status}`,
              `Total: ${item.counts.total}`,
              `Created: ${item.counts.created}`,
              `Updated: ${item.counts.updated}`,
              `Skipped: ${item.counts.skipped}`,
              `Failed: ${item.counts.failed}`,
              `Created at: ${item.created_at}`,
              item.completed_at != null && `Completed at: ${item.completed_at}`,
            ]
              .filter(Boolean)
              .join('\n'),
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more contact imports available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );
}
