import type { McpServer, ServerContext } from '@modelcontextprotocol/server';
import type {
  CreateTemplateOptions,
  Resend,
  UpdateTemplateOptions,
} from 'resend';
import { z } from 'zod';
import { EMAIL_HTML_RULES } from '../lib/email-html-rules.js';
import type { ResendEditorClient } from '../lib/resend-editor-client.js';
import { extractIdFromUrl } from '../lib/url-parser.js';

const templateVariableSchema = z.object({
  key: z
    .string()
    .nonempty()
    .describe(
      'The variable key. Recommend capitalizing (e.g., PRODUCT_NAME). NEVER include reserved names in this list: FIRST_NAME, LAST_NAME, EMAIL, RESEND_UNSUBSCRIBE_URL — they are automatically available and will cause a validation error if added.',
    ),
  type: z
    .enum(['string', 'number'])
    .describe('The variable type — either "string" or "number".'),
  fallbackValue: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .describe(
      'Default value used if the variable is not provided when sending.',
    ),
});

const CREATE_TEMPLATE_TOOL = {
  title: 'Create Template',
  description: `Create a new email template in Resend. Templates are created in draft status. Use publish-template to make them available for sending. Variables use triple-brace syntax in HTML: {{{VAR_NAME}}}.

**Workflow:** create-template → get-tiptap-json-content (with include_schema: true) → compose-template → publish-template.

**Content options after creating:**
- **compose-template** (recommended): Sets TipTap content that the user can visually edit in the Resend dashboard. Use this when the user wants to collaborate on or refine the template in the editor.
- **update-template with html/text**: Sets static HTML/text content. Use this only when the user explicitly wants to set raw HTML. Switching between compose and html/text modes is lossy — some content or formatting may be lost. Ask the user before switching.`,
  inputSchema: {
    name: z.string().nonempty().describe('The name of the template.'),
    html: z
      .string()
      .nonempty()
      .describe(
        `The HTML content of the template. Use triple-brace syntax for variables: {{{VARIABLE_NAME}}}.\n\n${EMAIL_HTML_RULES}`,
      ),
    subject: z
      .string()
      .optional()
      .describe('Default email subject. Can be overridden when sending.'),
    from: z
      .string()
      .optional()
      .describe(
        'Sender email address (e.g., "Your Name <sender@example.com>"). Can be overridden when sending.',
      ),
    replyTo: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe(
        'Default Reply-to email address(es). Can be overridden when sending.',
      ),
    text: z
      .string()
      .optional()
      .describe(
        'Plain text version of the message. If omitted, HTML will be used to generate it. Pass an empty string to disable automatic text generation.',
      ),
    alias: z
      .string()
      .optional()
      .describe(
        'An alias for the template. Can be used instead of the ID to reference the template.',
      ),
    variables: z
      .array(templateVariableSchema)
      .optional()
      .describe('Array of template variables (up to 50 per template).'),
  },
} as const;

const LIST_TEMPLATES_TOOL = {
  title: 'List Templates',
  annotations: { readOnlyHint: true },
  description:
    "List all email templates from Resend. Returns template names, statuses, and aliases. Don't bother telling the user the IDs unless they ask for them.",
  inputSchema: {
    limit: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe(
        'Number of templates to retrieve. Default: 20, Max: 100, Min: 1',
      ),
    after: z
      .string()
      .optional()
      .describe(
        'Template ID after which to retrieve more (for forward pagination). Cannot be used with "before".',
      ),
    before: z
      .string()
      .optional()
      .describe(
        'Template ID before which to retrieve more (for backward pagination). Cannot be used with "after".',
      ),
  },
} as const;

const GET_TEMPLATE_TOOL = {
  title: 'Get Template',
  annotations: { readOnlyHint: true },
  description:
    'Get an email template by ID, alias, or Resend dashboard URL (e.g. https://resend.com/templates/<id>) from Resend. Returns full template details including HTML content, variables, and publish status.',
  inputSchema: {
    id: z
      .string()
      .nonempty()
      .describe(
        'The template ID, alias, or Resend dashboard URL (e.g. https://resend.com/templates/<id>)',
      ),
  },
} as const;

