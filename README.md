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

## Setup

Create a free Resend account and [create an API key](https://resend.com/api-keys). To send to addresses outside of your own, you'll need to [verify your domain](https://resend.com/domains).

## Usage

### Claude Code

```bash
claude mcp add resend -e RESEND_API_KEY=re_xxxxxxxxx -- npx -y resend-mcp
```

### Cursor

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

### Claude Desktop

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

### Options

You can pass additional arguments to configure the server:

- `--key`: Your Resend API key (alternative to `RESEND_API_KEY` env var)
- `--sender`: Default sender email address from a verified domain
- `--reply-to`: Default reply-to email address (can be specified multiple times)

Environment variables:

- `RESEND_API_KEY`: Your Resend API key (required)
- `SENDER_EMAIL_ADDRESS`: Default sender email address from a verified domain (optional)
- `REPLY_TO_EMAIL_ADDRESSES`: Comma-separated reply-to email addresses (optional)

> [!NOTE]
> If you don't provide a sender email address, the MCP server will ask for one each time you send an email.

## Local Development

1. Clone and build:

```bash
git clone https://github.com/resend/resend-mcp.git
cd resend-mcp
pnpm install
pnpm run build
```

2. Use the local build in your MCP client:

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

### Testing with MCP Inspector

> **Note:** Make sure you've built the project first (see [Local Development](#local-development) section above).

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
