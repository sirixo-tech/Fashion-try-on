import "reflect-metadata";

import { HttpStatus, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyMultipart from "@fastify/multipart";

import { AppModule } from "./app.module.js";
import { loadAuthConfig } from "./auth/auth.config.js";
import { AUTH_ERROR_CODES } from "./auth/auth.constants.js";
import { ApiErrorException } from "./common/api-error.exception.js";
import { PrismaExceptionFilter } from "./common/prisma-exception.filter.js";
import { loadApiServerConfig } from "./config/api-server.config.js";
import { loadSelfxEnv } from "./config/load-env.js";
import { TRY_ON_LAB_MULTIPART_LIMITS } from "./try-on-lab/try-on-lab.constants.js";

loadSelfxEnv();

async function bootstrap() {
  const authConfig = loadAuthConfig();
  const serverConfig = loadApiServerConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(fastifyCookie);
  await app.register(fastifyCors, {
    origin: authConfig.corsAllowedOrigins,
    credentials: true,
  });
  await app.register(fastifyMultipart, {
    limits: TRY_ON_LAB_MULTIPART_LIMITS,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: () =>
        new ApiErrorException(
          HttpStatus.BAD_REQUEST,
          AUTH_ERROR_CODES.validationFailed,
          "Request validation failed.",
        ),
    }),
  );
  app.useGlobalFilters(new PrismaExceptionFilter());

  const openApiConfig = new DocumentBuilder()
    .setTitle("SelfX API")
    .setDescription("SelfX Virtual Try-On API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("api/docs", app, document);

  await app.listen(serverConfig.port, "0.0.0.0");

  console.log(`SelfX API listening on http://localhost:${serverConfig.port}`);
}

void bootstrap();
