# Email sending MCP 💌

[![smithery badge](https://smithery.ai/badge/@ykhli/mcp-send-email)](https://smithery.ai/server/@ykhli/mcp-send-email)

This is a simple MCP server that sends emails using Resend's API. Why? Now you can let Cursor or Claude Desktop compose emails for you and send it right away without having to copy and paste the email content.

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
