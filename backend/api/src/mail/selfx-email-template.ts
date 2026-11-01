type CustomerCodePurpose = "VERIFY_EMAIL" | "EMAIL_LOGIN" | "RESET_PASSWORD";

type EmailContent = {
  title: string;
  preheader: string;
  body: string;
  detail?: string;
  securityTitle?: string;
  security?: string;
  action?: { label: string; href: string };
  code?: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function logoUrl(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.SELFX_PUBLIC_WEB_BASE_URL ?? env.SELFX_WEB_BASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    const localHttp =
      env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      (url.protocol !== "https:" && !localHttp)
    )
      return undefined;
    return new URL("/brand/selfx-logo.png", url.origin).toString();
  } catch {
    return undefined;
  }
}

function frame(content: EmailContent) {
  const logo = logoUrl();
  const header = logo
    ? `<img src="${escapeHtml(logo)}" width="142" alt="SelfX" style="display:block;width:142px;max-width:100%;height:auto;border:0;margin:0 auto;">`
    : '<div style="font-family:Arial,Helvetica,sans-serif;font-size:34px;line-height:1;font-weight:700;letter-spacing:-2px;color:#172033;text-align:center;">Self<span style="color:#ed6a05;">X</span></div>';
  const action = content.action
    ? `<tr><td align="center" style="padding:0 32px 22px;"><a href="${escapeHtml(content.action.href)}" style="display:inline-block;padding:15px 28px;border-radius:12px;background:#ed6a05;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.2;font-weight:700;">${escapeHtml(content.action.label)}</a></td></tr>`
    : "";
  const detailRow = content.detail
    ? `<tr><td style="padding:0 32px 24px;"><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#586174;">${escapeHtml(content.detail)}</p></td></tr>`
    : "";
  const security = content.security
    ? `<tr><td style="padding:22px 32px 28px;border-top:1px solid #e5e7eb;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top" style="width:36px;height:36px;padding:0 12px 0 0;color:#e96a08;font-family:Arial,Helvetica,sans-serif;font-size:21px;line-height:36px;">&#10003;</td><td><p style="margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.35;font-weight:700;color:#172033;">${escapeHtml(content.securityTitle ?? "Security notice")}</p><p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#586174;">${escapeHtml(content.security)}</p></td></tr></table></td></tr>`
    : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.title)}</title></head><body style="margin:0;padding:0;background:#f0f1f4;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(content.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f1f4;"><tr><td align="center" style="padding:24px 12px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;"><tr><td style="padding:28px 28px 24px;">${header}<div style="height:1px;margin-top:26px;background:#e5e7eb;"></div></td></tr><tr><td align="center" style="padding:18px 32px 10px;"><h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:1.25;font-weight:500;color:#172033;">${escapeHtml(content.title)}</h1><p style="margin:18px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:1.6;color:#626b79;">${escapeHtml(content.body).replace(/\r?\n/g, "<br>")}</p></td></tr>${content.code ? `<tr><td style="padding:22px 32px 20px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fff5e9;border-radius:18px;"><tr><td align="center" style="padding:22px 16px 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.4;font-weight:700;letter-spacing:1px;color:#626b79;">YOUR VERIFICATION CODE</td></tr><tr><td align="center" dir="ltr" style="padding:4px 12px 8px;font-family:Arial,Helvetica,sans-serif;font-size:42px;line-height:1.2;font-weight:700;letter-spacing:8px;color:#e96a08;">${escapeHtml(content.code)}</td></tr><tr><td align="center" style="padding:0 16px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#626b79;">Enter this code in your SelfX app</td></tr></table></td></tr>` : ""}${detailRow}${action}${security}</table><p style="margin:18px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#6b7280;text-align:center;">&copy; ${new Date().getFullYear()} SelfX. All rights reserved.</p><p style="margin:5px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#8a909b;text-align:center;">This message was sent by SelfX.</p></td></tr></table></body></html>`;
}

export function renderBrandedEmail(subject: string, text: string) {
  return frame({
    title: subject,
    preheader: text.replace(/\s+/g, " ").slice(0, 140),
    body: text,
  });
}

export function customerCodeEmail(purpose: CustomerCodePurpose, code: string) {
  const content: Record<CustomerCodePurpose, EmailContent> = {
    VERIFY_EMAIL: {
      title: "Verify your email address",
      preheader: "Your SelfX email verification code is inside.",
      body: "Welcome to SelfX! Use the verification code below to verify your email address.",
      detail:
        "This code expires 10 minutes after your request and can be used once.",
      security:
        "If you didn't request this code, ignore this email. Never share your verification code with anyone.",
      code,
    },
    EMAIL_LOGIN: {
      title: "Sign in to SelfX",
      preheader: "Your SelfX sign-in code is inside.",
      body: "Use the code below to sign in to your SelfX customer account.",
      detail:
        "This code expires 10 minutes after your request and can be used once.",
      security:
        "If you didn't request this code, ignore this email. Never share your sign-in code with anyone.",
      code,
    },
    RESET_PASSWORD: {
      title: "Reset your password",
      preheader: "Your SelfX password reset code is inside.",
      body: "Use the code below in the SelfX app to reset your password.",
      detail:
        "This code expires 10 minutes after your request and can be used once.",
      security:
        "If you didn't request this code, ignore this email. Your password has not changed. Never share your code.",
      code,
    },
  };
  return frame(content[purpose]);
}

export function passwordResetLinkEmail(link: string) {
  return frame({
    title: "Reset your SelfX password",
    preheader: "Choose a new password using your secure reset link.",
    body: "A password reset was requested for your SelfX account. Use the button below to choose a new password.",
    detail:
      "This link expires 15 minutes after your request and can be used once.",
    action: { label: "Reset password", href: link },
    security:
      "If you didn't request this reset, ignore this email. Your password has not changed.",
  });
}

export function passwordChangedEmail() {
  return frame({
    title: "Your SelfX password was changed",
    preheader: "Your SelfX account password was changed successfully.",
    body: "Your password was changed successfully. Existing sessions have been signed out.",
    security:
      "If you didn't make this change, use Forgot password in the SelfX app to secure your account and contact SelfX support. Never share your password or verification codes.",
  });
}
