import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { SalesService } from "./sales.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { CurrentUser } from "../common/current-user.decorator";
import { CancelSaleDto } from "./dto/cancel-sale.dto";
import { SendSaleReceiptDto } from "./dto/send-sale-receipt.dto";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import { renderSaleReceiptPdf } from "./sale-receipt.pdf";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("sales")
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get()
  list(
    @Query("localId") localId: string | undefined,
    @Query("status") status: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    return this.salesService.list(scopeLocalId, status);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post()
  create(@Body() dto: CreateSaleDto, @CurrentUser() user: any) {
    const scopedLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? dto.localId : user.localId;
    if (!scopedLocalId) {
      throw new BadRequestException("Local no asignado");
    }
    const { receiptNumber: _ignored, ...safeDto } = dto;
    return this.salesService.create({ ...safeDto, localId: scopedLocalId }, user.id);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelSaleDto, @CurrentUser() user: any) {
    return this.salesService.cancel(id, dto, user.id);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post(":id/receipt/send")
  sendReceipt(
    @Param("id") id: string,
    @Body() dto: SendSaleReceiptDto,
    @CurrentUser() user: any
  ) {
    return this.salesService.sendReceiptByEmail(id, dto.email, user.id);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get(":id/receipt.pdf")
  async receipt(@Param("id") id: string, @Res() res: Response) {
    const sale = await this.salesService.getById(id);
    if (!sale) {
      res.status(404).send("No encontrado");
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=comprobante.pdf");

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);
    renderSaleReceiptPdf(doc, sale);
    doc.end();
  }
}

