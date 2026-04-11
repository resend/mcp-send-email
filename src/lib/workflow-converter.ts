import type {
  AutomationConnection,
  AutomationConnectionType,
  AutomationResponseConnection,
  AutomationResponseStep,
  AutomationStep,
  ConditionRule,
} from 'resend';

// -- Types for the simplified workflow format (dashboard-compatible) --

interface EventReceivedTrigger {
  type: 'event_received';
  config: { event: string };
  next: string | null;
}

interface EmailEventTrigger {
  type: 'email_event';
  config: {
    event:
      | 'delivered'
      | 'bounced'
      | 'opened'
      | 'clicked'
      | 'complained'
      | 'failed'
      | 'suppressed'
      | '';
  };
  next: string | null;
}

type WorkflowTrigger = EventReceivedTrigger | EmailEventTrigger;

interface SendEmailStep {
  id: string;
  type: 'send_email';
  config: {
    template: {
      id: string;
      variables?: Record<string, string | number>;
    };
    subject?: string;
    from?: string;
    reply_to?: string;
  };
  next: string | null;
}

interface DelayStep {
  id: string;
  type: 'delay';
  config: { duration: number; unit: string };
  next: string | null;
}

interface TrueFalseBranchStep {
  id: string;
  type: 'true_false_branch';
  config: {
    conditions: Array<{
      field: string;
      operator: string;
      value: string | number | boolean;
    }>;
  };
  branches: { true: string | null; false: string | null };
}

interface WaitForEventStep {
  id: string;
  type: 'wait_for_event';
  config: {
    event_name: string;
    timeout: number;
    filter_rule?: { field: string; operator: string; value?: unknown };
  };
  branches: { event_received: string | null; timeout: string | null };
}

interface ContactDeleteStep {
  id: string;
  type: 'contact_delete';
  config: Record<string, never>;
  next: string | null;
}

interface AddToSegmentStep {
  id: string;
  type: 'add_to_segment';
  config: { segment_id: string };
  next: string | null;
}

interface ContactUpdateStep {
  id: string;
  type: 'contact_update';
  config: {
    first_name?: string | null | { var: string };
    last_name?: string | null | { var: string };
    unsubscribed?: boolean | { var: string };
    properties?: Record<
      string,
      string | number | boolean | null | { var: string }
    >;
  };
  next: string | null;
}

type WorkflowStep =
  | SendEmailStep
  | DelayStep
  | TrueFalseBranchStep
  | WaitForEventStep
  | ContactDeleteStep
  | AddToSegmentStep
  | ContactUpdateStep;

export interface WorkflowDefinition {
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
}

// -- Operator mapping (dashboard ↔ SDK) --

const OPERATOR_TO_SDK: Record<string, string> = {
  is_equal_to: 'eq',
  is_not_equal_to: 'neq',
  is_greater_than: 'gt',
  is_greater_than_or_equal: 'gte',
  is_less_than: 'lt',
  is_less_than_or_equal: 'lte',
  exists: 'exists',
  is_empty: 'is_empty',
  contains: 'contains',
  starts_with: 'starts_with',
  ends_with: 'ends_with',
};

const SDK_TO_OPERATOR: Record<string, string> = Object.fromEntries(
  Object.entries(OPERATOR_TO_SDK).map(([k, v]) => [v, k]),
);

const EMAIL_EVENT_TO_EVENT_NAME: Record<string, string> = {
  delivered: 'resend:email.delivered',
  bounced: 'resend:email.bounced',
  opened: 'resend:email.opened',
  clicked: 'resend:email.clicked',
  complained: 'resend:email.complained',
  failed: 'resend:email.failed',
  suppressed: 'resend:email.suppressed',
};

const EVENT_NAME_TO_EMAIL_EVENT: Record<string, string> = Object.fromEntries(
  Object.entries(EMAIL_EVENT_TO_EVENT_NAME).map(([k, v]) => [v, k]),
);

const UNIT_TO_SECONDS: Record<string, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86400,
  weeks: 604800,
};

const UNITS_DESC: { unit: string; seconds: number }[] = [
  { unit: 'weeks', seconds: 604800 },
  { unit: 'days', seconds: 86400 },
  { unit: 'hours', seconds: 3600 },
  { unit: 'minutes', seconds: 60 },
  { unit: 'seconds', seconds: 1 },
];

