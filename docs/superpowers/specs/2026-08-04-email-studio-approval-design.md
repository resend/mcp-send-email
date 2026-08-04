# Email Studio Approval Composer Design

Email Studio adds a human approval workflow for transactional email. It is an MCP App, not a replacement for the existing direct `send-email` tool.

## User flow

1. An agent calls `prepare-email-approval` with a transactional email.
2. A client that supports MCP Apps renders the grouped composer. The user can edit delivery fields, subject, plain text, optional HTML, advanced send options, and attachments.
3. The user clicks **Approve and send**. The app saves a new immutable revision and then approves that revision.
4. The server deletes the draft before asking Resend to send it, so a retry cannot deliver it twice.

Clients without MCP Apps receive a review-only preview. No draft is created and Email Studio cannot send in that mode.

## Safety rules

- Drafts are scoped to one MCP server session, expire after 15 minutes, and are never persisted.
- A session can keep at most three drafts and 40 MiB of decoded attachment bytes.
- Email Studio accepts Base64 attachments only. It rejects local paths and URLs because their bytes can change after review or expose server/network data.
- The app receives attachment name, MIME type, size, and SHA-256 fingerprint, never stored attachment bytes.
- Configured sender and reply-to addresses are shown but locked; the server enforces the configured values again on every update.
- The HTML preview runs in a sandboxed iframe with a restrictive CSP.
