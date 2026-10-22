import { lookup } from "node:dns/promises";
import { BlockList, isIP, connect, type Socket } from "node:net";
import { connect as connectTls } from "node:tls";
import { Injectable } from "@nestjs/common";
import nodemailer from "nodemailer";

export interface SmtpAccount {
  host: string;
  port: number;
  security: "TLS" | "STARTTLS";
  username: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo?: string;
}
export interface EmailMessage {
  messageId?: string;
  to: string;
  subject: string;
  text: string;
}
export class MailDeliveryError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
for (const [address, prefix] of [
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");
export function publicSmtpAddress(address: string) {
  return isIP(address) === 4
    ? !blocked.check(address, "ipv4")
    : isIP(address) === 6 &&
        globalV6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}

@Injectable()
export class SmtpSender {
  async send(account: SmtpAccount, message: EmailMessage): Promise<void> {
    let transport: ReturnType<typeof nodemailer.createTransport> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    let socket: Socket | undefined;
    try {
      const send = async () => {
        const addresses = await lookup(account.host, {
          all: true,
          verbatim: true,
        });
        if (timedOut) throw new MailDeliveryError("SMTP_TIMEOUT");
        if (
          !addresses.length ||
          addresses.some((a) => !publicSmtpAddress(a.address))
        )
          throw new MailDeliveryError("SMTP_HOST_NOT_PUBLIC");
        // Pin a validated address; a second DNS lookup cannot rebind into a private network.
        transport = nodemailer.createTransport({
          host: addresses[0]!.address,
          port: account.port,
          secure: account.security === "TLS",
          requireTLS: account.security === "STARTTLS",
          tls: {
            servername: account.host,
            rejectUnauthorized: true,
            minVersion: "TLSv1.2",
          },
          auth: { user: account.username, pass: account.password },
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 15_000,
          logger: false,
          debug: false,
          disableFileAccess: true,
          disableUrlAccess: true,
          // Own the underlying socket so the overall timeout can actually cancel
          // an active SMTP operation, including STARTTLS's wrapped socket.
          getSocket: (_options, callback) => {
            if (timedOut) {
              callback(new MailDeliveryError("SMTP_TIMEOUT"));
              return;
            }
            const options = { host: addresses[0]!.address, port: account.port };
            socket =
              account.security === "TLS"
                ? connectTls({
                    ...options,
                    servername: account.host,
                    rejectUnauthorized: true,
                    minVersion: "TLSv1.2",
                  })
                : connect(options);
            const pendingSocket = socket;
            const failed = (error: Error) => callback(error);
            pendingSocket.once("error", failed);
            pendingSocket.once(
              account.security === "TLS" ? "secureConnect" : "connect",
              () => {
                pendingSocket.removeListener("error", failed);
                if (timedOut) {
                  pendingSocket.destroy();
                  callback(new MailDeliveryError("SMTP_TIMEOUT"));
                  return;
                }
                callback(null, {
                  connection: pendingSocket,
                  secured: account.security === "TLS",
                });
              },
            );
          },
        });
        const result = await transport.sendMail({
          messageId: message.messageId,
          from: { name: account.fromName, address: account.fromEmail },
          replyTo: account.replyTo,
          to: { address: message.to, name: "" },
          subject: message.subject,
          text: message.text,
        });
        if (!result.accepted?.length || result.rejected?.length)
          throw new MailDeliveryError("SMTP_RECIPIENT_REJECTED");
      };
      await Promise.race([
        send(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            timedOut = true;
            reject(new MailDeliveryError("SMTP_TIMEOUT"));
          }, 30_000);
        }),
      ]);
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      const code = (error as { code?: string }).code;
      throw new MailDeliveryError(
        code === "EAUTH"
          ? "SMTP_AUTH_FAILED"
          : code === "ETIMEDOUT"
            ? "SMTP_TIMEOUT"
            : "SMTP_DELIVERY_FAILED",
      );
    } finally {
      if (timer) clearTimeout(timer);
      socket?.destroy();
      transport?.close();
    }
  }
}
