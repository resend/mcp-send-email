import vm from 'node:vm';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getResolvedOpenApiSpec } from '../openapi/loader.js';

const RESEND_API_BASE = 'https://api.resend.com';

/** Operation metadata derived from resolved OpenAPI spec for request(). */
interface OpMeta {
  pathParamNames: string[];
  queryParamNames: string[];
  hasBody: boolean;
  bodyIsArray: boolean;
}

function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

function deepSnakeKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => deepSnakeKeys(item));
  if (!value || typeof value !== 'object') return value;

  const out: Record<string, unknown> = {};
  for (const [key, next] of Object.entries(value as Record<string, unknown>)) {
    out[toSnakeCase(key)] = deepSnakeKeys(next);
  }
  return out;
}

/** Build op meta map from resolved spec: key = "METHOD:path" e.g. "GET:/emails". */
function getOpMetaMap(spec: Record<string, unknown>): Map<string, OpMeta> {
  const map = new Map<string, OpMeta>();
  const paths = spec.paths as
    | Record<string, Record<string, Record<string, unknown>>>
    | undefined;
  if (!paths) return map;

  const methods = ['get', 'post', 'patch', 'delete'] as const;
  for (const [path, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of methods) {
      const op = pathItem[method];
      if (!op || typeof op !== 'object') continue;

      const params =
        (op.parameters as Array<{ in?: string; name?: string }>) ?? [];
      const pathParamNames = params
        .filter((p) => p.in === 'path')
        .map((p) => p.name!)
        .filter(Boolean);
      const queryParamNames = params
        .filter((p) => p.in === 'query')
        .map((p) => p.name!)
        .filter(Boolean);

      let hasBody = false;
      let bodyIsArray = false;
      const rb = op.requestBody as Record<string, unknown> | undefined;
      if (rb?.content) {
        const json = (rb.content as Record<string, unknown>)[
          'application/json'
        ] as Record<string, unknown> | undefined;
        if (json?.schema) {
          hasBody = true;
          const schema = json.schema as Record<string, unknown>;
          bodyIsArray = schema.type === 'array';
        }
      }

      const key = `${method.toUpperCase()}:${path}`;
      map.set(key, { pathParamNames, queryParamNames, hasBody, bodyIsArray });
    }
  }
  return map;
}

/** Snake-case param key lookup: params.email_id, params.emailId, params.id for email_id. */
function getParam(params: Record<string, unknown>, specName: string): unknown {
  const camel = specName.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  const aliases: string[] = [specName, camel];
  if (specName === 'email_id') aliases.push('emailId', 'id');
  if (specName === 'domain_id') aliases.push('domainId', 'id');
  for (const k of aliases) {
    if (Object.prototype.hasOwnProperty.call(params, k)) return params[k];
  }
  return undefined;
}

/** Apply sender/reply-to defaults to a body object for send/broadcast. */
function applyEmailDefaultsToBody(
  body: Record<string, unknown>,
  defaults: { senderEmailAddress?: string; replierEmailAddresses: string[] },
): void {
  if (
    body.from === undefined &&
    body.from_address === undefined &&
    defaults.senderEmailAddress
  ) {
    body.from = defaults.senderEmailAddress;
  }
  if (
    body.reply_to === undefined &&
    body.replyTo === undefined &&
    defaults.replierEmailAddresses.length > 0
  ) {
    body.reply_to = defaults.replierEmailAddresses;
  }
}

const BATCH_MAX = 100;

