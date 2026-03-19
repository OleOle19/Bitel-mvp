import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { LocalsService } from "./locals.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";
import { CreateLocalDto } from "./dto/create-local.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("locals")
export class LocalsController {
  constructor(private localsService: LocalsService) {}

  @Roles(Role.ADMIN)
  @Get()
  list() {
    return this.localsService.list();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Get("lookup")
  lookup() {
    return this.localsService.lookup();
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateLocalDto) {
    return this.localsService.create(dto);
  }
}
