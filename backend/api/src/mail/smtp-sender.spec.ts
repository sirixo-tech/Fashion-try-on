import "reflect-metadata";
import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SmtpSender,
  publicSmtpAddress,
  type SmtpAccount,
} from "./smtp-sender.js";
const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  create: vi.fn(),
  send: vi.fn(),
  close: vi.fn(),
  connect: vi.fn(),
  connectTls: vi.fn(),
}));
vi.mock("node:net", async (original) => ({
  ...(await original<typeof import("node:net")>()),
  connect: mocks.connect,
}));
vi.mock("node:tls", () => ({ connect: mocks.connectTls }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("nodemailer", () => ({ default: { createTransport: mocks.create } }));
const account: SmtpAccount = {
  host: "smtp.example.com",
  port: 587,
  security: "STARTTLS",
  username: "user",
  password: "smtp-secret",
  fromEmail: "mail@example.com",
  fromName: "SelfX",
};
const message = {
  to: "recipient@example.com",
  subject: "Test",
  text: "Private reset link",
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  mocks.create.mockReturnValue({ sendMail: mocks.send, close: mocks.close });
  mocks.send.mockResolvedValue({ accepted: [message.to], rejected: [] });
});
afterEach(() => vi.useRealTimers());
describe("SMTP transport security", () => {
  it("marks an already-encrypted socket as secured and closes active sockets on timeout", async () => {
    const encryptedSocket = Object.assign(new EventEmitter(), {
      destroy: vi.fn(),
    });
    mocks.connectTls.mockReturnValue(encryptedSocket);
    mocks.send.mockImplementationOnce(async () => {
      const options = mocks.create.mock.calls.at(-1)![0];
      const callback = vi.fn();
      options.getSocket({}, callback);
      encryptedSocket.emit("secureConnect");
      expect(callback).toHaveBeenCalledWith(null, {
        connection: encryptedSocket,
        secured: true,
      });
      return { accepted: [message.to], rejected: [] };
    });
    await new SmtpSender().send(
      { ...account, security: "TLS", port: 465 },
      message,
    );
    expect(encryptedSocket.destroy).toHaveBeenCalled();

    vi.useFakeTimers();
    const plainSocket = Object.assign(new EventEmitter(), { destroy: vi.fn() });
    mocks.connect.mockReturnValue(plainSocket);
    mocks.send.mockImplementationOnce(() => {
      mocks.create.mock.calls.at(-1)![0].getSocket({}, vi.fn());
      return new Promise(() => {});
    });
    const result = new SmtpSender().send(account, message).catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: "SMTP_TIMEOUT" });
    expect(plainSocket.destroy).toHaveBeenCalled();
  });
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "100.64.0.2",
    "169.254.169.254",
    "172.16.1.1",
    "192.168.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
    "2001:db8::1",
    "2002:7f00:1::",
  ])("blocks private/reserved SMTP address %s", (address) => {
    expect(publicSmtpAddress(address)).toBe(false);
  });
  it("pins validated public DNS and requires encrypted, verified TLS without logging", async () => {
    await new SmtpSender().send(account, message);
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "8.8.8.8",
        secure: false,
        requireTLS: true,
        tls: {
          servername: "smtp.example.com",
          rejectUnauthorized: true,
          minVersion: "TLSv1.2",
        },
        debug: false,
        logger: false,
        disableFileAccess: true,
        disableUrlAccess: true,
      }),
    );
    expect(mocks.close).toHaveBeenCalled();
    await new SmtpSender().send(
      { ...account, port: 465, security: "TLS" },
      message,
    );
    expect(mocks.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ secure: true, requireTLS: false }),
    );
  });
  it("rejects a mixed public/private DNS result before creating a connection", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "8.8.8.8" },
      { address: "127.0.0.1" },
    ]);
    await expect(new SmtpSender().send(account, message)).rejects.toMatchObject(
      { code: "SMTP_HOST_NOT_PUBLIC" },
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("never exposes transport errors or SMTP secrets", async () => {
    mocks.send.mockRejectedValue(
      Object.assign(new Error("smtp-secret: Private reset link"), {
        code: "EAUTH",
      }),
    );
    await expect(new SmtpSender().send(account, message)).rejects.toMatchObject(
      { code: "SMTP_AUTH_FAILED", message: "SMTP_AUTH_FAILED" },
    );
  });
  it("does not start a late SMTP connection after DNS timed out", async () => {
    vi.useFakeTimers();
    let resolveLookup!: (value: unknown) => void;
    mocks.lookup.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    const result = new SmtpSender().send(account, message).catch((e) => e);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await result).toMatchObject({ code: "SMTP_TIMEOUT" });
    resolveLookup([{ address: "8.8.8.8" }]);
    await Promise.resolve();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
