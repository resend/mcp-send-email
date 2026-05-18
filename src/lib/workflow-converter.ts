import type {
  AutomationConnection,
  AutomationConnectionType,
  AutomationResponseConnection,
  AutomationResponseStep,
  AutomationStep,
  AutomationStepType,
} from 'resend';

/**
 * Workflow Definition Format
 *
 * This module provides a human-friendly workflow abstraction for LLMs to construct
 * automation workflows. It converts between two representations:
 *
 * 1. WorkflowDefinition (LLM-friendly):
 *    - Uses "next" for linear steps and "branches" for conditional splits
 *    - Easier to read and construct than connection arrays
 *
 * 2. SDK options (server format):
 *    - Separate "steps" array and "connections" array
 *    - Native format expected by Resend API
 *
 * Key validation:
 * - Exactly one "trigger" step required
 * - No duplicate step keys
 * - All referenced steps must exist
 * - No circular references (cycle detection prevents infinite loops)
 * - Tree-shaped workflows (no merging branches back together)
 *
 * Example WorkflowDefinition:
 * {
 *   steps: [
 *     { key: "trigger", type: "trigger", config: { eventName: "user.created" }, next: "delay_1" },
 *     { key: "delay_1", type: "delay", config: { duration: "1 day" }, next: "send_1" },
 *     { key: "send_1", type: "send_email", config: { template: { id: "t1" } }, next: null }
 *   ]
 * }
 */

interface LinearStep {
  key: string;
  type: AutomationStepType;
  config: Record<string, unknown>;
  next: string | null;
}

interface BranchingStep {
  key: string;
  type: AutomationStepType;
  config: Record<string, unknown>;
  branches: Record<string, string | null>;
}

type WorkflowStep = LinearStep | BranchingStep;

export interface WorkflowDefinition {
  steps: WorkflowStep[];
}

// Step types that use branches instead of next
const BRANCHING_STEP_TYPES = {
  condition: ['condition_met', 'condition_not_met'],
  wait_for_event: ['event_received', 'timeout'],
} as const satisfies Partial<
  Record<AutomationStepType, readonly AutomationConnectionType[]>
>;

function hasBranches(step: WorkflowStep): step is BranchingStep {
  return 'branches' in step;
}

/**
 * Detect cycles in the workflow graph using depth-first search (DFS).
 *
 * Cycles are problematic in automation workflows because they create infinite loops.
 * A cycle occurs when following the "next" or "branches" connections leads back to
 * a previously visited step.
 *
 * Algorithm:
 * 1. Use DFS with backtracking to traverse the workflow graph
 * 2. Track three states: visited (explored), recursion stack (currently visiting)
 * 3. If we encounter a node in the recursion stack, a cycle exists
 * 4. Return the cycle path for clear error messaging
 *
 * Examples of cycles:
 * - Self-loop: step_1.next = step_1
 * - 2-step: step_1.next = step_2, step_2.next = step_1
 * - 3-step: condition branches to delay, delay loops back to condition
 *
 * Time complexity: O(V + E) where V = steps, E = connections
 * Space complexity: O(V) for recursion stack
 *
 * @param connections - All connections in the workflow
 * @param stepKeys - Set of all valid step keys
 * @returns Array representing cycle path (e.g., ["step_a", "step_b", "step_a"]),
 *          or null if no cycle found
 */
function detectCycle(
  connections: AutomationConnection[],
  stepKeys: Set<string>,
): string[] | null {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const _parent = new Map<string, string>();

  // Build adjacency list
  const adj = new Map<string, string[]>();
  for (const key of stepKeys) {
    adj.set(key, []);
  }
  for (const conn of connections) {
    adj.get(conn.from)?.push(conn.to);
  }

  function dfs(node: string, path: string[]): string[] | null {
    visited.add(node);
    recursionStack.add(node);
    const newPath = [...path, node];

    for (const neighbor of adj.get(node) || []) {
      if (!visited.has(neighbor)) {
        const result = dfs(neighbor, newPath);
        if (result) return result;
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle
        const cycleStart = newPath.indexOf(neighbor);
        return newPath.slice(cycleStart).concat([neighbor]);
      }
    }

    recursionStack.delete(node);
    return null;
  }

  // Check from each unvisited node
  for (const node of stepKeys) {
    if (!visited.has(node)) {
      const cycle = dfs(node, []);
      if (cycle) return cycle;
    }
  }

  return null;
}

// -- Workflow → SDK options (extract next/branches into connections) --

export function workflowToSdkOptions(workflow: WorkflowDefinition): {
  steps: AutomationStep[];
  connections: AutomationConnection[];
} {
  const triggers = workflow.steps.filter((s) => s.type === 'trigger');
  if (triggers.length === 0) {
    throw new Error('Workflow must have exactly one "trigger" step.');
  }
  if (triggers.length > 1) {
    throw new Error(
      `Workflow must have exactly one "trigger" step, but found ${triggers.length}.`,
    );
  }

  const keys = workflow.steps.map((s) => s.key);
  const stepKeys = new Set(keys);
  if (stepKeys.size !== keys.length) {
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    throw new Error(`Duplicate step keys: ${[...new Set(dupes)].join(', ')}`);
  }

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

  // Check for cycles in the workflow
  const cycle = detectCycle(connections, stepKeys);
  if (cycle) {
    throw new Error(
      `Workflow contains a cycle. Steps cannot loop back to themselves. Detected cycle: ${cycle.join(' → ')}`,
    );
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
    const branchTypes =
      BRANCHING_STEP_TYPES[step.type as keyof typeof BRANCHING_STEP_TYPES];

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
