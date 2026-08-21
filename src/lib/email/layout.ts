const BG = "#1a1917";
const PANEL = "#26251f";
const CARD = "#2e2d27";
const TEXT = "#f0eee9";
const MUTED = "#a3a09a";
const ACCENT = "#c8f24a";
const ACCENT_FG = "#232a08";

export function shell(opts: {
  preheader: string;
  heading: string;
  body: string;
  cta?: { label: string; url: string };
  footnote?: string;
}) {
  const { preheader, heading, body, cta, footnote } = opts;
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:40px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
  <tr><td style="padding-bottom:24px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:28px;height:28px;background:${ACCENT};border-radius:9px;text-align:center;vertical-align:middle;font-weight:700;font-size:13px;color:${ACCENT_FG}">A</td>
      <td style="padding-left:10px;font-weight:600;font-size:14px;color:${TEXT}">Arc</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${PANEL};border:1px solid #3a3830;border-radius:18px;padding:32px">
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;font-weight:600;color:${TEXT};letter-spacing:-.02em">${escapeHtml(heading)}</h1>
    <div style="font-size:14px;line-height:1.7;color:${MUTED}">${body}</div>
    ${
      cta
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:26px"><tr>
             <td style="background:${ACCENT};border-radius:12px">
               <a href="${cta.url}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:600;color:${ACCENT_FG};text-decoration:none">${escapeHtml(cta.label)}</a>
             </td></tr></table>
           <p style="margin:16px 0 0;font-size:11px;line-height:1.6;color:#7d7a74;word-break:break-all">Or paste this link: ${cta.url}</p>`
        : ""
    }
  </td></tr>
  <tr><td style="padding-top:20px;font-size:11px;line-height:1.7;color:#6f6c66">
    ${footnote ? escapeHtml(footnote) + "<br>" : ""}Arc — issues that move themselves.
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function card(inner: string) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;background:${CARD};border-radius:14px"><tr><td style="padding:16px">${inner}</td></tr></table>`;
}

export function issueLine(key: string, title: string, meta?: string) {
  return `<div style="margin-bottom:12px">
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:${ACCENT};letter-spacing:.04em">${escapeHtml(key)}</div>
    <div style="font-size:14px;color:${TEXT};line-height:1.45;margin-top:3px">${escapeHtml(title)}</div>
    ${meta ? `<div style="font-size:11.5px;color:${MUTED};margin-top:3px">${escapeHtml(meta)}</div>` : ""}
  </div>`;
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
