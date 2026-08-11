import "reflect-metadata";

import { NestFactory } from "@nestjs/core";

import { WorkerModule } from "./worker.module.js";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);

  console.log("SelfX worker placeholder started.");

  if (process.env.SELFX_WORKER_SELF_CHECK === "true") {
    await app.close();
    return;
  }

  const shutdown = async () => {
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void shutdown();
  });
  process.on("SIGTERM", () => {
    void shutdown();
  });
}

void bootstrap();
