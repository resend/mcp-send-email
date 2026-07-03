# Resend MCP Server

[![smithery badge](https://smithery.ai/badge/@resend/resend-mcp)](https://smithery.ai/server/@resend/resend-mcp)
[![npm version](https://img.shields.io/npm/v/resend-mcp)](https://www.npmjs.com/package/resend-mcp)

Connect your AI agent to the [Resend](https://resend.com/) platform. Send and receive emails, manage contacts, broadcasts, domains, and more, directly from any MCP client like Claude, Cursor, or Claude Code.

We offer both a [remote MCP server](#remote-mcp-server) hosted by Resend and a [local MCP server](#local-mcp-server) (this package).

## Remote MCP Server

Resend hosts the MCP server at:

```
https://mcp.resend.com
```

Connect any MCP client that supports remote servers (Streamable HTTP). There's nothing to install and no local process to run, which makes it the best option for web-based clients like Claude and hosted agent platforms.

When you connect, your client opens a browser window to log in to Resend and approve access using OAuth.

### Claude Code

```bash
claude mcp add --transport http resend https://mcp.resend.com
```

Then run `/mcp` in Claude Code and select **resend** to complete the OAuth login.

### Claude

In Claude (web or desktop), open **Settings** > **Connectors** > **Add custom connector** and enter:

```
https://mcp.resend.com
```

### Cursor

Open the command palette and choose "Cursor Settings" > "MCP" > "Add new global MCP server".

```json
{
  "mcpServers": {
    "resend": {
      "url": "https://mcp.resend.com"
    }
  }
}
```

### Codex

```bash
codex mcp add resend --url https://mcp.resend.com
```

### Copilot

To use GitHub Copilot in VS Code, add the following to your `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "resend": {
        "type": "http",
        "url": "https://mcp.resend.com"
      }
    }
  }
}
```

### Windsurf

```json
{
  "mcpServers": {
    "resend": {
      "serverUrl": "https://mcp.resend.com"
    }
  }
}
```

### Authenticating with an API key

If your client runs somewhere a browser login isn't possible (a server, CI, or a headless agent), pass a [Resend API key](https://resend.com/api-keys) as a Bearer token instead of using OAuth.

**Claude Code:**

```bash
claude mcp add --transport http resend https://mcp.resend.com --header "Authorization: Bearer re_xxxxxxxxx"
```

**JSON config** (Cursor, Windsurf, and others), add an `Authorization` header:

```json
{
  "mcpServers": {
    "resend": {
      "url": "https://mcp.resend.com",
      "headers": {
        "Authorization": "Bearer re_xxxxxxxxx"
      }
    }
  }
}
```

## Local MCP Server

The hosted server runs the same open-source code that's available on NPM as [`resend-mcp`](https://www.npmjs.com/package/resend-mcp). If you prefer to run the server yourself, you can integrate it into any supported MCP client using `npx`. You'll need to:

- [Create an API key](https://resend.com/api-keys)
- [Verify your domain](https://resend.com/domains)

The local server supports two transport modes: **stdio** (default) and **HTTP**.

Choose your preferred mode and client below to get started. Remember to replace `re_xxxxxxxxx` with your actual API key.

### Stdio Transport (Default)

#### Quick Setup

Install for all detected/selected agents and editors:

```bash
npx add-mcp resend-mcp --name resend --env "RESEND_API_KEY=re_xxxxxxxxx"
```

#### Claude Code

```bash
claude mcp add resend -e RESEND_API_KEY=re_xxxxxxxxx -- npx -y resend-mcp
```

#### Codex

```bash
codex mcp add resend \
  --env RESEND_API_KEY=re_xxxxxxxxx \
  -- npx -y resend-mcp
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

#### Copilot

To use GitHub Copilot in VS Code, add the following to your `settings.json`:

```json
{
  "mcp": {
    "servers": {
      "resend": {
        "command": "npx",
        "args": ["-y", "resend-mcp"],
        "env": {
          "RESEND_API_KEY": "re_xxxxxxxxx"
        }
      }
    }
  }
}
```

#### Gemini CLI

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

#### OpenCode

Add to your `opencode.json` config:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "resend": {
      "type": "local",
      "command": ["npx", "-y", "resend-mcp"],
      "enabled": true,
      "environment": {
        "RESEND_API_KEY": "re_xxxxxxxxx"
      }
    }
  }
}
```

#### Windsurf

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

#### Devin

In Devin, open **Settings** > **Connections** > **MCP Servers** and click **Add a custom MCP**. See the [Devin guide](https://resend.com/docs/guides/devin) for the full step-by-step.

```json
{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": {
        "RESEND_API_KEY": "re_xxxxxxxxx",
        "SENDER_EMAIL_ADDRESS": "onboarding@resend.dev"
      }
    }
  }
}
```

### HTTP Transport

Run the server over HTTP for remote or web-based integrations, for example behind your own tunnel or reverse proxy, instead of using Resend's [hosted remote MCP server](#remote-mcp-server). In HTTP mode, each client authenticates by passing their Resend API key as a Bearer token in the `Authorization` header.

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

#### Use as a library

The HTTP transport is also exported so it can be embedded in another service instead of being run via the CLI. Each connecting client authenticates with its own Resend API key passed as a Bearer token.

```ts
import { runHttp } from 'resend-mcp/http';

// Options are optional — pass `senderEmailAddress` / `replierEmailAddresses`
// to set defaults. Binds the port and returns the Node http.Server, exposing
// the MCP endpoint at POST/GET/DELETE /mcp and a GET /health check.
const server = await runHttp({}, 3000);
```

By default the server applies localhost-only `Host` validation (DNS-rebinding
protection). When deploying behind a reverse proxy or load balancer, where the
server is protected by the per-request Bearer API key, set `host` to `0.0.0.0`
so the proxy's forwarded `Host` and load-balancer health checks aren't rejected
with `403 Invalid Host`:

```ts
const server = await runHttp({}, 3000, { host: '0.0.0.0' });
// or pin specific hostnames instead of disabling validation:
const server = await runHttp({}, 3000, { allowedHosts: ['mcp.example.com'] });
```

Via the CLI this maps to `--host` / `--allowed-hosts` (or `MCP_HOST` /
`MCP_ALLOWED_HOSTS`).

### Options

You can pass additional arguments to configure the local server:

- `--key`: Your Resend API key (stdio mode only, since HTTP mode uses the Bearer token from the client)
- `--sender`: Default sender email address from a verified domain
- `--reply-to`: Default reply-to email address (can be specified multiple times)
- `--http`: Use HTTP transport instead of stdio (default: stdio)
- `--port`: HTTP port when using `--http` (default: 3000, or `MCP_PORT` env var)
- `--host`: Host for DNS-rebinding protection when using `--http` (default: `127.0.0.1`, or `MCP_HOST`). Set to `0.0.0.0` to disable `Host` validation behind a proxy/load balancer.
- `--allowed-hosts`: Comma-separated `Host` allow-list when using `--http` (or `MCP_ALLOWED_HOSTS`)

**Environment variables:**

- `RESEND_API_KEY`: Your Resend API key (required for stdio, optional for HTTP since clients pass it via Bearer token)
- `SENDER_EMAIL_ADDRESS`: Default sender email address from a verified domain (optional)
- `REPLY_TO_EMAIL_ADDRESSES`: Comma-separated reply-to email addresses (optional)
- `MCP_PORT`: HTTP port when using `--http` (optional)
- `MCP_HOST`: Host for DNS-rebinding protection when using `--http` (optional)
- `MCP_ALLOWED_HOSTS`: Comma-separated `Host` allow-list when using `--http` (optional)

> [!NOTE]
> If you don't provide a sender email address, the MCP server will ask you to provide one each time you call the tool.

## MCP Server Tools

Resend's MCP server gives your AI agent native access to the full Resend platform through a single integration. You can manage all aspects of your email infrastructure using natural language.

- **Emails**: Send, list, get, cancel, update, and batch send emails. Supports HTML, plain text, attachments (local file, URL, or base64), CC/BCC, reply-to, scheduling, tags, and topic-based sending.
- **Received Emails**: List and read inbound emails. List and download received email attachments.
- **Templates**: Create, list, get, update, publish, duplicate, and remove email templates. Supports composing template content and `{{{VARIABLE}}}` placeholders.
- **Contacts**: Create, list, get, update, and remove contacts. Manage segment memberships, topic subscriptions, and CSV contact imports. Supports custom contact properties.
- **Broadcasts**: Create, send, list, get, update, and remove broadcast campaigns. Supports scheduling, personalization placeholders, and preview text.
- **Automations**: Create, list, get, update, and remove automations. Review the runs of an automation.
- **Events**: Send events to trigger automations for a contact. Create, update, and remove event definitions.
- **Domains**: Create, list, get, update, remove, and verify sender domains. Configure tracking, TLS, and sending/receiving capabilities. Create and verify domain claims.
- **Segments**: Create, list, get, and remove audience segments.
- **Topics**: Create, list, get, update, and remove subscription topics.
- **Contact Properties**: Create, list, get, update, and remove custom contact attributes.
- **API Keys**: Create, list, and remove API keys.
- **Webhooks**: Create, list, get, update, and remove webhooks for event notifications.
- **Logs**: List and inspect API request logs, including full request and response bodies.
- **Editor**: Connect to (and disconnect from) the visual editor in the Resend dashboard, and read a draft's content while collaborating on broadcasts and templates.

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

### Live Testing with an MCP Client

When developing, you can test changes in a real MCP client session while editing code in another.

The idea: run `tsc --watch` to continuously rebuild `dist/`, and point a separate MCP client at the built `dist/index.js` from a different directory. When you want to pick up code changes, restart the MCP client session (MCP servers are long-lived stdio processes that don't hot-reload).

**Example with Claude Code:**

1. Run the TypeScript watcher to auto-rebuild on save:

   ```bash
   pnpm tsc --watch
   ```

2. In a separate directory, create a `.mcp.json` pointing at the build output:

   ```bash
   mkdir -p /tmp/mcp-test
   ```

   ```json
   // /tmp/mcp-test/.mcp.json
   {
     "mcpServers": {
       "resend-dev": {
         "command": "node",
         "args": ["/absolute/path/to/resend-mcp/dist/index.js"],
         "env": {
           "RESEND_API_KEY": "re_xxxxxxxxx"
         }
       }
     }
   }
   ```

3. Start Claude Code from that directory and use the MCP tools. After making code changes, start a new Claude Code session to pick up the new build.

The same principle applies to any MCP client — separate your test environment from your dev environment, use an absolute path to `dist/index.js`, and reconnect the MCP server after rebuilding.

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
   - Add a custom header: `Authorization: Bearer re_your_key_here` and activate the toggle.
   - Click **Connect**, then use "List tools" to verify the server is working.
