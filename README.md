# Email sending MCP 💌

[![smithery badge](https://smithery.ai/badge/@resend/mcp-send-email)](https://smithery.ai/server/@resend/mcp-send-email)

This is a simple MCP server that sends emails using Resend's API. Why? Now you can let VS Code, Cursor or Claude Desktop compose emails for you and send it right away without having to copy and paste the email content.

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

**DEMO**

https://github.com/user-attachments/assets/8c05cbf0-1664-4b3b-afb1-663b46af3464

**Cursor**

1. First, you need to authorize Resend to send emails from your domain or email. Follow the steps [here](https://resend.com/docs/send-with-nodejs) to set that up and get a Resend API key.
2. Clone this project locally. Edit index.ts and replace me@yoko.dev to your own email to send emails from
3. Run `npm install`, `npm run build` under the project dir. You should now see a /build/index.js generated - this is the MCP server script!

Then go to Cursor Settings -> MCP -> Add new MCP server

- Name = [choose your own name]
- Type = command
- Command: `node ABSOLUTE_PATH_TO_MCP_SERVER/build/index.js --key=YOUR_RESEND_API_KEY --sender=OPTIONAL_SENDER_EMAIL_ADDRESS --reply-to=OPTIONAL_REPLY_TO_EMAIL_ADDRESS_ONE --reply-to=OPTIONAL_REPLY_TO_EMAIL_ADDRESS_TWO`

You can get Resend API key here: https://resend.com/

Now you can test out sending emails by going to email.md, replace the to: email address, select all in email md, and hit cmd+l. You can now tell cursor to "send this as an email" in the chat. Make sure Cursor chat is in Agent mode by selecting "Agent" on lower left side dropdown

<img width="441" alt="Screenshot 2025-02-25 at 9 13 05 AM" src="https://github.com/user-attachments/assets/b07e9cbf-42d8-4910-8e90-3761d8d3bc06" />

**VS Code**
Same set up as above, and then add the following MCP config.

For one-click installation, click one of the install buttons below:

[![Install with Node in VS Code](https://img.shields.io/badge/VS_Code-Node-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=resend-email&config=%7B%22command%22%3A%22node%22%2C%22args%22%3A%5B%22build%2Findex.js%22%5D%2C%22env%22%3A%7B%22RESEND_API_KEY%22%3A%22%24%7Binput%3AresendApiKey%7D%22%2C%22SENDER_EMAIL_ADDRESS%22%3A%22%24%7Binput%3AsenderEmail%7D%22%2C%22REPLY_TO_EMAIL_ADDRESSES%22%3A%22%24%7Binput%3AreplyToEmails%7D%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22resendApiKey%22%2C%22description%22%3A%22Resend+API+Key%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22senderEmail%22%2C%22description%22%3A%22Sender+Email+Address%22%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22replyToEmails%22%2C%22description%22%3A%22Reply-To+Email+Addresses+%28comma+separated%29%22%7D%5D) [![Install with Node in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-Node-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=resend-email&config=%7B%22command%22%3A%22node%22%2C%22args%22%3A%5B%22build%2Findex.js%22%5D%2C%22env%22%3A%7B%22RESEND_API_KEY%22%3A%22%24%7Binput%3AresendApiKey%7D%22%2C%22SENDER_EMAIL_ADDRESS%22%3A%22%24%7Binput%3AsenderEmail%7D%22%2C%22REPLY_TO_EMAIL_ADDRESSES%22%3A%22%24%7Binput%3AreplyToEmails%7D%22%7D%7D&inputs=%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22resendApiKey%22%2C%22description%22%3A%22Resend+API+Key%22%2C%22password%22%3Atrue%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22senderEmail%22%2C%22description%22%3A%22Sender+Email+Address%22%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22replyToEmails%22%2C%22description%22%3A%22Reply-To+Email+Addresses+%28comma+separated%29%22%7D%5D&quality=insiders)

### Manual Installation
Add the following JSON block to your User Settings (JSON) file in VS Code. You can do this by pressing `Ctrl + Shift + P` and typing `Preferences: Open User Settings (JSON)`.

```json
{
  "mcp": {
    "inputs": [
      {
        "type": "promptString",
        "id": "resendApiKey",
        "description": "Resend API Key",
        "password": true
      },
      {
        "type": "promptString",
        "id": "senderEmail",
        "description": "Sender Email Address"
      },
      {
        "type": "promptString",
        "id": "replyToEmails",
        "description": "Reply-To Email Addresses (comma separated)"
      }
    ],
    "servers": {
      "resend-email": {
        "command": "node",
        "args": ["build/index.js"],
        "env": {
          "RESEND_API_KEY": "${input:resendApiKey}",
          "SENDER_EMAIL_ADDRESS": "${input:senderEmail}",
          "REPLY_TO_EMAIL_ADDRESSES": "${input:replyToEmails}"
        }
      }
    }
  }
}
```

Optionally, you can add it to a file called `.vscode/mcp.json` in your workspace. Note when you do this you will no longer need the `"mcp":{}` key in this json file.

**Claude desktop**

Same set up as above, and then add the following MCP config

```
{
  "mcpServers": {
    "resend": {
      "command": "node",
      "args": ["ABSOLUTE_PATH_TO_MCP_SERVER/build/index.js"],
      "env": {
        "RESEND_API_KEY": [YOUR_API_KEY],
        "SENDER_EMAIL_ADDRESS": [OPTIONAL_SENDER_EMAIL_ADDRESS],
        "REPLY_TO_EMAIL_ADDRESSES": [OPTIONAL_REPLY_TO_EMAIL_ADDRESSES_COMMA_DELIMITED]
      }
    }
  }
}
```


**Develop**

`npm install`
`npm run build`