async function doRequest(
  apiKey: string,
  method: string,
  pathTemplate: string,
  params: Record<string, unknown>,
  body: unknown,
  opMeta: OpMeta,
  defaults: { senderEmailAddress?: string; replierEmailAddresses: string[] },
  requestTimeoutMs: number,
): Promise<unknown> {
  let path = pathTemplate;
  const query = new URLSearchParams();
  let payload: unknown;
  let idempotencyKey: string | undefined;

  const paramsCopy = { ...params };
  if (body && typeof body === 'object' && !Array.isArray(body)) {
    Object.assign(paramsCopy, body as Record<string, unknown>);
  }

  if (opMeta.bodyIsArray && pathTemplate === '/emails/batch') {
    let emails: unknown[];
    if (Array.isArray(body)) {
      emails = body;
    } else if (body && typeof body === 'object' && !Array.isArray(body)) {
      const obj = body as Record<string, unknown>;
      const raw = obj.emails ?? obj.data ?? obj.batch;
      if (!Array.isArray(raw)) {
        throw new Error(
          'resend.request to /emails/batch expects body to be an array of email payloads or an object with "emails" array',
        );
      }
      emails = raw;
      const key = obj.idempotencyKey ?? obj.idempotency_key;
      idempotencyKey =
        key !== undefined && key !== null && String(key).trim() !== ''
          ? String(key).trim()
          : undefined;
    } else {
      throw new Error(
        'resend.request to /emails/batch expects body to be an array or object with "emails"',
      );
    }
    if (emails.length > BATCH_MAX) {
      throw new Error(
        `Batch accepts at most ${BATCH_MAX} emails, got ${emails.length}`,
      );
    }
    if (emails.length === 0) {
      throw new Error('Batch requires at least one email');
    }
    payload = (emails as Record<string, unknown>[]).map((item) =>
      deepSnakeKeys(item),
    );
  } else {
    for (const name of opMeta.pathParamNames) {
      const value = getParam(paramsCopy, name);
      if (value === undefined || value === null || `${value}`.trim() === '') {
        throw new Error(`Missing path parameter: ${name}`);
      }
      path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
    }
    for (const name of opMeta.queryParamNames) {
      const value = getParam(paramsCopy, name);
      if (value === undefined || value === null || value === '') continue;
      query.set(name, String(value));
    }
    idempotencyKey = (getParam(paramsCopy, 'idempotencyKey') ??
      getParam(paramsCopy, 'idempotency_key')) as string | undefined;
    if (idempotencyKey != null && String(idempotencyKey).trim() === '')
      idempotencyKey = undefined;

    if (
      opMeta.hasBody &&
      body &&
      typeof body === 'object' &&
      !Array.isArray(body)
    ) {
      const bodyObj = { ...(body as Record<string, unknown>) };
      if (
        pathTemplate === '/emails' ||
        pathTemplate.startsWith('/broadcasts')
      ) {
        applyEmailDefaultsToBody(bodyObj, defaults);
      }
      delete bodyObj.idempotencyKey;
      delete bodyObj.idempotency_key;
      payload = deepSnakeKeys(bodyObj);
    }
  }

  const url = `${RESEND_API_BASE}${path}${query.toString() ? `?${query.toString()}` : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey
          ? { 'Idempotency-Key': String(idempotencyKey) }
          : {}),
      },
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text.trim() ? (JSON.parse(text) as unknown) : {};
    } catch {
      throw new Error(
        `Invalid JSON in response: ${text.slice(0, 200)}${text.length > 200 ? '...' : ''}`,
      );
    }

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`,
      );
    }

    return parsed;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function serializeResult(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === undefined) return 'undefined';

  const seen = new WeakSet<object>();
  return JSON.stringify(
    value,
    (_key, item) => {
      if (typeof item === 'bigint') return item.toString();
      if (typeof item === 'function') return '[function]';
      if (item && typeof item === 'object') {
        if (seen.has(item as object)) return '[circular]';
        seen.add(item as object);
      }
      return item;
    },
    2,
  );
}

function deepFreezeObject<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== 'object') return value;
  const obj = value as object;
  if (seen.has(obj)) return value;
  seen.add(obj);
  Object.freeze(obj);
  for (const prop of Object.values(obj as Record<string, unknown>)) {
    if (prop && typeof prop === 'object') {
      deepFreezeObject(prop as never, seen);
    }
  }
  return value;
}

/** Build resend.request({ method, path, params?, body? }) from resolved OpenAPI spec (Code Mode standard). */
function buildResendRequest(
  opMetaMap: Map<string, OpMeta>,
  ctx: {
    apiKey: string;
    defaults: { senderEmailAddress?: string; replierEmailAddresses: string[] };
    counters: { apiCalls: number; maxApiCalls: number };
    requestTimeoutMs: number;
  },
): {
  request: (opts: {
    method: string;
    path: string;
    params?: Record<string, unknown>;
    body?: unknown;
  }) => Promise<unknown>;
} {
  return {
    async request(opts) {
      const { method, path, params = {}, body } = opts;
      const upper = method.toUpperCase();
      const key = `${upper}:${path}`;
      const opMeta = opMetaMap.get(key);
      if (!opMeta) {
        throw new Error(
          `Unknown operation: ${upper} ${path}. Use search-resend-api to discover paths from the OpenAPI spec.`,
        );
      }
      ctx.counters.apiCalls += 1;
      if (ctx.counters.apiCalls > ctx.counters.maxApiCalls) {
        throw new Error(
          `Maximum API calls exceeded (${ctx.counters.maxApiCalls}). Refine logic or increase limit.`,
        );
      }
      return doRequest(
        ctx.apiKey,
        upper,
        path,
        params,
        body,
        opMeta,
        ctx.defaults,
        ctx.requestTimeoutMs,
      );
    },
  };
}

