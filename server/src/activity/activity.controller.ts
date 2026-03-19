import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { ActivityService } from "./activity.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("activity")
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  @Roles(Role.ADMIN)
  @Get()
  list(
    @Query("localId") localId?: string,
    @Query("user") user?: string,
    @Query("userId") userId?: string,
    @Query("action") action?: string,
    @Query("entity") entity?: string,
    @Query("from") from?: string,
    @Query("to") to?: string
  ) {
    return this.activityService.list({
      localId,
      user: user || userId,
      action,
      entity,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined
    });
  }
}
