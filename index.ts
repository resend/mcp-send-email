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

// Get reply to email addresses from command line argument or fall back to environment variable
let replierEmailAddresses: string[] = [];

if (Array.isArray(argv["reply-to"])) {
  replierEmailAddresses = argv["reply-to"];
} else if (typeof argv["reply-to"] === "string") {
  replierEmailAddresses = [argv["reply-to"]];
} else if (process.env.REPLY_TO_EMAIL_ADDRESSES) {
  replierEmailAddresses = process.env.REPLY_TO_EMAIL_ADDRESSES.split(",");
}

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
    text: z.string().describe("Plain text email content"),
    html: z
      .string()
      .optional()
      .describe(
        "HTML email content. When provided, the plain text argument MUST be provided as well."
      ),
    cc: z
      .string()
      .email()
      .array()
      .optional()
      .describe("Optional array of CC email addresses. You MUST ask the user for this parameter. Under no circumstance provide it yourself"),
    bcc: z
      .string()
      .email()
      .array()
      .optional()
      .describe("Optional array of BCC email addresses. You MUST ask the user for this parameter. Under no circumstance provide it yourself"),
    scheduledAt: z
      .string()
      .optional()
      .describe(
        "Optional parameter to schedule the email. This uses natural language. Examples would be 'tomorrow at 10am' or 'in 2 hours' or 'next day at 9am PST' or 'Friday at 3pm ET'."
      ),
    // If sender email address is not provided, the tool requires it as an argument
    ...(!senderEmailAddress
      ? {
          from: z
            .string()
            .email()
            .nonempty()
            .describe(
              "Sender email address. You MUST ask the user for this parameter. Under no circumstance provide it yourself"
            ),
        }
      : {}),
    ...(replierEmailAddresses.length === 0
      ? {
          replyTo: z
            .string()
            .email()
            .array()
            .optional()
            .describe(
              "Optional email addresses for the email readers to reply to. You MUST ask the user for this parameter. Under no circumstance provide it yourself"
            ),
        }
      : {}),
  },
  async ({ from, to, subject, text, html, replyTo, scheduledAt, cc, bcc }) => {
    const fromEmailAddress = from ?? senderEmailAddress;
    const replyToEmailAddresses = replyTo ?? replierEmailAddresses;

    // Type check on from, since "from" is optionally included in the arguments schema
    // This should never happen.
    if (typeof fromEmailAddress !== "string") {
      throw new Error("from argument must be provided.");
    }

    // Similar type check for "reply-to" email addresses.
    if (
      typeof replyToEmailAddresses !== "string" &&
      !Array.isArray(replyToEmailAddresses)
    ) {
      throw new Error("replyTo argument must be provided.");
    }

    console.error(`Debug - Sending email with from: ${fromEmailAddress}`);
    
    // Explicitly structure the request with all parameters to ensure they're passed correctly
    const emailRequest: {
      to: string;
      subject: string;
      text: string;
      from: string;
      replyTo: string | string[];
      html?: string;
      scheduledAt?: string;
      cc?: string[];
      bcc?: string[];
    } = {
      to,
      subject,
      text,
      from: fromEmailAddress,
      replyTo: replyToEmailAddresses,
    };
    
    // Add optional parameters conditionally
    if (html) {
      emailRequest.html = html;
    }
    
    if (scheduledAt) {
      emailRequest.scheduledAt = scheduledAt;
    }
    
    if (cc) {
      emailRequest.cc = cc;
    }
    
    if (bcc) {
      emailRequest.bcc = bcc;
    }
    
    console.error(`Email request: ${JSON.stringify(emailRequest)}`);

    const response = await resend.emails.send(emailRequest);

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
