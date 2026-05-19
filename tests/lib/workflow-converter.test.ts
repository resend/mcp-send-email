import { describe, expect, it } from 'vitest';
import {
  sdkResponseToWorkflow,
  type WorkflowDefinition,
  workflowToSdkOptions,
} from '../../src/lib/workflow-converter.js';

describe('workflowToSdkOptions', () => {
  it('converts a linear workflow', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger',
          type: 'trigger',
          config: { eventName: 'user.created' },
          next: 'delay_1',
        },
        {
          key: 'delay_1',
          type: 'delay',
          config: { duration: '1 hour' },
          next: 'send_email_1',
        },
        {
          key: 'send_email_1',
          type: 'send_email',
          config: { template: { id: 'tmpl_123' } },
          next: null,
        },
      ],
    };

    const { steps, connections } = workflowToSdkOptions(workflow);

    expect(steps).toHaveLength(3);
    expect(steps[0]).toEqual({
      key: 'trigger',
      type: 'trigger',
      config: { eventName: 'user.created' },
    });
    expect(steps[1]).toEqual({
      key: 'delay_1',
      type: 'delay',
      config: { duration: '1 hour' },
    });

    expect(connections).toHaveLength(2);
    expect(connections[0]).toEqual({ from: 'trigger', to: 'delay_1' });
    expect(connections[1]).toEqual({ from: 'delay_1', to: 'send_email_1' });
  });

  it('converts a branching workflow with condition', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger',
          type: 'trigger',
          config: { eventName: 'trial.ended' },
          next: 'condition_1',
        },
        {
          key: 'condition_1',
          type: 'condition',
          config: {
            type: 'rule',
            field: 'event.converted',
            operator: 'eq',
            value: true,
          },
          branches: {
            condition_met: 'send_email_1',
            condition_not_met: 'send_email_2',
          },
        },
        {
          key: 'send_email_1',
          type: 'send_email',
          config: { template: { id: 'tmpl_a' } },
          next: null,
        },
        {
          key: 'send_email_2',
          type: 'send_email',
          config: { template: { id: 'tmpl_b' } },
          next: null,
        },
      ],
    };

    const { steps, connections } = workflowToSdkOptions(workflow);

    expect(steps).toHaveLength(4);
    // Config passes through as-is
    expect(steps[1]).toEqual({
      key: 'condition_1',
      type: 'condition',
      config: {
        type: 'rule',
        field: 'event.converted',
        operator: 'eq',
        value: true,
      },
    });

    expect(connections).toHaveLength(3);
    expect(connections[1]).toEqual({
      from: 'condition_1',
      to: 'send_email_1',
      type: 'condition_met',
    });
    expect(connections[2]).toEqual({
      from: 'condition_1',
      to: 'send_email_2',
      type: 'condition_not_met',
    });
  });

  it('converts a workflow with wait_for_event branches', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger',
          type: 'trigger',
          config: { eventName: 'user.created' },
          next: 'wait_1',
        },
        {
          key: 'wait_1',
          type: 'wait_for_event',
          config: { eventName: 'resend:email.opened', timeout: '3 days' },
          branches: { event_received: null, timeout: 'send_email_1' },
        },
        {
          key: 'send_email_1',
          type: 'send_email',
          config: { template: { id: 'tmpl_1' } },
          next: null,
        },
      ],
    };

    const { connections } = workflowToSdkOptions(workflow);

    // null branches should not produce connections
    expect(connections).toHaveLength(2);
    expect(connections[1]).toEqual({
      from: 'wait_1',
      to: 'send_email_1',
      type: 'timeout',
    });
  });

  it('throws on missing trigger step', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'delay_1',
          type: 'delay',
          config: { duration: '1 hour' },
          next: null,
        },
      ],
    };

    expect(() => workflowToSdkOptions(workflow)).toThrow(
      'Workflow must have exactly one "trigger" step.',
    );
  });

  it('throws on multiple trigger steps', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger_1',
          type: 'trigger',
          config: { eventName: 'a' },
          next: null,
        },
        {
          key: 'trigger_2',
          type: 'trigger',
          config: { eventName: 'b' },
          next: null,
        },
      ],
    };

    expect(() => workflowToSdkOptions(workflow)).toThrow(
      'must have exactly one "trigger" step, but found 2',
    );
  });

  it('throws on duplicate step keys', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger',
          type: 'trigger',
          config: { eventName: 'a' },
          next: 'step_1',
        },
        {
          key: 'step_1',
          type: 'delay',
          config: { duration: '1 hour' },
          next: null,
        },
        {
          key: 'step_1',
          type: 'send_email',
          config: { template: { id: 'tmpl_1' } },
          next: null,
        },
      ],
    };

    expect(() => workflowToSdkOptions(workflow)).toThrow(
      'Duplicate step keys: step_1',
    );
  });

  it('throws on dangling next reference', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger',
          type: 'trigger',
          config: { eventName: 'a' },
          next: 'nonexistent',
        },
      ],
    };

    expect(() => workflowToSdkOptions(workflow)).toThrow(
      'references unknown step "nonexistent"',
    );
  });

  it('throws on dangling branch reference', () => {
    const workflow: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger',
          type: 'trigger',
          config: { eventName: 'a' },
          next: 'cond_1',
        },
        {
          key: 'cond_1',
          type: 'condition',
          config: { type: 'rule', field: 'event.x', operator: 'eq', value: 1 },
          branches: { condition_met: 'missing', condition_not_met: null },
        },
      ],
    };

    expect(() => workflowToSdkOptions(workflow)).toThrow(
      'references unknown step "missing"',
    );
  });
});

