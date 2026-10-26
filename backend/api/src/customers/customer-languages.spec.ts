import { ValidationPipe } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  CustomerProfileDto,
  CustomerSignupDto,
  CustomerOAuthDto,
} from "./customer.dto.js";
import { CUSTOMER_LANGUAGES } from "./customer-languages.js";
import { customerNotificationCopy } from "./customer-notification-copy.js";
const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});
describe("Customer language contracts", () => {
  it("allows only the 20 bundled languages on owned profile updates", async () => {
    expect(CUSTOMER_LANGUAGES).toHaveLength(20);
    for (const language of CUSTOMER_LANGUAGES)
      expect(
        await pipe.transform(
          { language },
          { type: "body", metatype: CustomerProfileDto },
        ),
      ).toMatchObject({ language });
    await expect(
      pipe.transform(
        { language: "xx" },
        { type: "body", metatype: CustomerProfileDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { language: "ar", customerId: "other" },
        { type: "body", metatype: CustomerProfileDto },
      ),
    ).rejects.toThrow();
  });
  it("supports language on signup and OAuth without changing their proof requirements", async () => {
    await expect(
      pipe.transform(
        { language: "ta" },
        { type: "body", metatype: CustomerSignupDto },
      ),
    ).rejects.toThrow();
    await expect(
      pipe.transform(
        { language: "ar" },
        { type: "body", metatype: CustomerOAuthDto },
      ),
    ).rejects.toThrow();
  });
  it("localizes notification text and safely falls back for historic unsupported languages", () => {
    const english = customerNotificationCopy("en");
    for (const language of CUSTOMER_LANGUAGES) {
      const copy = customerNotificationCopy(language);
      expect(copy.title).toBeTruthy();
      expect(copy.body).toBeTruthy();
      expect(copy.pushBody).not.toContain("http");
      if (language !== "en") expect(copy.title).not.toBe(english.title);
    }
    expect(customerNotificationCopy("unknown")).toEqual(english);
  });
});
