import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import {
  PairExistingKioskDto,
  UpdateKioskDeviceDto,
} from "../kiosks/dto/kiosk.dto.js";
import { KioskService } from "../kiosks/kiosk.service.js";
import { StoreRbacService } from "../rbac/store-rbac.service.js";
import { type StorePermissionCode } from "../rbac/store-permissions.js";
import { StoreImpersonationService } from "./store-impersonation.service.js";

@ApiTags("Store Kiosks")
@ApiBearerAuth()
@Controller("api/v1/admin/stores/:storeId/kiosks")
export class StoreKiosksController {
  constructor(
    private readonly auth: AuthService,
    private readonly rbac: StoreRbacService,
    private readonly impersonation: StoreImpersonationService,
    private readonly kiosks: KioskService,
  ) {}

  private async authorize(
    request: FastifyRequest,
    storeId: string,
    permission: StorePermissionCode,
  ) {
    const user = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    await this.impersonation.resolveStoreContext(user.id, storeId);
    await this.rbac.requireStoreResourcePermission(
      user.id,
      storeId,
      permission,
    );
    return user;
  }

  @Patch(":deviceId")
  async update(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
    @Body() input: UpdateKioskDeviceDto,
  ) {
    const user = await this.authorize(request, storeId, "kiosks.update");
    return this.kiosks.updateDevice(user.id, deviceId, input, storeId);
  }
  @Post(":deviceId/pair")
  async pairExisting(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
    @Body() input: PairExistingKioskDto,
  ) {
    const user = await this.authorize(request, storeId, "kiosks.pair");
    return this.kiosks.pairExistingKiosk(user.id, deviceId, input, storeId);
  }
  @Post(":deviceId/revoke")
  async revoke(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ) {
    const user = await this.authorize(request, storeId, "kiosks.revoke");
    return this.kiosks.revokeDevice(user.id, deviceId, storeId);
  }
  @Post(":deviceId/activate")
  async activate(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ) {
    const user = await this.authorize(request, storeId, "kiosks.update");
    return this.kiosks.activateDevice(user.id, deviceId, storeId);
  }
  @Post(":deviceId/deactivate")
  async deactivate(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ) {
    const user = await this.authorize(request, storeId, "kiosks.update");
    return this.kiosks.deactivateDevice(user.id, deviceId, storeId);
  }
  @Delete(":deviceId")
  async delete(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("deviceId", SelfxUuidParamPipe) deviceId: string,
  ) {
    const user = await this.authorize(request, storeId, "kiosks.revoke");
    return this.kiosks.deleteDevice(user.id, deviceId, storeId);
  }
}
