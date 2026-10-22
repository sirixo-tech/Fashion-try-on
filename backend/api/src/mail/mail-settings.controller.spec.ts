import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { validate } from "class-validator";
import { MailSettingsController } from "./mail-settings.controller.js";
import {
  SaveMailSettingsDto,
  SaveMailTemplateDto,
  SendCustomEmailDto,
} from "./mail.dto.js";
import { MailCrypto } from "./mail-crypto.js";
import { recoveryWebOrigin } from "../auth/password-recovery.service.js";

describe("Mail Settings access and validation", () => {
  it("rejects email header injection, empty templates and invalid custom recipients", async () => {
    const template = Object.assign(new SaveMailTemplateDto(), {
      version: 0,
      subject: "Hello\r\nBcc: injected@example.com",
      body: "Body",
    });
    expect((await validate(template)).map((e) => e.property)).toContain(
      "subject",
    );
    template.subject = " ";
    template.body = " ";
    expect((await validate(template)).map((e) => e.property)).toEqual(
      expect.arrayContaining(["subject", "body"]),
    );
    const custom = Object.assign(new SendCustomEmailDto(), {
      version: 1,
      subject: "Hello",
      body: "Body",
      recipient: "bad",
      idempotencyKey: "bad",
    });
    expect((await validate(custom)).map((e) => e.property)).toEqual(
      expect.arrayContaining(["recipient", "idempotencyKey"]),
    );
  });
  it("denies Store users and platform staff even when general platform permissions exist", async () => {
    const auth = {
      requireAccessUser: vi.fn().mockResolvedValue({ id: "staff" }),
    };
    const permissions = { isSuperadmin: vi.fn().mockResolvedValue(false) };
    const settings = { get: vi.fn(), save: vi.fn(), test: vi.fn() };
    const automation = {
      assertNoImpersonation: vi.fn(),
      templates: vi.fn(),
      saveTemplate: vi.fn(),
      history: vi.fn(),
      custom: vi.fn(),
    };
    const controller = new MailSettingsController(
      auth as never,
      permissions as never,
      settings as never,
      automation as never,
    );
    const request = { headers: { authorization: "Bearer fixture" } } as never;
    await expect(controller.get(request)).rejects.toThrow();
    await expect(controller.save(request, {} as never)).rejects.toThrow();
    await expect(controller.custom(request, {} as never)).rejects.toThrow();
    await expect(controller.templates(request)).rejects.toThrow();
    await expect(
      controller.saveTemplate(request, "STORE_CREATED", {} as never),
    ).rejects.toThrow();
    await expect(controller.history(request)).rejects.toThrow();
    expect(settings.get).not.toHaveBeenCalled();
    expect(settings.save).not.toHaveBeenCalled();
    expect(settings.test).not.toHaveBeenCalled();
    permissions.isSuperadmin.mockResolvedValue(true);
    await controller.get(request);
    expect(settings.get).toHaveBeenCalledOnce();
    automation.assertNoImpersonation.mockRejectedValue(
      new Error("Impersonation denied"),
    );
    await expect(controller.get(request)).rejects.toThrow(
      "Impersonation denied",
    );
    expect(settings.get).toHaveBeenCalledOnce();
  });
  it("rejects unsafe security mode, ports and mail headers", async () => {
    const dto = Object.assign(new SaveMailSettingsDto(), {
      version: 0,
      editConfirmed: true,
      enabled: true,
      host: "smtp.example.com",
      port: 587,
      security: "STARTTLS",
      username: "user",
      password: "secret",
      fromEmail: "mail@example.com",
      fromName: "SelfX",
    });
    expect(await validate(dto)).toHaveLength(0);
    dto.security = "NONE" as never;
    dto.port = 0;
    dto.fromName = "SelfX\r\nBcc: another@example.com";
    expect((await validate(dto)).map((e) => e.property)).toEqual(
      expect.arrayContaining(["security", "port", "fromName"]),
    );
  });
  it("uses a configured HTTPS origin instead of request-controlled reset URLs", () => {
    expect(
      recoveryWebOrigin({
        NODE_ENV: "production",
        SELFX_PUBLIC_WEB_BASE_URL: "https://app.example.com",
      }),
    ).toBe("https://app.example.com");
    for (const value of [
      "http://app.example.com",
      "https://user:pass@app.example.com",
      "https://app.example.com/redirect",
      "https://app.example.com?next=evil",
    ])
      expect(() =>
        recoveryWebOrigin({
          NODE_ENV: "production",
          SELFX_PUBLIC_WEB_BASE_URL: value,
        }),
      ).toThrow();
  });
  it("requires a server encryption key and detects ciphertext tampering", () => {
    vi.stubEnv(
      "SELFX_MAIL_ENCRYPTION_KEY",
      Buffer.alloc(32, 5).toString("base64"),
    );
    vi.stubEnv("SELFX_MAIL_PREVIOUS_ENCRYPTION_KEYS", "{}");
    const crypto = new MailCrypto(),
      envelope = crypto.encrypt({ password: "smtp-secret" });
    expect(JSON.stringify(envelope)).not.toContain("smtp-secret");
    expect(crypto.decrypt(envelope)).toEqual({ password: "smtp-secret" });
    expect(() =>
      crypto.decrypt({ ...envelope, tag: Buffer.alloc(16).toString("base64") }),
    ).toThrow();
    vi.stubEnv("SELFX_MAIL_ENCRYPTION_KEY", "");
    expect(crypto.ready()).toBe(false);
    vi.unstubAllEnvs();
  });
});
