import { BadRequestException, Body, Controller, Get, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { CashService } from "./cash.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";
import { OpenCashDto } from "./dto/open-cash.dto";
import { CloseCashDto } from "./dto/close-cash.dto";
import { ForceCloseDto } from "./dto/force-close.dto";
import { CurrentUser } from "../common/current-user.decorator";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import { CashTransactionDto } from "./dto/cash-transaction.dto";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("cash")
export class CashController {
  constructor(private cashService: CashService) {}

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get()
  list(@Query("localId") localId: string | undefined, @CurrentUser() user: any) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    return this.cashService.list(scopeLocalId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post("open")
  open(@Body() dto: OpenCashDto, @CurrentUser() user: any) {
    const scopedLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? dto.localId : user.localId;
    if (!scopedLocalId) {
      throw new BadRequestException("Local no asignado");
    }
    return this.cashService.open({ ...dto, localId: scopedLocalId }, user.id, user.role);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post("close")
  close(@Body() dto: CloseCashDto, @CurrentUser() user: any) {
    return this.cashService.close(dto, user.id, user.role, user.localId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR)
  @Post("force-close")
  forceClose(@Body() dto: ForceCloseDto, @CurrentUser() user: any) {
    const scopedLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? dto.localId : user.localId;
    if (!scopedLocalId) {
      throw new BadRequestException("Local no asignado");
    }
    return this.cashService.forceClose({ ...dto, localId: scopedLocalId }, user.id);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get(":id/receipt.pdf")
  async receipt(@Param("id") id: string, @Res() res: Response) {
    const session = await this.cashService.getById(id);
    if (!session) {
      res.status(404).send("No encontrado");
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=cierre-caja.pdf");

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    const toNumber = (value: unknown) => {
      if (value === null || value === undefined) return 0;
      if (typeof value === "number") return value;
      if (typeof value === "string") return Number(value);
      const decimal = value as { toNumber?: () => number; toString?: () => string };
      if (typeof decimal.toNumber === "function") return decimal.toNumber();
      if (typeof decimal.toString === "function") return Number(decimal.toString());
      return Number(value);
    };
    const formatMoney = (value: unknown) => `S/ ${toNumber(value).toFixed(2)}`;
    const formatDate = (value?: Date | null) =>
      value ? value.toISOString().replace("T", " ").slice(0, 16) : "Pendiente";

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const headerHeight = 50;

    doc.rect(margin, margin, contentWidth, headerHeight).fill("#0f172a");
    doc.fillColor("#ffffff").fontSize(18).text("BITEL", margin + 12, margin + 16);
    doc.fontSize(12).text("CIERRE DE CAJA", 0, margin + 20, { align: "right" });
    doc.fillColor("#111827");

    doc.y = margin + headerHeight + 20;

    const localCode = session.local?.code ?? "N/A";
    const localName = session.local?.name ?? "N/A";
    const openedAt = formatDate(session.openedAt);
    const closedAt = formatDate(session.closedAt);
    const approvedBy = session.user?.fullName || session.user?.email || "N/A";

    const leftX = margin;
    const rightX = margin + contentWidth / 2 + 10;
    const rowGap = 28;

    doc.fontSize(9).fillColor("#6b7280").text("LOCAL", leftX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(`${localCode} - ${localName}`, leftX, doc.y + 12);

    doc.fontSize(9).fillColor("#6b7280").text("SESION", rightX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(session.id, rightX, doc.y + 12);

    doc.y += rowGap;
    doc.fontSize(9).fillColor("#6b7280").text("APERTURA", leftX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(openedAt, leftX, doc.y + 12);

    doc.fontSize(9).fillColor("#6b7280").text("CIERRE", rightX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(closedAt, rightX, doc.y + 12);

    doc.y += rowGap;
    doc.fontSize(9).fillColor("#6b7280").text("RESPONSABLE", leftX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(approvedBy, leftX, doc.y + 12);

    doc.fontSize(9).fillColor("#6b7280").text("ESTADO", rightX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(session.status, rightX, doc.y + 12);

    doc.y += rowGap + 10;
    doc.fontSize(12).fillColor("#111827").text("Resumen", margin, doc.y);
    doc.moveDown(0.5);

    const tableX = margin;
    let tableY = doc.y;
    const rowHeight = 24;
    const labelWidth = contentWidth * 0.6;

    const drawRow = (label: string, value: string, highlight?: "pos" | "neg") => {
      doc.rect(tableX, tableY, contentWidth, rowHeight).stroke("#e5e7eb");
      doc.fillColor("#111827").fontSize(10).text(label, tableX + 10, tableY + 7);
      const valueColor =
        highlight === "pos" ? "#059669" : highlight === "neg" ? "#dc2626" : "#111827";
      doc
        .fillColor(valueColor)
        .fontSize(10)
        .text(value, tableX + labelWidth, tableY + 7, {
          width: contentWidth - labelWidth - 10,
          align: "right"
        });
      tableY += rowHeight;
    };

    drawRow("Monto de apertura", formatMoney(session.openingAmount));
    if (session.expectedAmount !== null && session.expectedAmount !== undefined) {
      drawRow("Monto esperado", formatMoney(session.expectedAmount));
    }
    drawRow("Monto de cierre", formatMoney(session.closingAmount ?? 0));
    const diff = Number(session.difference ?? 0);
    drawRow(
      "Diferencia",
      formatMoney(diff),
      diff > 0 ? "pos" : diff < 0 ? "neg" : undefined
    );

    doc.moveDown(1.5);
    doc
      .fontSize(9)
      .fillColor("#6b7280")
      .text(`Generado: ${formatDate(new Date())}`, margin, doc.y, { align: "right" });

    doc.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get(":id/transactions")
  transactions(@Param("id") id: string, @CurrentUser() user: any) {
    return this.cashService.listTransactions(id, user.role, user.localId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Post(":id/transactions")
  createTransaction(
    @Param("id") id: string,
    @Body() dto: CashTransactionDto,
    @CurrentUser() user: any
  ) {
    return this.cashService.createTransaction(id, dto, user.id, user.role, user.localId);
  }
}
