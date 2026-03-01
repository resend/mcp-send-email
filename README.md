# Resend MCP Server

[![smithery badge](https://smithery.ai/badge/@resend/resend-mcp)](https://smithery.ai/server/@resend/resend-mcp)

An MCP server for the [Resend](https://resend.com/) platform. Send and receive emails, manage contacts, broadcasts, domains, and more — directly from any MCP client like Claude Desktop, Cursor, or Claude Code.

## Features

- **Emails** — Send, list, get, cancel, update, and batch send emails. Supports HTML, plain text, attachments (local file, URL, or base64), CC/BCC, reply-to, scheduling, tags, and topic-based sending.
- **Received Emails** — List and read inbound emails. List and download received email attachments.
- **Contacts** — Create, list, get, update, and remove contacts. Manage segment memberships and topic subscriptions. Supports custom contact properties.
- **Broadcasts** — Create, send, list, get, update, and remove broadcast campaigns. Supports scheduling, personalization placeholders, and preview text.
- **Domains** — Create, list, get, update, remove, and verify sender domains. Configure tracking, TLS, and sending/receiving capabilities.
- **Segments** — Create, list, get, and remove audience segments.
- **Topics** — Create, list, get, update, and remove subscription topics.
- **Contact Properties** — Create, list, get, update, and remove custom contact attributes.
- **API Keys** — Create, list, and remove API keys.
- **Webhooks** — Create, list, get, update, and remove webhooks for event notifications.
- **Code Mode** — Search REST method specs and execute sandboxed JavaScript that can orchestrate multi-step REST API flows.

## Setup

Create a free Resend account and [create an API key](https://resend.com/api-keys). To send to addresses outside of your own, you'll need to [verify your domain](https://resend.com/domains).

## Usage

The server supports two transport modes: **stdio** (default) and **HTTP**.

### Stdio Transport (Default)

#### Claude Code

```bash
claude mcp add resend -e RESEND_API_KEY=re_xxxxxxxxx -- npx -y resend-mcp
```

#### Cursor

Open the command palette and choose "Cursor Settings" > "MCP" > "Add new global MCP server".

```json
{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": {
        "RESEND_API_KEY": "re_xxxxxxxxx"
      }
    }
  }
}
```

#### Claude Desktop

Open Claude Desktop settings > "Developer" tab > "Edit Config".

```json
{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": {
        "RESEND_API_KEY": "re_xxxxxxxxx"
      }
    }
  }
}
```

### HTTP Transport

Run the server over HTTP for remote or web-based integrations. In HTTP mode, each client authenticates by passing their Resend API key as a Bearer token in the `Authorization` header.

Start the server:

```bash
npx -y resend-mcp --http --port 3000
```

The server will listen on `http://127.0.0.1:3000` and expose the MCP endpoint at `/mcp` using Streamable HTTP.

#### Claude Code

```bash
claude mcp add resend --transport http http://127.0.0.1:3000/mcp --header "Authorization: Bearer re_xxxxxxxxx"
```

#### Cursor

Open the command palette and choose "Cursor Settings" > "MCP" > "Add new global MCP server".

```json
{
  "mcpServers": {
    "resend": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer re_xxxxxxxxx"
      }
    }
  }
}
```

You can also set the port via the `MCP_PORT` environment variable:

```bash
MCP_PORT=3000 npx -y resend-mcp --http
```

### Options

You can pass additional arguments to configure the server:

- `--key`: Your Resend API key (stdio mode only; HTTP mode uses the Bearer token from the client)
- `--sender`: Default sender email address from a verified domain
- `--reply-to`: Default reply-to email address (can be specified multiple times)
- `--http`: Use HTTP transport instead of stdio (default: stdio)
- `--code-mode-only`: Expose only Code Mode tools (`search-resend-api`, `execute-resend-code`)
- `--port`: HTTP port when using `--http` (default: 3000, or `MCP_PORT` env var)

Environment variables:

- `RESEND_API_KEY`: Your Resend API key (required for stdio, optional for HTTP since clients pass it via Bearer token)
- `SENDER_EMAIL_ADDRESS`: Default sender email address from a verified domain (optional)
- `REPLY_TO_EMAIL_ADDRESSES`: Comma-separated reply-to email addresses (optional)
- `MCP_PORT`: HTTP port when using `--http` (optional)
- `RESEND_OPENAPI_SPEC_URL`: Optional URL for the Resend OpenAPI spec (e.g. `https://raw.githubusercontent.com/resend/resend-openapi/refs/heads/main/resend.yaml`). When set, Code Mode loads the spec from this URL instead of the bundled file so you can use the latest spec from GitHub.

### Code Mode

Code Mode uses two tools and the Resend OpenAPI spec (with all `$ref` s pre-resolved) as the single source of truth. This keeps the tool footprint small no matter how many endpoints exist.

- **`search-resend-api`**: Run JavaScript against the spec to discover endpoints. Your code runs as the body of an async function; `spec` is in scope. Use a top-level **return** for the result. Do not pass an arrow function—pass only statements. Right: `return Object.keys(spec.paths);` Wrong: `async (spec) => { return ... }`.
- **`execute-resend-code`**: Run JavaScript against the Resend API. Your code runs as the body of an async function; `resend` is in scope. Call `resend.request({ method, path, params?, body? })` and use a top-level **return** for the result. Do not pass an arrow function. Optional: `input`, `helpers`, `console`.

Example search (discover email endpoints):

```js
const results = [];
for (const [path, methods] of Object.entries(spec.paths)) {
  if (path.startsWith('/emails') && path !== '/emails/batch') {
    for (const [method, op] of Object.entries(methods)) {
      if (op && op.summary) results.push({ method: method.toUpperCase(), path, summary: op.summary });
    }
  }
}
return results;
```

Example execute (send an email):

```js
return await resend.request({
  method: 'POST',
  path: '/emails',
  body: { from: 'you@example.com', to: 'user@example.com', subject: 'Hi', text: 'Hello' },
});
```

### Code Mode pattern and security

This server uses the same **Code Mode** idea as [Cloudflare’s MCP post](https://blog.cloudflare.com/code-mode-mcp/) and [Anthropic’s code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp): two tools (search + execute), spec pre-resolved, single request API. There is no Cloudflare or Anthropic integration—only the Resend API.

- **Sandbox**: Code runs in a Node.js `vm` with only `spec` (search) or `resend`, `input`, `helpers`, `console` (execute). No `process`, `require`, or timers.
- **Execute**: Only `resend.request()` can do I/O; it calls the Resend API only. Timeouts and `maxApiCalls` apply.
- **Note**: Node’s `vm` is [not a security boundary](https://nodejs.org/api/vm.html#vm-executing-javascript). Fine for normal MCP use (your API key, your agent). For untrusted code, use a real isolate (e.g. separate process).

To test Code Mode as a full replacement for the granular tools:

```bash
npx -y resend-mcp --code-mode-only
```

> [!NOTE]
> If you don't provide a sender email address, the MCP server will ask you to provide one each time you call the tool.

## Local Development

1. Clone this project and build:

```
git clone https://github.com/resend/resend-mcp.git
pnpm install
pnpm run build
```

2. To use the local build, replace the `npx` command with the path to your local build:

**Claude Code (stdio):**

```bash
claude mcp add resend -e RESEND_API_KEY=re_xxxxxxxxx -- node ABSOLUTE_PATH_TO_PROJECT/dist/index.js
```

**Claude Code (HTTP):**

```bash
claude mcp add resend --transport http http://127.0.0.1:3000/mcp --header "Authorization: Bearer re_xxxxxxxxx"
```

**Cursor / Claude Desktop (stdio):**

```json
{
  "mcpServers": {
    "resend": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_PROJECT/dist/index.js"],
      "env": {
        "RESEND_API_KEY": "re_xxxxxxxxx"
      }
    }
  }
}
```

**Cursor (HTTP):**

```json
{
  "mcpServers": {
    "resend": {
      "url": "http://127.0.0.1:3000/mcp",
      "headers": {
        "Authorization": "Bearer re_xxxxxxxxx"
      }
    }
  }
}
```

### Testing with MCP Inspector

> **Note:** Make sure you've built the project first (see [Local Development](#local-development) section above).

#### Using Stdio Transport

1. Set your API key:

   ```bash
   export RESEND_API_KEY=re_your_key_here
   ```

2. Start the inspector:

   ```bash
   pnpm inspector
   ```

3. In the browser (Inspector UI):

   - Choose **stdio** (launch a process).
   - **Command:** `node`
   - **Args:** `dist/index.js` (or the full path to `dist/index.js`)
   - **Env:** `RESEND_API_KEY=re_your_key_here` (or leave blank if you already exported it in the same terminal).
   - Click **Connect**, then use "List tools" to verify the server is working.

#### Using HTTP Transport

1. Start the HTTP server in one terminal:

   ```bash
   node dist/index.js --http --port 3000
   ```

2. Start the inspector in another terminal:

   ```bash
   pnpm inspector
   ```

3. In the browser (Inspector UI):

   - Choose **Streamable HTTP** (connect to URL).
   - **URL:** `http://127.0.0.1:3000/mcp`
   - Add a header: `Authorization: Bearer re_your_key_here`
   - Click **Connect**, then use "List tools" to verify the server is working.