describe('sdkResponseToWorkflow', () => {
  it('reconstructs a linear workflow from SDK response', () => {
    const steps = [
      {
        key: 'trigger',
        type: 'trigger' as const,
        config: { eventName: 'user.created' },
      },
      {
        key: 'delay_1',
        type: 'delay' as const,
        config: { duration: '1 hour' },
      },
      {
        key: 'send_1',
        type: 'send_email' as const,
        config: { template: { id: 'tmpl_1' } },
      },
    ];
    const connections = [
      { from: 'trigger', to: 'delay_1', type: 'default' as const },
      { from: 'delay_1', to: 'send_1', type: 'default' as const },
    ];

    const workflow = sdkResponseToWorkflow(steps, connections);

    expect(workflow.steps).toHaveLength(3);
    expect(workflow.steps[0]).toEqual({
      key: 'trigger',
      type: 'trigger',
      config: { eventName: 'user.created' },
      next: 'delay_1',
    });
    expect(workflow.steps[2]).toEqual({
      key: 'send_1',
      type: 'send_email',
      config: { template: { id: 'tmpl_1' } },
      next: null,
    });
  });

  it('reconstructs branching steps from SDK response', () => {
    const steps = [
      { key: 'trigger', type: 'trigger' as const, config: { eventName: 'a' } },
      {
        key: 'cond_1',
        type: 'condition' as const,
        config: { type: 'rule', field: 'event.x', operator: 'eq', value: 1 },
      },
      {
        key: 'send_1',
        type: 'send_email' as const,
        config: { template: { id: 'tmpl_a' } },
      },
    ];
    const connections = [
      { from: 'trigger', to: 'cond_1', type: 'default' as const },
      { from: 'cond_1', to: 'send_1', type: 'condition_met' as const },
    ];

    const workflow = sdkResponseToWorkflow(steps, connections);

    expect(workflow.steps[1]).toEqual({
      key: 'cond_1',
      type: 'condition',
      config: { type: 'rule', field: 'event.x', operator: 'eq', value: 1 },
      branches: { condition_met: 'send_1', condition_not_met: null },
    });
  });

  it('reconstructs wait_for_event branches', () => {
    const steps = [
      { key: 'trigger', type: 'trigger' as const, config: { eventName: 'a' } },
      {
        key: 'wait_1',
        type: 'wait_for_event' as const,
        config: { eventName: 'b', timeout: '1 hour' },
      },
      {
        key: 'send_1',
        type: 'send_email' as const,
        config: { template: { id: 't' } },
      },
    ];
    const connections = [
      { from: 'trigger', to: 'wait_1', type: 'default' as const },
      { from: 'wait_1', to: 'send_1', type: 'timeout' as const },
    ];

    const workflow = sdkResponseToWorkflow(steps, connections);

    expect(workflow.steps[1]).toEqual({
      key: 'wait_1',
      type: 'wait_for_event',
      config: { eventName: 'b', timeout: '1 hour' },
      branches: { event_received: null, timeout: 'send_1' },
    });
  });
});

describe('round-trip', () => {
  it('workflow -> SDK -> workflow preserves structure', () => {
    const original: WorkflowDefinition = {
      steps: [
        {
          key: 'trigger',
          type: 'trigger',
          config: { eventName: 'user.created' },
          next: 'delay_1',
        },
        {
          key: 'delay_1',
          type: 'delay',
          config: { duration: '2 days' },
          next: 'condition_1',
        },
        {
          key: 'condition_1',
          type: 'condition',
          config: {
            type: 'rule',
            field: 'event.plan',
            operator: 'eq',
            value: 'pro',
          },
          branches: { condition_met: 'send_email_1', condition_not_met: null },
        },
        {
          key: 'send_email_1',
          type: 'send_email',
          config: { template: { id: 'tmpl_1' } },
          next: null,
        },
      ],
    };

    const { steps, connections } = workflowToSdkOptions(original);
    const roundTripped = sdkResponseToWorkflow(
      steps.map((s) => ({
        key: s.key,
        type: s.type,
        config: s.config as Record<string, unknown>,
      })),
      connections.map((c) => ({
        from: c.from,
        to: c.to,
        type: c.type ?? 'default',
      })),
    );

    expect(roundTripped).toEqual(original);
  });
});
