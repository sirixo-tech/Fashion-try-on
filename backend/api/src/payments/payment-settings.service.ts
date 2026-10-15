import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createSelfxId } from "@selfx/database";
import { ApiErrorException } from "../common/api-error.exception.js";
import { PrismaService } from "../database/prisma.service.js";
import { encryptProviderSecret } from "../integrations/provider-secret-cipher.js";
import { PAYMENT_GATEWAYS, type PaymentProvider } from "./payment-gateways.js";
import type {
  SavePhonePeConnectionDto,
  SelectPaymentGatewayDto,
  UpdateGatewayPolicyDto,
} from "./payment-settings.dto.js";

@Injectable()
export class PaymentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listGateways() {
    const rows = await this.prisma.paymentGatewayPolicy.findMany();
    return {
      data: PAYMENT_GATEWAYS.map((gateway) => {
        const row = rows.find((item) => item.provider === gateway.provider);
        return {
          ...gateway,
          enabled: row?.enabled ?? false,
          version: row?.version ?? 0,
          paymentAvailable: false as const,
        };
      }),
    };
  }

  async updatePolicy(
    provider: string,
    actorUserId: string,
    input: UpdateGatewayPolicyDto,
  ) {
    const gateway = PAYMENT_GATEWAYS.find((item) => item.provider === provider);
    if (!gateway || (input.enabled && !gateway.setupAvailable))
      fail(
        "PAYMENT_GATEWAY_UNAVAILABLE",
        "This gateway does not support configuration yet.",
      );
    // A transaction-level advisory lock also serializes first creation.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-policy:${provider}`}, 0))::text`;
      const old = await tx.paymentGatewayPolicy.findUnique({
        where: { provider },
      });
      revision(old?.version ?? 0, input.expectedVersion);
      await tx.paymentGatewayPolicy.upsert({
        where: { provider },
        create: { provider, enabled: input.enabled },
        update: { enabled: input.enabled, version: { increment: 1 } },
      });
      await audit(
        tx,
        actorUserId,
        null,
        "PAYMENT_GATEWAY_POLICY_UPDATED",
        provider,
        { enabled: input.enabled },
      );
    });
    return this.listGateways();
  }

  async getStore(storeId: string) {
    await this.requireStore(this.prisma, storeId);
    const [settings, connections, gateways] = await Promise.all([
      this.prisma.storePaymentSettings.findUnique({
        where: { organizationId: storeId },
      }),
      this.prisma.storePaymentConnection.findMany({
        where: { organizationId: storeId },
        select: {
          provider: true,
          environment: true,
          updatedAt: true,
          dqrAccessConfirmed: true,
        },
        orderBy: { provider: "asc" },
      }),
      this.listGateways(),
    ]);
    return {
      version: settings?.version ?? 0,
      selectedProvider: settings?.selectedProvider ?? null,
      paymentAvailable: false as const,
      gateways: gateways.data,
      connections: connections.map((item) => ({
        ...item,
        status: "UNVERIFIED" as const,
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async savePhonePe(
    storeId: string,
    actorUserId: string,
    input: SavePhonePeConnectionDto,
  ) {
    const { key, version: keyVersion } = paymentEncryptionKey();
    if (input.dqrAccessConfirmed && input.environment !== "UAT")
      fail(
        "PAYMENT_ENVIRONMENT_UNCONFIRMED",
        "Only confirmed UAT Dynamic QR access is supported for payment testing.",
      );
    // Bind encrypted contents to the tenant/provider; never return or audit them.
    const encrypted = encryptProviderSecret(
      {
        organizationId: storeId,
        provider: "PHONEPE",
        merchantId: input.merchantId,
        providerId: input.providerId,
        providerStoreId:
          input.providerStoreId ?? `SX${storeId.replaceAll("-", "")}`,
        saltIndex: input.saltIndex,
        saltKey: input.saltKey,
        environment: input.environment,
      },
      key,
    );
    await this.prisma.$transaction(async (tx) => {
      await this.requireAvailable(tx, "PHONEPE");
      await this.lockStore(tx, storeId, input.expectedVersion);
      await tx.storePaymentConnection.upsert({
        where: {
          organizationId_provider: {
            organizationId: storeId,
            provider: "PHONEPE",
          },
        },
        create: {
          id: createSelfxId(),
          organizationId: storeId,
          provider: "PHONEPE",
          environment: input.environment,
          dqrAccessConfirmed: input.dqrAccessConfirmed ?? false,
          ...encrypted,
          keyVersion,
        },
        update: {
          environment: input.environment,
          dqrAccessConfirmed: input.dqrAccessConfirmed ?? false,
          ...encrypted,
          keyVersion,
        },
      });
      await this.bump(tx, storeId);
      await audit(
        tx,
        actorUserId,
        storeId,
        "STORE_PAYMENT_CONNECTION_SAVED",
        "PHONEPE",
        {
          environment: input.environment,
          dqrAccessConfirmed: input.dqrAccessConfirmed ?? false,
        },
      );
    });
    return this.getStore(storeId);
  }

  async select(
    storeId: string,
    actorUserId: string,
    input: SelectPaymentGatewayDto,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // Lock policy before tenant consistently. A disabled gateway can stay
      // configured, but cannot be newly selected for future checkout.
      if (input.provider) {
        await this.requireAvailable(tx, input.provider);
      }
      await this.lockStore(tx, storeId, input.expectedVersion);
      if (
        input.provider &&
        !(await tx.storePaymentConnection.findUnique({
          where: {
            organizationId_provider: {
              organizationId: storeId,
              provider: input.provider,
            },
          },
          select: { id: true },
        }))
      )
        fail(
          "PAYMENT_CONNECTION_REQUIRED",
          "Configure this Store's merchant account first.",
        );
      await this.bump(tx, storeId, input.provider);
      await audit(
        tx,
        actorUserId,
        storeId,
        "STORE_PAYMENT_GATEWAY_SELECTED",
        input.provider ?? "NONE",
        {},
      );
    });
    return this.getStore(storeId);
  }

  private async lockStore(
    tx: Prisma.TransactionClient,
    storeId: string,
    expected: number,
  ) {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${storeId}::uuid FOR UPDATE`;
    await this.requireStore(tx, storeId);
    const settings = await tx.storePaymentSettings.findUnique({
      where: { organizationId: storeId },
    });
    revision(settings?.version ?? 0, expected);
  }
  private async requireAvailable(
    tx: Prisma.TransactionClient,
    provider: PaymentProvider,
  ) {
    const policy = await tx.$queryRaw<
      Array<{ enabled: boolean }>
    >`SELECT enabled FROM payment_gateway_policies WHERE provider = ${provider} FOR SHARE`;
    if (
      !PAYMENT_GATEWAYS.find((item) => item.provider === provider)
        ?.setupAvailable ||
      !policy[0]?.enabled
    )
      fail(
        "PAYMENT_GATEWAY_DISABLED",
        "This gateway is not available for configuration or selection.",
      );
  }
  private async requireStore(tx: Prisma.TransactionClient, storeId: string) {
    if (
      !(await tx.organization.findFirst({
        where: { id: storeId, status: { not: "ARCHIVED" } },
        select: { id: true },
      }))
    )
      throw new ApiErrorException(
        HttpStatus.NOT_FOUND,
        "STORE_NOT_FOUND",
        "Store was not found.",
      );
  }
  private async bump(
    tx: Prisma.TransactionClient,
    storeId: string,
    provider?: PaymentProvider | null,
  ) {
    await tx.storePaymentSettings.upsert({
      where: { organizationId: storeId },
      create: { organizationId: storeId, selectedProvider: provider ?? null },
      update: {
        version: { increment: 1 },
        ...(provider !== undefined ? { selectedProvider: provider } : {}),
      },
    });
  }
}
function revision(actual: number, expected: number) {
  if (actual !== expected)
    fail(
      "PAYMENT_SETTINGS_CHANGED",
      "Payment settings changed. Reload before saving.",
    );
}
function fail(code: string, message: string): never {
  throw new ApiErrorException(HttpStatus.CONFLICT, code, message);
}
export function paymentEncryptionKey(env: NodeJS.ProcessEnv = process.env) {
  const encoded = env.SELFX_PAYMENT_ENCRYPTION_KEY?.trim() ?? "";
  const key = Buffer.from(encoded, "base64");
  const version = env.SELFX_PAYMENT_ENCRYPTION_KEY_VERSION?.trim() || "v1";
  if (
    key.length !== 32 ||
    key.toString("base64") !== encoded ||
    !/^[A-Za-z0-9_-]{1,40}$/.test(version)
  )
    throw new ApiErrorException(
      HttpStatus.SERVICE_UNAVAILABLE,
      "PAYMENT_ENCRYPTION_UNAVAILABLE",
      "Secure payment configuration is not available. Contact SelfX support.",
    );
  return { key, version };
}
async function audit(
  tx: Prisma.TransactionClient,
  actorUserId: string,
  organizationId: string | null,
  action: string,
  resourceId: string,
  metadata: Prisma.InputJsonObject,
) {
  await tx.auditLog.create({
    data: {
      id: createSelfxId(),
      actorUserId,
      organizationId,
      action,
      resourceType: "payment_configuration",
      resourceId: organizationId,
      metadata: { ...metadata, provider: resourceId },
    },
  });
}