// -- Dashboard format → SDK format --

function conditionToSdk(condition: {
  field: string;
  operator: string;
  value?: unknown;
}): ConditionRule {
  const operator = OPERATOR_TO_SDK[condition.operator] ?? condition.operator;

  if (operator === 'exists' || operator === 'is_empty') {
    return { type: 'rule', field: condition.field, operator };
  }

  if (
    operator === 'gt' ||
    operator === 'gte' ||
    operator === 'lt' ||
    operator === 'lte'
  ) {
    return {
      type: 'rule',
      field: condition.field,
      operator,
      value: Number(condition.value),
    };
  }

  if (
    operator === 'contains' ||
    operator === 'starts_with' ||
    operator === 'ends_with'
  ) {
    return {
      type: 'rule',
      field: condition.field,
      operator,
      value: String(condition.value ?? ''),
    };
  }

  return {
    type: 'rule',
    field: condition.field,
    operator: operator as 'eq' | 'neq',
    value: condition.value as string | number | boolean | null,
  };
}

function conditionsToSdk(
  conditions: Array<{ field: string; operator: string; value?: unknown }>,
): ConditionRule {
  if (conditions.length === 1) {
    return conditionToSdk(conditions[0]);
  }
  return { type: 'and', rules: conditions.map(conditionToSdk) };
}

function isVariableRef(value: unknown): value is { var: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'var' in value &&
    typeof (value as { var: unknown }).var === 'string'
  );
}

function convertSendEmailVariables(
  variables: Record<string, string | number> | undefined,
): Record<string, string | number | boolean | { var: string }> | undefined {
  if (!variables) return undefined;

  return Object.fromEntries(
    Object.entries(variables).map(([key, value]) => {
      if (
        typeof value === 'string' &&
        (value.startsWith('event.') ||
          value.startsWith('contact.') ||
          value.startsWith('wait_events.'))
      ) {
        return [key, { var: value }];
      }
      return [key, value];
    }),
  );
}

export function workflowToSdkOptions(workflow: WorkflowDefinition): {
  steps: AutomationStep[];
  connections: AutomationConnection[];
} {
  const steps: AutomationStep[] = [];
  const connections: AutomationConnection[] = [];

  // Convert trigger
  const triggerKey = 'trigger';
  let eventName: string;
  if (workflow.trigger.type === 'email_event') {
    eventName =
      EMAIL_EVENT_TO_EVENT_NAME[workflow.trigger.config.event] ??
      workflow.trigger.config.event;
  } else {
    eventName = workflow.trigger.config.event;
  }

  steps.push({ key: triggerKey, type: 'trigger', config: { eventName } });

  if (workflow.trigger.next) {
    connections.push({ from: triggerKey, to: workflow.trigger.next });
  }

  // Convert steps
  for (const step of workflow.steps) {
    switch (step.type) {
      case 'send_email': {
        const variables = convertSendEmailVariables(
          step.config.template.variables,
        );
        steps.push({
          key: step.id,
          type: 'send_email',
          config: {
            template: {
              id: step.config.template.id,
              ...(variables ? { variables } : {}),
            },
            ...(step.config.subject ? { subject: step.config.subject } : {}),
            ...(step.config.from ? { from: step.config.from } : {}),
            ...(step.config.reply_to ? { replyTo: step.config.reply_to } : {}),
          },
        });
        if (step.next) {
          connections.push({ from: step.id, to: step.next });
        }
        break;
      }

      case 'delay': {
        const seconds =
          step.config.duration * (UNIT_TO_SECONDS[step.config.unit] ?? 1);
        steps.push({
          key: step.id,
          type: 'delay',
          config: { duration: String(seconds) },
        });
        if (step.next) {
          connections.push({ from: step.id, to: step.next });
        }
        break;
      }

      case 'true_false_branch': {
        steps.push({
          key: step.id,
          type: 'condition',
          config: conditionsToSdk(step.config.conditions),
        });
        if (step.branches.true) {
          connections.push({
            from: step.id,
            to: step.branches.true,
            type: 'condition_met',
          });
        }
        if (step.branches.false) {
          connections.push({
            from: step.id,
            to: step.branches.false,
            type: 'condition_not_met',
          });
        }
        break;
      }

      case 'wait_for_event': {
        const filterRule = step.config.filter_rule
          ? conditionToSdk(step.config.filter_rule)
          : undefined;
        steps.push({
          key: step.id,
          type: 'wait_for_event',
          config: {
            eventName: step.config.event_name,
            ...(step.config.timeout
              ? { timeout: String(step.config.timeout) }
              : {}),
            ...(filterRule ? { filterRule } : {}),
          },
        });
        if (step.branches.event_received) {
          connections.push({
            from: step.id,
            to: step.branches.event_received,
            type: 'event_received',
          });
        }
        if (step.branches.timeout) {
          connections.push({
            from: step.id,
            to: step.branches.timeout,
            type: 'timeout',
          });
        }
        break;
      }

      case 'contact_update': {
        steps.push({
          key: step.id,
          type: 'contact_update',
          config: {
            ...(step.config.first_name !== undefined
              ? { firstName: step.config.first_name }
              : {}),
            ...(step.config.last_name !== undefined
              ? { lastName: step.config.last_name }
              : {}),
            ...(step.config.unsubscribed !== undefined
              ? { unsubscribed: step.config.unsubscribed }
              : {}),
            ...(step.config.properties
              ? { properties: step.config.properties }
              : {}),
          },
        });
        if (step.next) {
          connections.push({ from: step.id, to: step.next });
        }
        break;
      }

      case 'contact_delete': {
        steps.push({
          key: step.id,
          type: 'contact_delete',
          config: {} as Record<string, never>,
        });
        if (step.next) {
          connections.push({ from: step.id, to: step.next });
        }
        break;
      }

      case 'add_to_segment': {
        steps.push({
          key: step.id,
          type: 'add_to_segment',
          config: { segmentId: step.config.segment_id },
        });
        if (step.next) {
          connections.push({ from: step.id, to: step.next });
        }
        break;
      }
    }
  }

  return { steps, connections };
}

