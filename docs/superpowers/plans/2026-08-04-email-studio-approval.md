# Email Studio Approval Composer Implementation Plan

Implemented as a session-backed MCP App with four tools:

- `prepare-email-approval`: create a reviewed draft for a UI-capable host, or return preview-only text otherwise.
- `update-email-approval`: replace a draft revision while retaining selected stored attachments.
- `approve-email-approval`: consume and send one exact revision.
- `cancel-email-approval`: discard the pending draft.

The implementation is covered by unit tests for draft lifecycle and UI payload generation, plus MCP integration tests for capability fallback, resource metadata, revision replacement, and one-time sending.