const COMPOSE_TEMPLATE_TOOL = {
  title: 'Compose Template',
  description: `**Purpose:** Set the TipTap JSON content of a template, enabling it to be edited visually in the Resend dashboard editor. Automatically connects and disconnects from the editor. Can also update metadata (subject, name) in the same call.

**This is the recommended way to set email content.** Content set via compose-template can be visually edited by the user in the dashboard.

**Workflow:** get-tiptap-json-content (with include_schema: true) → compose-template

**When to use:**
- After create-template, to set the email body
- When the user wants to write, edit, or style email content
- When the user wants to collaborate on the email in the dashboard editor

**Important:** Always call get-tiptap-json-content first to retrieve the existing TipTap JSON, then build your changes on top of it. Skipping this will overwrite all existing content.

**Note:** Switching between compose (TipTap) and update (raw HTML) modes is lossy — some content or formatting may be lost. If the template already has HTML content, ask the user before switching to compose mode.`,
  inputSchema: {
    id: z
      .string()
      .nonempty()
      .describe(
        'The template ID, alias, or Resend dashboard URL (e.g. https://resend.com/templates/<id>)',
      ),
    content: z
      .preprocess(
        (val) => {
          if (typeof val === 'string') {
            try {
              return JSON.parse(val);
            } catch {
              return val;
            }
          }
          return val;
        },
        z.record(z.string(), z.unknown()),
      )
      .describe(
        'TipTap JSON content. Call get-tiptap-json-content (with include_schema: true) first to get the existing content and the schema reference.',
      ),
    subject: z
      .string()
      .optional()
      .describe('Update the default email subject.'),
    name: z.string().optional().describe('Update the template name.'),
  },
} as const;

const UPDATE_TEMPLATE_TOOL = {
  title: 'Update Template',
  description: `Update template metadata by ID, alias, or Resend dashboard URL (name, subject, from, html, variables, etc.). After updating a published template, use publish-template again to make the changes live. To edit TipTap content, use compose-template instead.

**Note on html/text fields:** Setting html or text via this tool replaces any content previously set via compose-template. This switch is lossy — some content or formatting may be lost. Prefer compose-template for content changes. If the template was composed with TipTap content, ask the user before overwriting it with raw HTML.`,
  inputSchema: {
    id: z
      .string()
      .nonempty()
      .describe(
        'The template ID, alias, or Resend dashboard URL (e.g. https://resend.com/templates/<id>)',
      ),
    name: z.string().optional().describe('New name for the template.'),
    html: z
      .string()
      .optional()
      .describe(`New HTML content for the template.\n\n${EMAIL_HTML_RULES}`),
    subject: z.string().optional().describe('New default email subject.'),
    from: z.string().optional().describe('New sender email address.'),
    replyTo: z
      .union([z.string(), z.array(z.string())])
      .optional()
      .describe('New Reply-to email address(es).'),
    text: z
      .string()
      .optional()
      .describe(
        'New plain text version of the message. Pass an empty string to disable automatic text generation.',
      ),
    alias: z.string().optional().describe('New alias for the template.'),
    variables: z
      .array(templateVariableSchema)
      .optional()
      .describe(
        'New array of template variables (replaces existing variables).',
      ),
  },
} as const;

const REMOVE_TEMPLATE_TOOL = {
  title: 'Remove Template',
  description:
    'Remove an email template by ID, alias, or Resend dashboard URL from Resend. Before using this tool, you MUST double-check with the user that they want to remove this template. Reference the NAME of the template when double-checking, and warn the user that removing a template is irreversible. You may only use this tool if the user explicitly confirms they want to remove the template after you double-check.',
  inputSchema: {
    id: z
      .string()
      .nonempty()
      .describe(
        'The template ID, alias, or Resend dashboard URL (e.g. https://resend.com/templates/<id>)',
      ),
  },
} as const;

const PUBLISH_TEMPLATE_TOOL = {
  title: 'Publish Template',
  description:
    'Publish an email template in Resend. Templates must be published before they can be used for sending emails. Re-publishing a previously published template makes the latest changes live. Accepts a template ID, alias, or Resend dashboard URL.',
  inputSchema: {
    id: z
      .string()
      .nonempty()
      .describe(
        'The template ID, alias, or Resend dashboard URL (e.g. https://resend.com/templates/<id>)',
      ),
  },
} as const;

const DUPLICATE_TEMPLATE_TOOL = {
  title: 'Duplicate Template',
  description:
    'Duplicate an existing email template in Resend. Creates a new draft copy of the template with a new ID. Accepts a template ID, alias, or Resend dashboard URL.',
  inputSchema: {
    id: z
      .string()
      .nonempty()
      .describe(
        'The ID, alias, or Resend dashboard URL (e.g. https://resend.com/templates/<id>) of the template to duplicate.',
      ),
  },
} as const;