export function addCodeModeTools(
  server: McpServer,
  {
    apiKey,
    senderEmailAddress,
    replierEmailAddresses,
  }: {
    apiKey?: string;
    senderEmailAddress?: string;
    replierEmailAddresses: string[];
  },
) {
  server.registerTool(
    'search-resend-api',
    {
      title: 'Search Resend OpenAPI (Code Mode)',
      description:
        'Discover Resend API endpoints by running JavaScript against the OpenAPI spec. Your code runs as the body of an async function. The variable `spec` is in scope. Use a top-level return for the result. Do not pass an arrow function: pass only statements (e.g. return Object.keys(spec.paths);).',
      inputSchema: {
        code: z
          .string()
          .min(1)
          .describe(
            'JavaScript: top-level statements only. `spec` is in scope. End with return <value>. Wrong: async (spec) => { return x; }. Right: return Object.keys(spec.paths);',
          ),
        timeoutMs: z
          .number()
          .int()
          .min(100)
          .max(15_000)
          .default(5_000)
          .optional()
          .describe('Execution timeout in milliseconds.'),
      },
    },
    async ({ code, timeoutMs }) => {
      const spec = await getResolvedOpenApiSpec();

      const logs: string[] = [];
      const safeConsole = {
        log: (...args: unknown[]) =>
          logs.push(
            args
              .map((a) =>
                typeof a === 'object' ? JSON.stringify(a) : String(a),
              )
              .join(' '),
          ),
        info: (...args: unknown[]) =>
          logs.push(
            args
              .map((a) =>
                typeof a === 'object' ? JSON.stringify(a) : String(a),
              )
              .join(' '),
          ),
        warn: (...args: unknown[]) =>
          logs.push(
            args
              .map((a) =>
                typeof a === 'object' ? JSON.stringify(a) : String(a),
              )
              .join(' '),
          ),
        error: (...args: unknown[]) =>
          logs.push(
            args
              .map((a) =>
                typeof a === 'object' ? JSON.stringify(a) : String(a),
              )
              .join(' '),
          ),
      };

      const context = vm.createContext({
        spec: deepFreezeObject(spec),
        console: deepFreezeObject(safeConsole),
        process: undefined,
        require: undefined,
        module: undefined,
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        clearTimeout: undefined,
        clearInterval: undefined,
        clearImmediate: undefined,
      } as Record<string, unknown>);

      const wrappedCode = `'use strict';\n(async () => {\n${code}\n})()`;
      const script = new vm.Script(wrappedCode, {
        filename: 'resend-search-code-mode.vm.js',
      });

      let result: unknown;
      try {
        const executionTimeoutMs = timeoutMs ?? 5_000;
        const executionPromise = script.runInContext(context, {
          timeout: executionTimeoutMs,
        }) as Promise<unknown>;
        executionPromise.catch(() => {});

        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () =>
              reject(
                new Error(`Search timed out after ${executionTimeoutMs}ms`),
              ),
            executionTimeoutMs,
          );
        });

        try {
          result = await Promise.race([executionPromise, timeoutPromise]);
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: [
                'Search failed.',
                `Error: ${message}`,
                logs.length > 0 ? `Logs:\n${logs.join('\n')}` : '',
              ].join('\n\n'),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: [
              'Search result:',
              '',
              serializeResult(result),
              logs.length > 0 ? `\nLogs:\n${logs.join('\n')}` : '',
            ].join('\n'),
          },
        ],
      };
    },
  );

  server.registerTool(
    'execute-resend-code',
    {
      title: 'Execute Resend Code (Code Mode)',
      description:
        'Execute JavaScript against the Resend API. Your code runs as the body of an async function. The variable `resend` is in scope (resend.request({ method, path, params?, body? })). Use a top-level return for the result. Do not pass an arrow function: pass only statements. Optional: input, helpers, console.',
      inputSchema: {
        code: z
          .string()
          .min(1)
          .describe(
            'JavaScript: top-level statements only. `resend` is in scope. End with return <value>. Wrong: async () => { return await resend.request(...); }. Right: return await resend.request({ method, path, body });',
          ),
        input: z
          .record(z.string(), z.unknown())
          .optional()
          .describe('Optional JSON object available to script as `input`.'),
        timeoutMs: z
          .number()
          .int()
          .min(100)
          .max(30_000)
          .default(10_000)
          .optional()
          .describe('VM execution timeout in milliseconds.'),
        requestTimeoutMs: z
          .number()
          .int()
          .min(100)
          .max(30_000)
          .default(15_000)
          .optional()
          .describe('Per HTTP request timeout in milliseconds.'),
        maxApiCalls: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(25)
          .optional()
          .describe('Maximum API calls this run can make.'),
      },
    },
    async ({ code, input, timeoutMs, requestTimeoutMs, maxApiCalls }) => {
      if (!apiKey || !apiKey.trim()) {
        throw new Error(
          'No API key available for Code Mode. Provide RESEND_API_KEY (stdio) or Authorization Bearer token (HTTP).',
        );
      }

      const spec = await getResolvedOpenApiSpec();
      const opMetaMap = getOpMetaMap(spec);
      const counters = { apiCalls: 0, maxApiCalls: maxApiCalls ?? 25 };
      const resend = buildResendRequest(opMetaMap, {
        apiKey,
        defaults: { senderEmailAddress, replierEmailAddresses },
        counters,
        requestTimeoutMs: requestTimeoutMs ?? 15_000,
      });

      const logs: string[] = [];
      const safeConsole = {
        log: (...args: unknown[]) =>
          logs.push(args.map(serializeResult).join(' ')),
        info: (...args: unknown[]) =>
          logs.push(args.map(serializeResult).join(' ')),
        warn: (...args: unknown[]) =>
          logs.push(args.map(serializeResult).join(' ')),
        error: (...args: unknown[]) =>
          logs.push(args.map(serializeResult).join(' ')),
      };

      const helpers = {
        nowIso: () => new Date().toISOString(),
        assert: (condition: unknown, message = 'Assertion failed') => {
          if (!condition) throw new Error(message);
        },
      };

      const sandboxResend = deepFreezeObject(resend);
      const sandboxHelpers = deepFreezeObject(helpers);
      const sandboxConsole = deepFreezeObject(safeConsole);

      const context = vm.createContext({
        // Restrict global to Code Mode surface only (no process, require, timers).
        resend: sandboxResend,
        input: input ?? {},
        helpers: sandboxHelpers,
        console: sandboxConsole,
        process: undefined,
        require: undefined,
        module: undefined,
        setTimeout: undefined,
        setInterval: undefined,
        setImmediate: undefined,
        clearTimeout: undefined,
        clearInterval: undefined,
        clearImmediate: undefined,
      } as Record<string, unknown>);

      const wrappedCode = `'use strict';\n(async () => {\n${code}\n})()`;
      const script = new vm.Script(wrappedCode, {
        filename: 'resend-execute-code-mode.vm.js',
      });

      let result: unknown;
      try {
        const executionTimeoutMs = timeoutMs ?? 10_000;
        const executionPromise = script.runInContext(context, {
          timeout: executionTimeoutMs,
        }) as Promise<unknown>;
        executionPromise.catch(() => {});

        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () =>
              reject(
                new Error(
                  `Code execution timed out after ${executionTimeoutMs}ms`,
                ),
              ),
            executionTimeoutMs,
          );
        });

        try {
          result = await Promise.race([executionPromise, timeoutPromise]);
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown execution error';
        return {
          content: [
            {
              type: 'text',
              text: [
                'Code execution failed.',
                `Error: ${message}`,
                `API calls made: ${counters.apiCalls}`,
                logs.length > 0 ? `Logs:\n${logs.join('\n')}` : 'Logs: (none)',
              ].join('\n\n'),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: [
              'Code executed successfully.',
              `API calls made: ${counters.apiCalls}`,
              '',
              `Result:\n${serializeResult(result)}`,
              '',
              logs.length > 0 ? `Logs:\n${logs.join('\n')}` : 'Logs: (none)',
            ].join('\n'),
          },
        ],
      };
    },
  );
}
