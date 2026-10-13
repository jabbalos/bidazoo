import type { MailMessage } from './mail';

/**
 * The guardian sign-in email. Deliberately small and the same for every address:
 *  - it says a link was requested for BidaZoo, never that the recipient has an account;
 *  - it is not a password reset, and carries no child, family, device or account identifier;
 *  - one link (the only dynamic part), a plain-text twin, no images, no tracking, no marketing.
 */
const escapeHtml = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function guardianLoginEmail(input: { to: string; link: string; minutes: number }): MailMessage {
  const { link, minutes } = input;
  const text = [
    'BidaZoo',
    '',
    'A sign-in link was requested for BidaZoo with this email address. The link is for parents and guardians.',
    '',
    'Open this link on the device you want to use:',
    link,
    '',
    `The link works once and expires in ${minutes} minutes.`,
    "If you didn't request this, you can ignore this email. Nothing happens unless the link is opened.",
  ].join('\n');

  const safeLink = escapeHtml(link);
  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BidaZoo sign-in link</title></head>',
    '<body style="margin:0;padding:24px;background:#f6f3e8;color:#14261f;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5">',
    '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">',
    '<h1 style="margin:0 0 12px;font-size:22px">BidaZoo</h1>',
    '<p style="margin:0 0 16px">A sign-in link was requested for BidaZoo with this email address. The link is for parents and guardians.</p>',
    `<p style="margin:0 0 20px"><a href="${safeLink}" style="display:inline-block;padding:14px 22px;background:#1b6b4a;color:#ffffff;text-decoration:none;font-weight:bold;border-radius:8px">Sign in to BidaZoo</a></p>`,
    `<p style="margin:0 0 16px;font-size:14px">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${safeLink}</span></p>`,
    `<p style="margin:0 0 8px;font-size:14px">The link works once and expires in ${minutes} minutes.</p>`,
    "<p style=\"margin:0;font-size:14px\">If you didn't request this, you can ignore this email. Nothing happens unless the link is opened.</p>",
    '</div></body></html>',
  ].join('\n');

  return { to: input.to, subject: 'Your BidaZoo sign-in link', text, html };
}
