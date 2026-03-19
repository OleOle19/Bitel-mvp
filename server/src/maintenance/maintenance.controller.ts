import { BadRequestException, Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";
import { MaintenanceService } from "./maintenance.service";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("maintenance")
export class MaintenanceController {
  constructor(private maintenanceService: MaintenanceService) {}

  @Roles(Role.ADMIN)
  @Post("reset-demo")
  resetDemo(@Body() body: { confirm?: string }) {
    if (body?.confirm !== "RESET") {
      throw new BadRequestException(
        "Confirmacion requerida. Envia {\"confirm\":\"RESET\"} para borrar datos de demo."
      );
    }
    return this.maintenanceService.resetDemoData();
  }
}

