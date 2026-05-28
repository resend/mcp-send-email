import { z } from 'zod';

/**
 * Schema that accepts either a bare email address or an RFC 5322 mailbox
 * with a display name, e.g. `Acme <onboarding@resend.dev>`.
 *
 * Use for fields that Resend's API accepts in both forms (from, replyTo).
 * Do NOT use for fields that must be bare SMTP envelope addresses (to, cc, bcc).
 *
 * The Resend API itself accepts both shapes; using plain `z.email()` here
 * rejects display-name forms that downstream clients and the underlying
 * Resend SDK handle fine.
 */
export const mailboxSchema = z.string().refine(
  (s) => {
    if (typeof s !== 'string' || s.length === 0) return false;
    // Match `Display Name <addr@host>`, `"Quoted Name" <addr@host>`, or
    // bare `<addr@host>` (RFC 5322: display-name is optional in name-addr).
    const rfcMailbox =
      /^\s*(?:"[^"\\]*(?:\\.[^"\\]*)*"|[^<>,]+?)?\s*<([^@<>\s,]+@[^@<>\s,]+)>\s*$/;
    const match = s.match(rfcMailbox);
    const innerAddress = match ? match[1] : s;
    return z.email().safeParse(innerAddress).success;
  },
  {
    message:
      "Must be an email address or RFC 5322 mailbox like 'Name <addr@host>'",
  },
);
