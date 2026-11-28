import "reflect-metadata";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { ApiOkResponse, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import ts from "typescript";
import { expect, it } from "vitest";

// Vitest's transformer omits design:type metadata. Use the production compiler
// settings so this exercises the same Swagger reflection as API startup.
const configPath = join(process.cwd(), "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
const options = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  process.cwd(),
).options;
const dtoPath = join(process.cwd(), "src/auth/dto/auth-response.dto.ts");
const program = ts.createProgram([dtoPath], options);
let compiled = "";
program.emit(program.getSourceFile(dtoPath), (filename, contents) => {
  if (filename.endsWith("auth-response.dto.js")) compiled = contents;
});
const dtoExports = {} as typeof import("./auth-response.dto.js");
runInNewContext(compiled, {
  exports: dtoExports,
  require: createRequire(join(process.cwd(), "package.json")),
  Reflect,
  String,
  Number,
  Boolean,
  Object,
  Array,
});

@Controller("swagger-session-regression")
class SwaggerSessionController {
  @Get()
  @ApiOkResponse({ type: dtoExports.AuthTokenResponseDto })
  response() {
    return { ok: true };
  }
}
@Module({ controllers: [SwaggerSessionController] })
class SwaggerSessionModule {}

it("generates the auth session schema before the API starts serving requests", async () => {
  const app = await NestFactory.create<NestFastifyApplication>(
    SwaggerSessionModule,
    new FastifyAdapter(),
    { logger: false, abortOnError: false },
  );
  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    expect(document.components?.schemas?.AuthTokenResponseDto).toMatchObject({
      properties: {
        session: { $ref: "#/components/schemas/AuthSessionResponseDto" },
      },
    });
    expect(document.components?.schemas?.AuthSessionResponseDto).toMatchObject({
      properties: {
        serverTime: { type: "string", format: "date-time" },
        reauthDueAt: { type: "string", format: "date-time" },
        hardExpiresAt: { type: "string", format: "date-time" },
        expiresAt: { type: "string", format: "date-time" },
        idleTimeoutSeconds: { type: "integer" },
        sessionId: { type: "string" },
      },
    });
    await app.init();
    const response = await app.inject({
      method: "GET",
      url: "/swagger-session-regression",
    });
    expect(response.statusCode).toBe(200);
  } finally {
    await app.close();
  }
});