export function addTemplateTools(
  server: McpServer,
  resend: Resend,
  apiClient: ResendEditorClient,
  {
    withEditorSession,
  }: {
    withEditorSession: <T>(
      conn: { resource_type: 'broadcast' | 'template'; resource_id: string },
      fn: () => Promise<T>,
      ctx?: ServerContext,
    ) => Promise<T>;
  },
) {
  server.registerTool(
    'create-template',
    CREATE_TEMPLATE_TOOL,
    async ({ name, html, subject, from, replyTo, text, alias, variables }) => {
      const response = await resend.templates.create({
        name,
        html,
        subject,
        from,
        replyTo,
        text,
        alias,
        variables,
      } as CreateTemplateOptions);

      if (response.error) {
        throw new Error(
          `Failed to create template: ${JSON.stringify(response.error)}`,
        );
      }

      const resultContent: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: 'Template created successfully (draft).' },
        { type: 'text', text: `ID: ${response.data.id}` },
        {
          type: 'text',
          text: `**Next step:** Use publish-template when ready for sending. To visually edit the content in the dashboard, call get-tiptap-json-content (with include_schema: true) → compose-template (note: switching to compose mode may lose some HTML formatting).`,
        },
        {
          type: 'text',
          text: `Preview: https://resend.com/templates/${response.data.id}`,
        },
      ];

      return { content: resultContent };
    },
  );

  server.registerTool(
    'list-templates',
    LIST_TEMPLATES_TOOL,
    async ({ limit, after, before }) => {
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before" parameters. Use only one for pagination.',
        );
      }

      const paginationOptions = after
        ? { limit, after }
        : before
          ? { limit, before }
          : limit !== undefined
            ? { limit }
            : undefined;

      const response = await resend.templates.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list templates: ${JSON.stringify(response.error)}`,
        );
      }

      const templates = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (templates.length === 0) {
        return {
          content: [{ type: 'text', text: 'No templates found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${templates.length} template${templates.length === 1 ? '' : 's'}:`,
          },
          ...templates.map((template) => ({
            type: 'text' as const,
            text: `Name: ${template.name}\nStatus: ${template.status}\nAlias: ${template.alias ?? 'none'}\nID: ${template.id}\nCreated at: ${template.created_at}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'There are more templates available. Use the "after" parameter with the last ID to retrieve more.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'get-template',
    GET_TEMPLATE_TOOL,
    async ({ id: rawId }) => {
      const id = extractIdFromUrl(rawId, 'templates');
      const response = await resend.templates.get(id);

      if (response.error) {
        throw new Error(
          `Failed to get template: ${JSON.stringify(response.error)}`,
        );
      }

      const template = response.data;
      const variablesText =
        template.variables && template.variables.length > 0
          ? template.variables
              .map(
                (v) =>
                  `  {{{${v.key}}}} (${v.type})${v.fallback_value != null ? ` — fallback: ${v.fallback_value}` : ''}`,
              )
              .join('\n')
          : 'none';

      return {
        content: [
          {
            type: 'text',
            text: `Name: ${template.name}\nID: ${template.id}\nStatus: ${template.status}\nAlias: ${template.alias ?? 'none'}\nSubject: ${template.subject ?? 'none'}\nFrom: ${template.from ?? 'none'}\nReply-to: ${template.reply_to ?? 'none'}\nCreated at: ${template.created_at}\nUpdated at: ${template.updated_at}\nPublished at: ${template.published_at ?? 'never'}`,
          },
          {
            type: 'text',
            text: `Variables:\n${variablesText}`,
          },
          {
            type: 'text',
            text: `HTML:\n${template.html}`,
          },
          ...(template.text
            ? [{ type: 'text' as const, text: `Text:\n${template.text}` }]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'compose-template',
    COMPOSE_TEMPLATE_TOOL,
    async ({ id: rawId, content, subject, name }, ctx) => {
      const id = extractIdFromUrl(rawId, 'templates');
      // Compose the TipTap content with editor session
      await withEditorSession(
        { resource_type: 'template', resource_id: id },
        () => apiClient.composeTemplateContent(id, { content }),
        ctx,
      );

      // Update metadata if any was provided
      const hasMetadata = subject !== undefined || name !== undefined;
      if (hasMetadata) {
        const metadataFields = [
          ...(subject !== undefined ? ['subject'] : []),
          ...(name !== undefined ? ['name'] : []),
        ];

        try {
          const updateResponse = await resend.templates.update(id, {
            ...(subject !== undefined && { subject }),
            ...(name !== undefined && { name }),
          } as UpdateTemplateOptions);

          if (updateResponse.error) {
            return {
              content: [
                {
                  type: 'text',
                  text: `Template content composed successfully, but metadata update failed for: ${metadataFields.join(', ')}.`,
                },
                { type: 'text', text: `ID: ${id}` },
                {
                  type: 'text',
                  text: `Error: ${JSON.stringify(updateResponse.error)}`,
                },
                {
                  type: 'text',
                  text: `**Retry:** Call update-template with id "${id}" to set ${metadataFields.join(', ')}.`,
                },
              ],
            };
          }
        } catch (err) {
          return {
            content: [
              {
                type: 'text',
                text: `Template content composed successfully, but metadata update failed for: ${metadataFields.join(', ')}.`,
              },
              { type: 'text', text: `ID: ${id}` },
              {
                type: 'text',
                text: `Error: ${err instanceof Error ? err.message : String(err)}`,
              },
              {
                type: 'text',
                text: `**Retry:** Call update-template with id "${id}" to set ${metadataFields.join(', ')}.`,
              },
            ],
          };
        }
      }

      const resultParts: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: 'Template content composed successfully.' },
        { type: 'text', text: `ID: ${id}` },
      ];

      // Only check for missing metadata when the caller didn't provide any
      if (!hasMetadata) {
        try {
          const current = await resend.templates.get(id);
          if (!current.error) {
            if (current.data.subject == null) {
              resultParts.push({
                type: 'text',
                text: '**Note:** The template has no subject set. You can set it by calling compose-template again with the subject field, or use update-template.',
              });
            }

            const status = current.data.status;
            if (status === 'draft') {
              resultParts.push({
                type: 'text',
                text: 'The template is in draft status. Use publish-template to make it available for sending.',
              });
            } else if (status === 'published') {
              resultParts.push({
                type: 'text',
                text: 'The template is published. Use publish-template again to make the latest changes live.',
              });
            }
          } else {
            resultParts.push({
              type: 'text',
              text: '**Note:** Could not verify template metadata — check that a subject is set.',
            });
          }
        } catch {
          resultParts.push({
            type: 'text',
            text: '**Note:** Could not verify template metadata — check that a subject is set.',
          });
        }
      }

      resultParts.push({
        type: 'text',
        text: `Preview: https://resend.com/templates/${id}`,
      });

      return { content: resultParts };
    },
  );

  server.registerTool(
    'update-template',
    UPDATE_TEMPLATE_TOOL,
    async ({
      id: rawId,
      name,
      html,
      subject,
      from,
      replyTo,
      text,
      alias,
      variables,
    }) => {
      const id = extractIdFromUrl(rawId, 'templates');
      const response = await resend.templates.update(id, {
        name,
        html,
        subject,
        from,
        replyTo,
        text,
        alias,
        variables,
      } as UpdateTemplateOptions);

      if (response.error) {
        throw new Error(
          `Failed to update template: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Template updated successfully.' },
          { type: 'text', text: `ID: ${id}` },
          {
            type: 'text',
            text: 'If the template was published, use publish-template to make the changes live.',
          },
          {
            type: 'text',
            text: `Preview: https://resend.com/templates/${id}`,
          },
        ],
      };
    },
  );

  server.registerTool(
    'remove-template',
    REMOVE_TEMPLATE_TOOL,
    async ({ id: rawId }) => {
      const id = extractIdFromUrl(rawId, 'templates');
      const response = await resend.templates.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove template: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Template removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'publish-template',
    PUBLISH_TEMPLATE_TOOL,
    async ({ id: rawId }) => {
      const id = extractIdFromUrl(rawId, 'templates');
      const response = await resend.templates.publish(id);

      if (response.error) {
        throw new Error(
          `Failed to publish template: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Template published successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'duplicate-template',
    DUPLICATE_TEMPLATE_TOOL,
    async ({ id: rawId }) => {
      const id = extractIdFromUrl(rawId, 'templates');
      const response = await resend.templates.duplicate(id);

      if (response.error) {
        throw new Error(
          `Failed to duplicate template: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Template duplicated successfully (draft).' },
          { type: 'text', text: `New template ID: ${response.data.id}` },
        ],
      };
    },
  );
}
