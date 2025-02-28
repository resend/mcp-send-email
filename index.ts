import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Resend } from "resend";
import minimist from "minimist";

// Parse command line arguments
const argv = minimist(process.argv.slice(2));

// Get API key from command line argument or fall back to environment variable
const apiKey = argv.key || process.env.RESEND_API_KEY;

// Get sender email address from command line argument or fall back to environment variable
// Optional.
const senderEmailAddress = argv.sender || process.env.SENDER_EMAIL_ADDRESS;

if (!apiKey) {
  console.error(
    "No API key provided. Please set RESEND_API_KEY environment variable or use --key argument"
  );
  process.exit(1);
}

const resend = new Resend(apiKey);

// Create server instance
const server = new McpServer({
  name: "email-sending-service",
  version: "1.0.0",
});

server.tool(
  "send-email",
  "Send an email using Resend",
  {
    to: z.string().email().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    content: z.string().describe("Plain text email content"),
    // If sender email address is not provided, the tool requires it as an argument
    ...(!senderEmailAddress
      ? {
          from: z
            .string()
            .email()
            .nonempty()
            .describe(
              "Sender email address. This must be provided explicitly provided by the end user and cannot be empty. Do not automatically populate this."
            ),
        }
      : {}),
  },
  async ({ from, to, subject, content }) => {
    const fromEmailAddress = from ?? senderEmailAddress;

    // Type check on from, since "from" is optionally included in the arguments schema
    // This should never happen.
    if (typeof fromEmailAddress !== "string") {
      throw new Error("from argument must be provided.");
    }

    const response = await resend.emails.send({
      from: fromEmailAddress,
      to,
      subject,
      text: content,
    });

    if (response.error) {
      throw new Error(
        `Email failed to send: ${JSON.stringify(response.error)}`
      );
    }

    return {
      content: [
        {
          type: "text",
          text: `Email sent successfully! ${JSON.stringify(response.data)}`,
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Email sending service MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
