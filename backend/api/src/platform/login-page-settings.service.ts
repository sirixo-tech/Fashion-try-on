import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../database/prisma.service.js";
import {
  type LoginPageCardDto,
  type LoginPageMediaType,
  type LoginPageSettingsResponseDto,
  type UpdateLoginPageSettingsDto,
  loginPageMediaTypes,
} from "./dto/login-page-settings.dto.js";

export const LOGIN_PAGE_SETTINGS_KEY = "platform.login_page";

const defaultLoginPageSettings: LoginPageSettingsResponseDto = {
  eyebrow: "SelfX Virtual Try-On",
  headline: "Bring every fitting room to life",
  body: "Manage Stores, kiosks, catalog products and Try-On operations from one SelfX control center.",
  mediaType: "VIDEO",
  mediaUrl: "/kiosk/default-start-screen.mp4",
  mediaPosterUrl: null,
  cards: [
    {
      title: "Store control",
      description: "Operate Store access, products and kiosks from one place.",
    },
    {
      title: "Try-On ready",
      description: "Keep visual AI workflows behind SelfX permissions.",
    },
  ],
  bullets: [
    "Permission-aware dashboards for every role",
    "One backend for Store, kiosk and future channel access",
    "Provider credentials stay server-side",
  ],
};

@Injectable()
export class LoginPageSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings(): Promise<LoginPageSettingsResponseDto> {
    const rows = await this.prisma.$queryRaw<Array<{ value: unknown }>>`
      SELECT "value"
      FROM platform_settings
      WHERE "key" = ${LOGIN_PAGE_SETTINGS_KEY}
      LIMIT 1
    `;
    return loginPageSettingsFromValue(rows[0]?.value);
  }

  async updateSettings(
    input: UpdateLoginPageSettingsDto,
  ): Promise<LoginPageSettingsResponseDto> {
    const current = await this.getSettings();
    const next = sanitizeLoginPageSettings({
      ...current,
      ...input,
    });
    await this.prisma.$executeRaw`
      INSERT INTO platform_settings ("key", "value")
      VALUES (${LOGIN_PAGE_SETTINGS_KEY}, ${JSON.stringify(next)}::jsonb)
      ON CONFLICT ("key") DO UPDATE SET
        "value" = EXCLUDED."value",
        "updated_at" = CURRENT_TIMESTAMP
    `;
    return next;
  }
}

function loginPageSettingsFromValue(
  value: unknown,
): LoginPageSettingsResponseDto {
  return sanitizeLoginPageSettings({
    ...defaultLoginPageSettings,
    ...(isRecord(value) ? value : {}),
  });
}

function sanitizeLoginPageSettings(
  value: LoginPageSettingsResponseDto | UpdateLoginPageSettingsDto,
): LoginPageSettingsResponseDto {
  return {
    eyebrow: cleanText(value.eyebrow, defaultLoginPageSettings.eyebrow, 80),
    headline: cleanText(value.headline, defaultLoginPageSettings.headline, 120),
    body: cleanText(value.body, defaultLoginPageSettings.body, 260),
    mediaType: cleanMediaType(value.mediaType),
    mediaUrl: cleanMediaUrl(value.mediaUrl),
    mediaPosterUrl: cleanNullableUrl(value.mediaPosterUrl),
    cards: cleanCards(value.cards),
    bullets: cleanBullets(value.bullets),
  };
}

function cleanText(
  value: string | undefined,
  fallback: string,
  maxLength: number,
): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, maxLength) : fallback;
}

function cleanMediaType(value: string | undefined): LoginPageMediaType {
  return loginPageMediaTypes.includes(value as LoginPageMediaType)
    ? (value as LoginPageMediaType)
    : defaultLoginPageSettings.mediaType;
}

function cleanMediaUrl(value: string | undefined): string {
  return cleanNullableUrl(value) ?? defaultLoginPageSettings.mediaUrl;
}

function cleanNullableUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://")
  ) {
    return trimmed.slice(0, 2048);
  }
  return null;
}

function cleanCards(value: unknown): LoginPageCardDto[] {
  const source = Array.isArray(value) ? value : defaultLoginPageSettings.cards;
  const cards = source.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }
    const title = cleanText(
      typeof entry.title === "string" ? entry.title : undefined,
      "",
      48,
    );
    const description = cleanText(
      typeof entry.description === "string" ? entry.description : undefined,
      "",
      120,
    );
    return title && description ? [{ title, description }] : [];
  });
  return cards.length > 0 ? cards.slice(0, 2) : defaultLoginPageSettings.cards;
}

function cleanBullets(value: unknown): string[] {
  const source = Array.isArray(value) ? value : defaultLoginPageSettings.bullets;
  const bullets = source
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().slice(0, 120))
    .filter(Boolean);
  return bullets.length > 0
    ? bullets.slice(0, 4)
    : defaultLoginPageSettings.bullets;
}

function isRecord(value: unknown): value is Record<string, Prisma.JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
