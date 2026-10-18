import { Body, Controller, Delete, Param, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { type FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service.js";
import { SelfxUuidParamPipe } from "../common/uuid-param.pipe.js";
import { DeleteStoreMemberDto } from "./dto/users.dto.js";
import { UserDeletionService } from "./user-deletion.service.js";

@ApiTags("Store users")
@ApiBearerAuth()
@Controller("api/v1/admin/stores/:storeId/users")
export class StoreUserDeletionController {
  constructor(
    private readonly auth: AuthService,
    private readonly deletion: UserDeletionService,
  ) {}
  @Delete(":membershipId") async remove(
    @Req() request: FastifyRequest,
    @Param("storeId", SelfxUuidParamPipe) storeId: string,
    @Param("membershipId", SelfxUuidParamPipe) membershipId: string,
    @Body() input: DeleteStoreMemberDto,
  ) {
    const actor = await this.auth.requireAccessUser(
      request.headers.authorization,
    );
    return this.deletion.deleteStoreMember(
      actor.id,
      storeId,
      membershipId,
      input,
    );
  }
}
