import { BadRequestException, Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ClientsService } from "./clients.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";
import { CreateClientDto } from "./dto/create-client.dto";
import { CreateLineDto } from "./dto/create-line.dto";
import { CurrentUser } from "../common/current-user.decorator";
import { ClientAccountEntryDto } from "./dto/client-account-entry.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("clients")
export class ClientsController {
  constructor(private clientsService: ClientsService) {}

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post()
  create(@Body() dto: CreateClientDto, @CurrentUser() user: any) {
    const canCrossLocal = user.role === Role.ADMIN || user.role === Role.AUDITOR;
    const scopedLocalId = canCrossLocal ? dto.localId : user.localId;
    if (!canCrossLocal && !scopedLocalId) {
      throw new BadRequestException("Local no asignado");
    }
    return this.clientsService.create({ ...dto, localId: scopedLocalId });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post("line")
  addLine(@Body() dto: CreateLineDto) {
    return this.clientsService.addLine(dto);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("lookup-document")
  lookupDocument(
    @Query("documentId") documentId: string,
    @Query("localId") localId: string | undefined,
    @CurrentUser() user: any
  ) {
    const canCrossLocal = user.role === Role.ADMIN || user.role === Role.AUDITOR;
    const scopedLocalId = canCrossLocal ? localId : user.localId;
    return this.clientsService.lookupDocument(documentId, scopedLocalId);
  }

  @Roles(Role.ADMIN, Role.VENDEDOR, Role.AUDITOR)
  @Get("search")
  search(@Query("q") q: string) {
    return this.clientsService.search(q ?? "");
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("history")
  history(@Query("clientId") clientId: string) {
    return this.clientsService.history(clientId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("account")
  account(@Query("clientId") clientId: string) {
    return this.clientsService.account(clientId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post("account/debt")
  addDebt(@Body() dto: ClientAccountEntryDto, @CurrentUser() user: any) {
    return this.clientsService.addDebt(dto, user.id);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post("account/payment")
  addPayment(@Body() dto: ClientAccountEntryDto, @CurrentUser() user: any) {
    return this.clientsService.addPayment(dto, user.id);
  }
}
