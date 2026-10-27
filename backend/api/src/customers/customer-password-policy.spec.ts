import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { CUSTOMER_TERMS_VERSION } from "./customer.config.js";
import { CustomerResetDto, CustomerSignupDto } from "./customer.dto.js";

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

describe("Customer account password policy", () => {
  for (const flow of [
    {
      name: "signup",
      metatype: CustomerSignupDto,
      input: {
        email: "customer@example.test",
        displayName: "Customer",
        acceptTerms: true,
        termsVersion: CUSTOMER_TERMS_VERSION,
      },
    },
    {
      name: "password reset",
      metatype: CustomerResetDto,
      input: { email: "customer@example.test", code: "123456" },
    },
  ]) {
    it(`${flow.name} accepts 8–128 characters and rejects shorter or longer passwords`, async () => {
      for (const length of [8, 12, 128]) {
        const password = "a".repeat(length);
        await expect(
          pipe.transform(
            { ...flow.input, password },
            { type: "body", metatype: flow.metatype },
          ),
        ).resolves.toMatchObject({ password });
      }
      for (const length of [0, 7, 129]) {
        await expect(
          pipe.transform(
            { ...flow.input, password: "a".repeat(length) },
            { type: "body", metatype: flow.metatype },
          ),
        ).rejects.toThrow();
      }
    });
  }
});