// -- SDK response → Dashboard format --

function secondsToDuration(seconds: number): {
  duration: number;
  unit: string;
} {
  for (const { unit, seconds: unitSeconds } of UNITS_DESC) {
    if (seconds >= unitSeconds && seconds % unitSeconds === 0) {
      return { duration: seconds / unitSeconds, unit };
    }
  }
  return { duration: Math.ceil(seconds / 60), unit: 'minutes' };
}

function sdkConditionToWorkflow(config: Record<string, unknown>): {
  field: string;
  operator: string;
  value: string | number | boolean;
} {
  const operator =
    SDK_TO_OPERATOR[config.operator as string] ?? (config.operator as string);
  const field = config.field as string;
  const value = config.value;

  return {
    field,
    operator,
    value: value == null ? '' : (value as string | number | boolean),
  };
}

function sdkConditionsToWorkflow(config: Record<string, unknown>): Array<{
  field: string;
  operator: string;
  value: string | number | boolean;
}> {
  if (config.type === 'and' || config.type === 'or') {
    return (config.rules as Record<string, unknown>[]).map(
      sdkConditionToWorkflow,
    );
  }
  return [sdkConditionToWorkflow(config)];
}

function normalizeSendEmailVariables(
  variables: unknown,
): Record<string, string | number> | undefined {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return undefined;
  }

  const entries = Object.entries(variables).map(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number') {
      return [key, value] as const;
    }
    if (isVariableRef(value)) {
      return [key, value.var] as const;
    }
    return [key, ''] as const;
  });

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function sdkResponseToWorkflow(
  responseSteps: AutomationResponseStep[],
  responseConnections: AutomationResponseConnection[],
): WorkflowDefinition {
  // Index connections by source step key and type
  const connectionsByFrom = new Map<
    string,
    Map<AutomationConnectionType, string>
  >();
  for (const conn of responseConnections) {
    if (!connectionsByFrom.has(conn.from)) {
      connectionsByFrom.set(conn.from, new Map());
    }
    connectionsByFrom.get(conn.from)!.set(conn.type, conn.to);
  }

  function getNext(key: string): string | null {
    return connectionsByFrom.get(key)?.get('default') ?? null;
  }

  // Find trigger step
  const triggerStep = responseSteps.find((s) => s.type === 'trigger');
  if (!triggerStep) {
    throw new Error('Workflow must have a trigger step');
  }

  // Reconstruct trigger
  const triggerType =
    (triggerStep.config.trigger_type as string) ?? 'event_received';
  const rawEventName = (triggerStep.config.event_name as string) ?? '';
  const triggerNext = getNext(triggerStep.key);

  let trigger: WorkflowTrigger;
  if (triggerType === 'email_event') {
    const emailEvent = EVENT_NAME_TO_EMAIL_EVENT[rawEventName] ?? rawEventName;
    trigger = {
      type: 'email_event',
      config: { event: emailEvent as EmailEventTrigger['config']['event'] },
      next: triggerNext,
    };
  } else {
    trigger = {
      type: 'event_received',
      config: { event: rawEventName },
      next: triggerNext,
    };
  }

  // Reconstruct steps
  const steps: WorkflowStep[] = [];
  for (const step of responseSteps) {
    if (step.type === 'trigger') continue;

    const next = getNext(step.key);
    const conns = connectionsByFrom.get(step.key);

    switch (step.type) {
      case 'send_email': {
        const templateObj =
          step.config.template && typeof step.config.template === 'object'
            ? (step.config.template as Record<string, unknown>)
            : null;
        const templateId =
          templateObj && typeof templateObj.id === 'string'
            ? templateObj.id
            : '';
        const variables = normalizeSendEmailVariables(templateObj?.variables);

        steps.push({
          id: step.key,
          type: 'send_email',
          config: {
            template: {
              id: templateId,
              ...(variables ? { variables } : {}),
            },
            subject:
              typeof step.config.subject === 'string'
                ? step.config.subject
                : '',
            from: typeof step.config.from === 'string' ? step.config.from : '',
            ...(typeof step.config.reply_to === 'string'
              ? { reply_to: step.config.reply_to }
              : {}),
          },
          next,
        });
        break;
      }

      case 'delay': {
        const delaySeconds =
          typeof step.config.duration === 'number'
            ? step.config.duration
            : typeof step.config.duration === 'string'
              ? Number(step.config.duration)
              : 0;
        const { duration, unit } = secondsToDuration(delaySeconds);
        steps.push({
          id: step.key,
          type: 'delay',
          config: { duration, unit },
          next,
        });
        break;
      }

      case 'condition': {
        steps.push({
          id: step.key,
          type: 'true_false_branch',
          config: { conditions: sdkConditionsToWorkflow(step.config) },
          branches: {
            true: conns?.get('condition_met') ?? null,
            false: conns?.get('condition_not_met') ?? null,
          },
        });
        break;
      }

      case 'wait_for_event': {
        const eventName =
          typeof step.config.event_name === 'string'
            ? step.config.event_name
            : '';
        const timeout =
          typeof step.config.timeout === 'number' ? step.config.timeout : 0;
        const filterRule = step.config.filter_rule
          ? sdkConditionToWorkflow(
              step.config.filter_rule as Record<string, unknown>,
            )
          : undefined;

        steps.push({
          id: step.key,
          type: 'wait_for_event',
          config: {
            event_name: eventName,
            timeout,
            ...(filterRule ? { filter_rule: filterRule } : {}),
          },
          branches: {
            event_received: conns?.get('event_received') ?? null,
            timeout: conns?.get('timeout') ?? null,
          },
        });
        break;
      }

      case 'contact_delete': {
        steps.push({
          id: step.key,
          type: 'contact_delete',
          config: {} as Record<string, never>,
          next,
        });
        break;
      }

      case 'add_to_segment': {
        steps.push({
          id: step.key,
          type: 'add_to_segment',
          config: {
            segment_id:
              typeof step.config.segment_id === 'string'
                ? step.config.segment_id
                : '',
          },
          next,
        });
        break;
      }

      case 'contact_update': {
        const config: ContactUpdateStep['config'] = {};
        if (step.config.first_name !== undefined)
          config.first_name = step.config.first_name as
            | string
            | null
            | { var: string };
        if (step.config.last_name !== undefined)
          config.last_name = step.config.last_name as
            | string
            | null
            | { var: string };
        if (step.config.unsubscribed !== undefined)
          config.unsubscribed = step.config.unsubscribed as
            | boolean
            | { var: string };
        if (step.config.properties)
          config.properties = step.config.properties as Record<
            string,
            string | number | boolean | null | { var: string }
          >;

        steps.push({
          id: step.key,
          type: 'contact_update',
          config,
          next,
        });
        break;
      }
    }
  }

  return { trigger, steps };
}
