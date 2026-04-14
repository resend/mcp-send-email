import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Resend } from 'resend';
import { z } from 'zod';
import { extractIdFromUrl } from '../lib/url-parser.js';
import {
  sdkResponseToWorkflow,
  type WorkflowDefinition,
  workflowToSdkOptions,
} from '../lib/workflow-converter.js';

const WORKFLOW_GUIDANCE = `The workflow is a JSON object with one key: "steps" — an array of step objects.

Each step has: key (unique string), type, config, and either "next" (string|null) or "branches" (for branching steps).
Use keys like: "trigger", "send_email_1", "delay_1", "condition_1", "wait_event_1".

## Step types

### trigger — starts the automation when an event fires (required, exactly one)
config: { "eventName": "<event_name>" }
Uses "next".

### send_email — send an email using a published template
config: { "template": { "id": "<template_id>", "variables": { "<key>": "<value>" } }, "from": "Name <sender@example.com>", "subject": "Email subject", "replyTo": "<address>" }
**"from" and "subject" are resolved from the step config first, then fall back to the template.** If neither provides a "from", the email will silently fail to send. If neither provides a "subject", the run will error. Best practice: always set "from" and "subject" on the step config so the automation is self-contained. Use list-domains to find verified domains for "from". "replyTo" and "variables" are optional. Variables can use { "var": "event.<field>" } or { "var": "contact.<field>" } for dynamic values.
Uses "next".

### delay — pause the workflow
config: { "duration": "<human-readable>" }
Examples: "30 minutes", "1 hour", "2 days", "1 week". Max 30 days.
Uses "next".

### condition — conditional split based on contact or event data
config: A condition rule object:
  Single rule: { "type": "rule", "field": "event.<field>" or "contact.<field>", "operator": "<op>", "value": <value> }
  Compound: { "type": "and"|"or", "rules": [<rule>, ...] }
Operators: eq, neq, gt, gte, lt, lte, contains, starts_with, ends_with, exists, is_empty.
exists/is_empty do not require a value.
Uses "branches": { "condition_met": "<step_key>", "condition_not_met": "<step_key_or_null>" }

### wait_for_event — pause until a specific event arrives or timeout
config: { "eventName": "<event_name>", "timeout": "<human-readable>", "filterRule": <optional condition rule> }
For email lifecycle events use "resend:email.<opened|clicked|bounced|delivered|complained|failed|suppressed>".
Uses "branches": { "event_received": "<step_key>", "timeout": "<step_key_or_null>" }

### contact_update — update contact fields
config: { "firstName": "<value>", "lastName": "<value>", "unsubscribed": true|false, "properties": { "<key>": "<value>" } }
All fields optional. Values can use { "var": "event.<field>" } for dynamic data.
Uses "next".

### contact_delete — remove the contact from the audience
config: {}
Uses "next".

### add_to_segment — add contact to a segment
config: { "segmentId": "<segment_id>" }
Uses "next".

## Rules
1. Every step must be reachable from the trigger via next/branches.
2. Terminal steps have "next": null (or null branch values).
3. The workflow must be tree-shaped — no merging branches back together.

## Example: Linear drip campaign

{
  "steps": [
    { "key": "trigger", "type": "trigger", "config": { "eventName": "user.created" }, "next": "send_email_1" },
    { "key": "send_email_1", "type": "send_email", "config": { "template": { "id": "tmpl_123" }, "from": "Welcome <hello@example.com>", "subject": "Welcome!" }, "next": "delay_1" },
    { "key": "delay_1", "type": "delay", "config": { "duration": "3 days" }, "next": "send_email_2" },
    { "key": "send_email_2", "type": "send_email", "config": { "template": { "id": "tmpl_456" }, "from": "Welcome <hello@example.com>", "subject": "Getting started" }, "next": null }
  ]
}

## Example: Re-engagement with wait_for_event

{
  "steps": [
    { "key": "trigger", "type": "trigger", "config": { "eventName": "user.created" }, "next": "send_email_1" },
    { "key": "send_email_1", "type": "send_email", "config": { "template": { "id": "tmpl_789" }, "from": "Team <team@example.com>", "subject": "Welcome" }, "next": "wait_event_1" },
    { "key": "wait_event_1", "type": "wait_for_event", "config": { "eventName": "resend:email.opened", "timeout": "3 days" }, "branches": { "event_received": null, "timeout": "send_email_2" } },
    { "key": "send_email_2", "type": "send_email", "config": { "template": { "id": "tmpl_abc" }, "from": "Team <team@example.com>", "subject": "Did you miss this?" }, "next": null }
  ]
}

## Example: Condition branch

{
  "steps": [
    { "key": "trigger", "type": "trigger", "config": { "eventName": "trial.ended" }, "next": "condition_1" },
    { "key": "condition_1", "type": "condition", "config": { "type": "rule", "field": "event.converted", "operator": "eq", "value": true }, "branches": { "condition_met": "send_email_1", "condition_not_met": "send_email_2" } },
    { "key": "send_email_1", "type": "send_email", "config": { "template": { "id": "tmpl_thanks" }, "from": "Team <team@example.com>", "subject": "Thanks for upgrading!" }, "next": null },
    { "key": "send_email_2", "type": "send_email", "config": { "template": { "id": "tmpl_win_back" }, "from": "Team <team@example.com>", "subject": "We'd love to have you back" }, "next": null }
  ]
}`;

