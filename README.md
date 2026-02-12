# Email sending MCP 💌

[![smithery badge](https://smithery.ai/badge/@resend/resend-mcp)](https://smithery.ai/server/@resend/resend-mcp)

This is a simple MCP server that sends emails using Resend's API. Why? Now you can let Cursor or Claude Desktop compose emails for you and send it right away without having to copy and paste the email content.

As an example, you could use this to run local scripts, chat with Claude, or process data and send the results to yourself or your team.

Built with:

- [Resend](https://resend.com/)
- [Anthropic MCP](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [Cursor](https://cursor.so/)

## Features

- **Emails** — Send, list, get, cancel, update, and send batch emails. Supports plain text, HTML, attachments, CC/BCC, reply-to, scheduling, and tags. Manage sent and received email attachments.
- **Contacts** — Create, list, get, update, and remove contacts. Manage contact segment memberships and topic subscriptions.
- **Broadcasts** — Create, send, list, get, update, and remove broadcast emails to audiences.
- **Domains** — Create, list, get, update, remove, and verify sender domains.
- **API Keys** — Create, list, and remove API keys.
- **Segments** — Create, list, get, and remove audience segments.
- **Topics** — Create, list, get, update, and remove topics.
- **Contact Properties** — Create, list, get, update, and remove custom contact properties.
- **Webhooks** — Create, list, get, update, and remove webhooks.

## Demo

https://github.com/user-attachments/assets/8c05cbf0-1664-4b3b-afb1-663b46af3464

## Setup

Create a free Resend account and [Create an API Key](https://resend.com/api-keys). To send to other addresses, you'll also need to [verify your own domain](https://resend.com/domains).

> [!NOTE]
> For more info on how to send emails with Resend, see the [docs](https://resend.com/docs/send-with-nodejs).

## Usage

### Cursor

Open the command palette (`cmd`+`shift`+`p` on macOS or `ctrl`+`shift`+`p` on Windows) and choose "Cursor Settings". Select "MCP" from the left sidebar and click "Add new global MCP server".

Add the following config:

```json
{
  "mcpServers": {
    "resend": {
      "type": "command",
      "command": "npx -y resend-mcp",
      "env": {
        "RESEND_API_KEY": "YOUR_RESEND_API_KEY"
      }
    }
  }
}
```

### Claude Desktop

Open Claude Desktop settings and navigate to the "Developer" tab. Click `Edit Config`.

Add the following config:

```json
{
  "mcpServers": {
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": {
        "RESEND_API_KEY": "YOUR_RESEND_API_KEY"
      }
    }
  }
}
```

Close and reopen Claude Desktop. Verify that the `resend` tool is available in the Claude developer settings.

![Claude Desktop developer settings with Resend MCP server showing](https://github.com/user-attachments/assets/be9549e5-eaef-4946-b10a-e708c1864acf)

Chat with Claude and tell it to send you an email using the `resend` tool.

### Options

You can pass additional arguments to configure the server:

- `--key`: Your Resend API key (alternative to `RESEND_API_KEY` env var)
- `--sender`: Your sender email address from a verified domain
- `--reply-to`: Your reply-to email address

Environment variables:

- `RESEND_API_KEY`: Your Resend API key (required)
- `SENDER_EMAIL_ADDRESS`: Your sender email address from a verified domain (optional)
- `REPLY_TO_EMAIL_ADDRESS`: Your reply-to email address (optional)

> [!NOTE]
> If you don't provide a sender email address, the MCP server will ask you to provide one each time you call the tool.

## Local Development

1. Clone this project and build:

```
git clone https://github.com/resend/resend-mcp.git
pnpm install
pnpm run build
```

2. To use the local build in Cursor or Claude Desktop, replace the `npx` command with the path to your local build:

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

> **Note:** Make sure you've built the project first (see [Setup](#setup) section above).

1. **Set your API key** (so the server can talk to Resend):

   ```bash
   export RESEND_API_KEY=re_your_key_here
   ```

2. **Start the inspector**:

   ```bash
   pnpm inspector
   ```

3. **In the Inspector UI** (browser):
   - Choose **stdio** (launch a process).
   - **Command:** `node`
   - **Args:** `dist/index.js` (or the full path to `dist/index.js`)
   - **Env:** `RESEND_API_KEY=re_your_key_here` (or leave blank if you already exported it in the same terminal).
   - Click **Connect**, then use "List tools" to verify the server is working.
