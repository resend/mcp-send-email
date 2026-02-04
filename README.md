# Email sending MCP 💌

[![smithery badge](https://smithery.ai/badge/@resend/mcp-send-email)](https://smithery.ai/server/@resend/mcp-send-email)

This is a simple MCP server that sends emails using Resend's API. Why? Now you can let Cursor or Claude Desktop compose emails for you and send it right away without having to copy and paste the email content.

As an example, you could use this to run local scripts, chat with Claude, or process data and send the results to yourself or your team.

Built with:

- [Resend](https://resend.com/)
- [Anthropic MCP](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
- [Cursor](https://cursor.so/)

## Features

- Send plain text and HTML emails
- Schedule emails for future delivery
- Add CC and BCC recipients
- Configure reply-to addresses
- Customizable sender email (requires verification)
- List Resend audiences

## Demo

https://github.com/user-attachments/assets/8c05cbf0-1664-4b3b-afb1-663b46af3464

## Setup

Currently, you must build the project locally to use this MCP server. Then add the server in [Cursor](#cursor) or [Claude Desktop](#claude-desktop) to use it in any Cursor or Claude Desktop chat.

1. Clone this project locally.

```
git clone https://github.com/resend/mcp-send-email.git
```

2. Build the project

```
npm install
npm run build
```
3. Setup Resend

Create a free Resend account and [Create an API Key](https://resend.com/api-keys). To send to other addresses, you'll also need to [verify your own domain](https://resend.com/domains).

> [!NOTE]
> For more info on how to send emails with Resend, see the [docs](https://resend.com/docs/send-with-nodejs).

## Cursor

1. Open Cursor Settings.

Open the command palette (`cmd`+`shift`+`p` on macOS or `ctrl`+`shift`+`p` on Windows) and choose "Cursor Settings".

2. Add the MCP server

Select "MCP" from the left sidebar and click "Add new global MCP server".

Add the following config:
```json
{
  "mcpServers": {
    "resend": {
      "type": "command",
      "command": "node ABSOLUTE_PATH_TO_MCP_SEND_EMAIL_PROJECT/build/index.js --key=YOUR_RESEND_API_KEY"
    }
  }
}
```

You can get the absolute path to your build script by right-clicking on the `/build/index.js` file in Cursor and selecting `Copy Path`.

**Possible arguments**

- `--key`: Your Resend API key (required)
- `--sender`: Your sender email address from a verified domain (optional)
- `--reply-to`: Your reply-to email address (optional)

> [!NOTE]
> If you don't provide a sender email address, the MCP server will ask you to provide one each time you call the tool.

3. Test the sending

Now you can test out sending emails by going to `email.md`.
- Replace the to: email address with your own
- Select all text in `email.md`, and press `cmd+l`
- Tell cursor to "send this as an email" in the chat (make sure cursor is in Agent mode by selecting "Agent" on lower left side dropdown).

<img width="441" alt="Cursor chat with email.md file selected and Agent mode enabled" src="https://github.com/user-attachments/assets/b07e9cbf-42d8-4910-8e90-3761d8d3bc06" />

## Claude Desktop

1. Open Claude's Developer config file

Open Claude Desktop settings and navigate to the "Developer" tab. Click `Edit Config`.

2. Add the MCP server

Add the following config:

```json
{
  "mcpServers": {
    "resend": {
      "command": "node",
      "args": [
        "ABSOLUTE_PATH_TO_MCP_SEND_EMAIL_PROJECT/build/index.js"
      ],
      "env": {
        "RESEND_API_KEY": "YOUR_RESEND_API_KEY",
      }
    }
  }
}
```

You can get the absolute path to your build script by right-clicking on the `/build/index.js` file in your IDE and selecting `Copy Path`.

**Possible environment variables**

- `RESEND_API_KEY`: Your Resend API key (required)
- `SENDER_EMAIL_ADDRESS`: Your sender email address from a verified domain (optional)
- `REPLY_TO_EMAIL_ADDRESS`: Your reply-to email address (optional)

> [!NOTE]
> If you don't provide a sender email address, the MCP server will ask you to provide one each time you call the tool.

3. Test the sending

Close and reopen Claude Desktop. Verify that the `resend` tool is available in the Claude developer settings.

![Claude Desktop developer settings with Resend MCP server showing](https://github.com/user-attachments/assets/be9549e5-eaef-4946-b10a-e708c1864acf)

Chat with Claude and tell it to send you an email using the `resend` tool.