const workflowSchema = z
  .object({
    steps: z
      .array(
        z.object({
          key: z.string().describe('Unique identifier for this step.'),
          type: z
            .string()
            .describe(
              'Step type: trigger, send_email, delay, condition, wait_for_event, contact_update, contact_delete, add_to_segment.',
            ),
          config: z
            .record(z.string(), z.unknown())
            .describe('Step configuration. See tool description for details.'),
          next: z
            .string()
            .nullable()
            .optional()
            .describe(
              'Key of the next step (for linear steps). null for terminal steps.',
            ),
          branches: z
            .record(z.string(), z.string().nullable())
            .optional()
            .describe(
              'Branch targets (for condition and wait_for_event steps).',
            ),
        }),
      )
      .describe('The workflow steps connected via next/branches.'),
  })
  .describe(
    'The workflow definition. See the tool description for the full schema and examples.',
  );

export function addAutomationTools(server: McpServer, resend: Resend) {
  server.registerTool(
    'create-automation',
    {
      title: 'Create Automation',
      description: `**Purpose:** Create an automation workflow that triggers on events and executes a sequence of steps.

**When to use:**
- User wants to set up automated email sequences (welcome series, drip campaigns, re-engagement)
- User wants to automate actions based on events (update contacts, add to segments)

**Workflow:** manage-events (create event, if needed) → list-templates (to get template IDs) → get-template (to check if template has "from" and "subject" — if not, use list-domains to pick a verified domain for the step config) → create-automation → send-event (to test)

**Returns:** Automation ID and dashboard link.

${WORKFLOW_GUIDANCE}`,
      inputSchema: {
        name: z
          .string()
          .nonempty()
          .describe('Name for the automation (e.g., "Welcome Series")'),
        status: z
          .enum(['enabled', 'disabled'])
          .optional()
          .describe(
            'Initial status. Default: disabled. Use "enabled" to activate immediately.',
          ),
        workflow: workflowSchema,
      },
    },
    async ({ name, status, workflow }) => {
      const { steps, connections } = workflowToSdkOptions(
        workflow as WorkflowDefinition,
      );

      const response = await resend.automations.create({
        name,
        ...(status ? { status } : {}),
        steps,
        connections,
      });

      if (response.error) {
        throw new Error(
          `Failed to create automation: ${JSON.stringify(response.error)}`,
        );
      }

      const id = response.data.id;
      return {
        content: [
          { type: 'text', text: 'Automation created successfully.' },
          { type: 'text', text: `Name: ${name}\nID: ${id}` },
          {
            type: 'text',
            text: `Preview: https://resend.com/automations/${id}`,
          },
          {
            type: 'text',
            text: 'Next: Send an event with send-event to trigger this automation.',
          },
        ],
      };
    },
  );

  server.registerTool(
    'update-automation',
    {
      title: 'Update Automation',
      description: `**Purpose:** Update an automation's name, status, or workflow.

**When to use:**
- User wants to rename an automation
- User wants to enable or disable an automation (use status: "disabled" to stop it)
- User wants to modify the workflow steps

**Important:**
- To disable/stop an automation, set status to "disabled". Existing runs will continue to completion.
- When updating the workflow, provide the complete new workflow — it replaces the existing one.
- Use get-automation first to see the current workflow before making changes.

${WORKFLOW_GUIDANCE}`,
      inputSchema: {
        id: z
          .string()
          .nonempty()
          .describe(
            'Automation ID or Resend dashboard URL (e.g. https://resend.com/automations/<id>)',
          ),
        name: z.string().optional().describe('New name for the automation.'),
        status: z
          .enum(['enabled', 'disabled'])
          .optional()
          .describe(
            'New status. Use "disabled" to stop the automation (prevents new runs).',
          ),
        workflow: workflowSchema
          .optional()
          .describe(
            'New workflow definition. Replaces the existing workflow entirely.',
          ),
      },
    },
    async ({ id: rawId, name, status, workflow }) => {
      const id = extractIdFromUrl(rawId, 'automations');
      const updateOptions: {
        name?: string;
        status?: 'enabled' | 'disabled';
        steps?: ReturnType<typeof workflowToSdkOptions>['steps'];
        connections?: ReturnType<typeof workflowToSdkOptions>['connections'];
      } = {};

      if (name !== undefined) updateOptions.name = name;
      if (status !== undefined) updateOptions.status = status;

      if (workflow !== undefined) {
        const { steps, connections } = workflowToSdkOptions(
          workflow as WorkflowDefinition,
        );
        updateOptions.steps = steps;
        updateOptions.connections = connections;
      }

      const response = await resend.automations.update(id, updateOptions);

      if (response.error) {
        throw new Error(
          `Failed to update automation: ${JSON.stringify(response.error)}`,
        );
      }

      const resultParts: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: 'Automation updated successfully.' },
        { type: 'text', text: `ID: ${response.data.id}` },
      ];

      if (status === 'disabled') {
        resultParts.push({
          type: 'text',
          text: 'The automation is now disabled. No new runs will start, but existing runs will continue to completion.',
        });
      }

      return { content: resultParts };
    },
  );

  server.registerTool(
    'get-automation',
    {
      title: 'Get Automation',
      description: `**Purpose:** Get details of a specific automation (with its workflow) or list all automations.

**Modes:**
- With \`id\`: Returns full automation details including the workflow definition.
- Without \`id\`: Lists all automations with optional status filter and pagination.

**When to use:**
- User asks "show me my automations" or "what automations do I have?"
- User wants to inspect a specific automation's workflow
- Before update-automation, to see the current workflow`,
      inputSchema: {
        id: z
          .string()
          .optional()
          .describe(
            'Automation ID or Resend dashboard URL (e.g. https://resend.com/automations/<id>). If omitted, lists all automations.',
          ),
        status: z
          .enum(['enabled', 'disabled'])
          .optional()
          .describe('Filter by status (for list mode only).'),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of automations to retrieve (for list mode).'),
        after: z
          .string()
          .optional()
          .describe('Cursor for forward pagination (for list mode).'),
        before: z
          .string()
          .optional()
          .describe('Cursor for backward pagination (for list mode).'),
      },
    },
    async ({ id: rawId, status, limit, after, before }) => {
      const id = rawId ? extractIdFromUrl(rawId, 'automations') : undefined;
      // Get single automation
      if (id) {
        const response = await resend.automations.get(id);

        if (response.error) {
          throw new Error(
            `Failed to get automation: ${JSON.stringify(response.error)}`,
          );
        }

        const automation = response.data;
        const workflow = sdkResponseToWorkflow(
          automation.steps,
          automation.connections,
        );

        return {
          content: [
            {
              type: 'text',
              text: `Name: ${automation.name}\nID: ${automation.id}\nStatus: ${automation.status}\nCreated: ${automation.created_at}\nUpdated: ${automation.updated_at ?? 'never'}`,
            },
            {
              type: 'text',
              text: `Workflow:\n${JSON.stringify(workflow, null, 2)}`,
            },
            {
              type: 'text',
              text: `Preview: https://resend.com/automations/${automation.id}`,
            },
          ],
        };
      }

      // List automations
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before". Use only one for pagination.',
        );
      }

      const paginationOptions = after
        ? { limit, after, ...(status ? { status } : {}) }
        : before
          ? { limit, before, ...(status ? { status } : {}) }
          : {
              ...(limit !== undefined ? { limit } : {}),
              ...(status ? { status } : {}),
            };

      const response = await resend.automations.list(paginationOptions);

      if (response.error) {
        throw new Error(
          `Failed to list automations: ${JSON.stringify(response.error)}`,
        );
      }

      const automations = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (automations.length === 0) {
        return {
          content: [{ type: 'text', text: 'No automations found.' }],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${automations.length} automation${automations.length === 1 ? '' : 's'}:`,
          },
          ...automations.map((a) => ({
            type: 'text' as const,
            text: `Name: ${a.name}\nID: ${a.id}\nStatus: ${a.status}\nCreated: ${a.created_at}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'More automations available. Use "after" with the last ID to paginate.',
                },
              ]
            : []),
        ],
      };
    },
  );

  server.registerTool(
    'remove-automation',
    {
      title: 'Remove Automation',
      description:
        'Remove an automation by ID or Resend dashboard URL. Before using this tool, you MUST double-check with the user that they want to remove this automation. Reference the NAME of the automation when confirming, and warn the user that removal is irreversible and will stop all future runs. You may only use this tool if the user explicitly confirms.',
      inputSchema: {
        id: z
          .string()
          .nonempty()
          .describe(
            'Automation ID or Resend dashboard URL (e.g. https://resend.com/automations/<id>)',
          ),
      },
    },
    async ({ id: rawId }) => {
      const id = extractIdFromUrl(rawId, 'automations');
      const response = await resend.automations.remove(id);

      if (response.error) {
        throw new Error(
          `Failed to remove automation: ${JSON.stringify(response.error)}`,
        );
      }

      return {
        content: [
          { type: 'text', text: 'Automation removed successfully.' },
          { type: 'text', text: `ID: ${response.data.id}` },
        ],
      };
    },
  );

  server.registerTool(
    'get-automation-runs',
    {
      title: 'Get Automation Runs',
      description: `**Purpose:** List runs for an automation, or get details of a specific run.

**Modes:**
- With \`runId\`: Returns detailed run info with step-by-step execution status, outputs, and errors.
- Without \`runId\`: Lists runs for the automation with optional status filter.

**When to use:**
- User wants to see if an automation is working
- User wants to debug a failed automation run
- User asks "why did this automation fail?" or "show me recent runs"

**Run statuses:** running, completed, failed, cancelled
**Step statuses:** pending, running, completed, failed, skipped, waiting`,
      inputSchema: {
        automationId: z
          .string()
          .nonempty()
          .describe(
            'The automation ID or Resend dashboard URL (e.g. https://resend.com/automations/<id>)',
          ),
        runId: z
          .string()
          .optional()
          .describe(
            'Specific run ID to get details for. If omitted, lists all runs.',
          ),
        status: z
          .enum(['running', 'completed', 'failed', 'cancelled'])
          .optional()
          .describe('Filter runs by status (for list mode only).'),
        limit: z
          .number()
          .min(1)
          .max(100)
          .optional()
          .describe('Number of runs to retrieve (for list mode).'),
        after: z
          .string()
          .optional()
          .describe('Cursor for forward pagination (for list mode).'),
        before: z
          .string()
          .optional()
          .describe('Cursor for backward pagination (for list mode).'),
      },
    },
    async ({
      automationId: rawAutomationId,
      runId,
      status,
      limit,
      after,
      before,
    }) => {
      const automationId = extractIdFromUrl(rawAutomationId, 'automations');
      // Get specific run
      if (runId) {
        const response = await resend.automations.runs.get({
          automationId,
          runId,
        });

        if (response.error) {
          throw new Error(
            `Failed to get automation run: ${JSON.stringify(response.error)}`,
          );
        }

        const run = response.data;
        const stepsSummary = run.steps
          .map(
            (s) =>
              `  ${s.key} (${s.type}): ${s.status}${s.error ? ` — Error: ${JSON.stringify(s.error)}` : ''}${s.output ? ` — Output: ${JSON.stringify(s.output)}` : ''}`,
          )
          .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: `Run ID: ${run.id}\nStatus: ${run.status}\nStarted: ${run.started_at ?? 'not started'}\nCompleted: ${run.completed_at ?? 'in progress'}\nCreated: ${run.created_at}`,
            },
            {
              type: 'text',
              text: `Steps:\n${stepsSummary}`,
            },
          ],
        };
      }

      // List runs
      if (after && before) {
        throw new Error(
          'Cannot use both "after" and "before". Use only one for pagination.',
        );
      }

      const runOptions = after
        ? { automationId, limit, after, ...(status ? { status } : {}) }
        : before
          ? { automationId, limit, before, ...(status ? { status } : {}) }
          : {
              automationId,
              ...(limit !== undefined ? { limit } : {}),
              ...(status ? { status } : {}),
            };

      const response = await resend.automations.runs.list(runOptions);

      if (response.error) {
        throw new Error(
          `Failed to list automation runs: ${JSON.stringify(response.error)}`,
        );
      }

      const runs = response.data?.data ?? [];
      const hasMore = response.data?.has_more ?? false;

      if (runs.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No runs found for this automation.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: `Found ${runs.length} run${runs.length === 1 ? '' : 's'}:`,
          },
          ...runs.map((r) => ({
            type: 'text' as const,
            text: `ID: ${r.id}\nStatus: ${r.status}\nStarted: ${r.started_at ?? 'not started'}\nCompleted: ${r.completed_at ?? 'in progress'}\nCreated: ${r.created_at}`,
          })),
          ...(hasMore
            ? [
                {
                  type: 'text' as const,
                  text: 'More runs available. Use "after" with the last ID to paginate.',
                },
              ]
            : []),
          {
            type: 'text',
            text: 'Use get-automation-runs with a runId to see step-by-step details for a specific run.',
          },
        ],
      };
    },
  );
}
