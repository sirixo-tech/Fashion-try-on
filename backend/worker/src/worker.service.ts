import { Injectable, OnModuleInit } from "@nestjs/common";

@Injectable()
export class WorkerService implements OnModuleInit {
  onModuleInit() {
    console.log("SelfX worker placeholder health: ok");
  }
}
