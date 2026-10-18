import { Controller, Get, Headers } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { ApiErrorResponseDto } from "../auth/dto/auth-response.dto.js";
import { KioskConfigurationDto } from "./dto/kiosk.dto.js";
import { KioskConfigurationService } from "./kiosk-configuration.service.js";

@ApiTags("Kiosk Configuration")
@Controller("api/v1/kiosk")
export class KioskConfigurationController {
  constructor(private readonly configurations: KioskConfigurationService) {}

  @Get("configuration")
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Return current device-authenticated kiosk configuration",
  })
  @ApiOkResponse({ type: KioskConfigurationDto })
  @ApiResponse({ status: 401, type: ApiErrorResponseDto })
  @ApiResponse({ status: 403, type: ApiErrorResponseDto })
  async get(
    @Headers("authorization") authorization: string | undefined,
  ): Promise<KioskConfigurationDto> {
    return this.configurations.getDeviceConfiguration(authorization);
  }
}
