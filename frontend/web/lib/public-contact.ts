export const supportEmail =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "hello@selfx.in";

export const supportMailto = `mailto:${supportEmail}`;
