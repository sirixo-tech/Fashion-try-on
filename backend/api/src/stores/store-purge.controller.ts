import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  Param,
  Req,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { PlatformAuthorizationService } from "../platform/platform-authorization.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { ApiErrorException } from "../common/api-error.exception.js";
import { StorePurgeService, PurgeStoreDto } from "./store-purge.service.js";
@ApiTags("Stores")
@ApiBearerAuth()
@Controller("api/v1/admin/stores")
export class StorePurgeController {
  constructor(
    private readonly auth: AuthService,
    private readonly authorization: PlatformAuthorizationService,
    private readonly purgeService: StorePurgeService,
  ) {}
  @Delete(":storeId/permanent") async purge(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Body() input: PurgeStoreDto,
  ) {
    const actor = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    if (!(await this.authorization.isSuperadmin(actor.id)))
      throw new ApiErrorException(
        HttpStatus.FORBIDDEN,
        "PLATFORM_PERMISSION_DENIED",
        "Only Superadmins can permanently delete Stores.",
      );
    return this.purgeService.purge(actor.id, storeId, input);
  }
}
