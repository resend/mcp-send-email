import type {
  AutomationConnection,
  AutomationConnectionType,
  AutomationResponseConnection,
  AutomationResponseStep,
  AutomationStep,
} from 'resend';

// Steps use SDK types directly. The only abstraction is `next`/`branches`
// instead of a separate connections array — easier for LLMs to construct.

interface LinearStep {
  key: string;
  type: string;
  config: Record<string, unknown>;
  next: string | null;
}

interface BranchingStep {
  key: string;
  type: string;
  config: Record<string, unknown>;
  branches: Record<string, string | null>;
}

type WorkflowStep = LinearStep | BranchingStep;

export interface WorkflowDefinition {
  steps: WorkflowStep[];
}

// Step types that use branches instead of next
const BRANCHING_STEP_TYPES: Record<string, string[]> = {
  condition: ['condition_met', 'condition_not_met'],
  wait_for_event: ['event_received', 'timeout'],
};

function hasBranches(step: WorkflowStep): step is BranchingStep {
  return 'branches' in step;
}

// -- Workflow → SDK options (extract next/branches into connections) --

export function workflowToSdkOptions(workflow: WorkflowDefinition): {
  steps: AutomationStep[];
  connections: AutomationConnection[];
} {
  const stepKeys = new Set(workflow.steps.map((s) => s.key));
  const steps: AutomationStep[] = [];
  const connections: AutomationConnection[] = [];

  for (const step of workflow.steps) {
    // Pass config through to SDK as-is
    steps.push({
      key: step.key,
      type: step.type,
      config: step.config,
    } as AutomationStep);

    if (hasBranches(step)) {
      for (const [branchType, target] of Object.entries(step.branches)) {
        if (target) {
          if (!stepKeys.has(target)) {
            throw new Error(
              `Step "${step.key}" references unknown step "${target}" in branches.${branchType}. Available steps: ${[...stepKeys].join(', ')}`,
            );
          }
          connections.push({
            from: step.key,
            to: target,
            type: branchType as AutomationConnectionType,
          });
        }
      }
    } else {
      if (step.next) {
        if (!stepKeys.has(step.next)) {
          throw new Error(
            `Step "${step.key}" references unknown step "${step.next}" in next. Available steps: ${[...stepKeys].join(', ')}`,
          );
        }
        connections.push({ from: step.key, to: step.next });
      }
    }
  }

  return { steps, connections };
}

// -- SDK response → Workflow (reconstruct next/branches from connections) --

export function sdkResponseToWorkflow(
  responseSteps: AutomationResponseStep[],
  responseConnections: AutomationResponseConnection[],
): WorkflowDefinition {
  // Index connections by source step key
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

  const steps: WorkflowStep[] = [];

  for (const step of responseSteps) {
    const conns = connectionsByFrom.get(step.key);
    const branchTypes = BRANCHING_STEP_TYPES[step.type];

    if (branchTypes) {
      const branches: Record<string, string | null> = {};
      for (const bt of branchTypes) {
        branches[bt] = conns?.get(bt as AutomationConnectionType) ?? null;
      }
      steps.push({
        key: step.key,
        type: step.type,
        config: step.config,
        branches,
      });
    } else {
      steps.push({
        key: step.key,
        type: step.type,
        config: step.config,
        next: conns?.get('default') ?? null,
      });
    }
  }

  return { steps };
}
