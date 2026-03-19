import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { InventoryService } from "./inventory.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { UpdateInventoryDto } from "./dto/update-inventory.dto";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { CreateTransferBatchDto } from "./dto/create-transfer-batch.dto";
import { ReceiveTransferDto } from "./dto/receive-transfer.dto";
import { ReceiveTransferBatchDto } from "./dto/receive-transfer-batch.dto";
import { ObserveTransferDto } from "./dto/observe-transfer.dto";
import { ObserveTransferBatchDto } from "./dto/observe-transfer-batch.dto";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { ImportInventoryDto } from "./dto/import-inventory.dto";
import { ImportInventoryExcelDto } from "./dto/import-inventory-excel.dto";
import { CurrentUser } from "../common/current-user.decorator";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  private canCrossLocalScope(user: any) {
    return user?.role === Role.ADMIN || user?.role === Role.AUDITOR;
  }

  private scopedUserLocalId(user: any) {
    return this.canCrossLocalScope(user) ? undefined : user?.localId;
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Get()
  list(@Query("localId") localId: string | undefined, @CurrentUser() user: any) {
    const scopeLocalId = this.canCrossLocalScope(user) ? localId : user.localId;
    return this.inventoryService.list(scopeLocalId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Get("movements")
  movements(
    @Query("localId") localId: string | undefined,
    @Query("itemId") itemId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId = this.canCrossLocalScope(user) ? localId : user.localId;
    const fromDate = from ? new Date(`${from}T00:00:00.000`) : undefined;
    const toDate = to ? new Date(`${to}T23:59:59.999`) : undefined;
    return this.inventoryService.listMovements(scopeLocalId, itemId, fromDate, toDate);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Get("transfers")
  transfers(@Query("localId") localId: string | undefined, @CurrentUser() user: any) {
    const scopeLocalId = this.canCrossLocalScope(user) ? localId : user.localId;
    return this.inventoryService.listTransfers(scopeLocalId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post()
  create(@Body() dto: CreateInventoryDto, @CurrentUser() user: any) {
    const scopedLocalId = this.canCrossLocalScope(user) ? dto.localId : user.localId;
    if (!scopedLocalId) {
      throw new BadRequestException("Local no asignado");
    }
    return this.inventoryService.create(
      { ...dto, localId: scopedLocalId, cost: 0 },
      user.id,
      this.scopedUserLocalId(user)
    );
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateInventoryDto, @CurrentUser() user: any) {
    return this.inventoryService.update(id, dto, user.id, this.scopedUserLocalId(user));
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("adjust")
  adjust(@Body() dto: AdjustInventoryDto, @CurrentUser() user: any) {
    return this.inventoryService.adjust(dto, user.id, this.scopedUserLocalId(user));
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("transfer")
  transfer(@Body() dto: CreateTransferDto, @CurrentUser() user: any) {
    return this.inventoryService.createTransfer(dto, user.id, this.scopedUserLocalId(user));
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("transfer/batch")
  transferBatch(@Body() dto: CreateTransferBatchDto, @CurrentUser() user: any) {
    return this.inventoryService.createTransferBatch(dto, user.id, this.scopedUserLocalId(user));
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("transfer/receive")
  receive(@Body() dto: ReceiveTransferDto, @CurrentUser() user: any) {
    return this.inventoryService.receiveTransfer(dto, user.id, this.scopedUserLocalId(user));
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("transfer/batch/receive")
  receiveBatch(@Body() dto: ReceiveTransferBatchDto, @CurrentUser() user: any) {
    return this.inventoryService.receiveTransferBatch(
      dto,
      user.id,
      this.scopedUserLocalId(user)
    );
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("transfer/observe")
  observe(@Body() dto: ObserveTransferDto, @CurrentUser() user: any) {
    return this.inventoryService.observeTransfer(dto, user.id, this.scopedUserLocalId(user));
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("transfer/batch/observe")
  observeBatch(@Body() dto: ObserveTransferBatchDto, @CurrentUser() user: any) {
    return this.inventoryService.observeTransferBatch(
      dto,
      user.id,
      this.scopedUserLocalId(user)
    );
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("import")
  importCsv(@Body() dto: ImportInventoryDto, @CurrentUser() user: any) {
    const scopedLocalId = this.canCrossLocalScope(user) ? dto.localId : user.localId;
    if (!scopedLocalId) {
      throw new BadRequestException("Local no asignado");
    }
    return this.inventoryService.importCsv(
      { ...dto, localId: scopedLocalId },
      user.id,
      this.scopedUserLocalId(user)
    );
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Post("import-excel")
  importExcel(@Body() dto: ImportInventoryExcelDto, @CurrentUser() user: any) {
    const scopedLocalId = this.canCrossLocalScope(user) ? dto.localId : user.localId;
    if (!scopedLocalId) {
      throw new BadRequestException("Local no asignado");
    }
    return this.inventoryService.importExcel(
      { ...dto, localId: scopedLocalId },
      user.id,
      this.scopedUserLocalId(user)
    );
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Get("template.xlsx")
  async templateXlsx(@Res() res: Response) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Plantilla");

    sheet.columns = [
      { header: "sku", key: "sku", width: 18 },
      { header: "name", key: "name", width: 34 },
      { header: "category", key: "category", width: 18 },
      { header: "quantity", key: "quantity", width: 12 },
      { header: "minStock", key: "minStock", width: 12 },
      { header: "price", key: "price", width: 12 }
    ];

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    headerRow.alignment = { vertical: "middle" };
    headerRow.height = 18;

    sheet.addRow({
      sku: "CABLE-USBC",
      name: "Cable USB-C",
      category: "Accesorios",
      quantity: 30,
      minStock: 5,
      price: 10
    });
    sheet.addRow({
      sku: "ACC-001",
      name: "Cargador 20W",
      category: "Accesorios",
      quantity: 12,
      minStock: 3,
      price: 45
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=plantilla-inventario.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Get("transfer/batch/:batchCode/receipt.pdf")
  async transferBatchReceipt(@Param("batchCode") batchCode: string, @Res() res: Response) {
    const transfers = await this.inventoryService.getTransfersByBatchCode(batchCode);
    if (!transfers || transfers.length === 0) {
      res.status(404).send("No encontrado");
      return;
    }

    const first = transfers[0];
    const formatDate = (value?: Date | null) =>
      value ? value.toISOString().replace("T", " ").slice(0, 16) : "N/A";
    const status = transfers.some((t: any) => t.status === "OBSERVED")
      ? "OBSERVED"
      : transfers.every((t: any) => t.status === "RECEIVED")
        ? "RECEIVED"
        : "SENT";
    const statusLabel =
      status === "OBSERVED" ? "Observado" : status === "RECEIVED" ? "Recibido" : "Enviado";

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=envio-lote.pdf");

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const headerHeight = 50;

    doc.rect(margin, margin, contentWidth, headerHeight).fill("#0f172a");
    doc.fillColor("#ffffff").fontSize(18).text("BITEL", margin + 12, margin + 16);
    doc.fontSize(12).text("ENVIO POR LOTE", 0, margin + 20, { align: "right" });
    doc.fillColor("#111827");

    doc.y = margin + headerHeight + 18;

    const fromLabel = `${first.fromLocal?.code ?? first.fromLocalId} - ${first.fromLocal?.name ?? ""}`.trim();
    const toLabel = `${first.toLocal?.code ?? first.toLocalId} - ${first.toLocal?.name ?? ""}`.trim();

    const leftX = margin;
    const rightX = margin + contentWidth / 2 + 10;
    const rowGap = 28;

    doc.fontSize(9).fillColor("#6b7280").text("CODIGO ENVIO", leftX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(String(batchCode), leftX, doc.y + 12);
    doc.fontSize(9).fillColor("#6b7280").text("FECHA", rightX, doc.y);
    doc
      .fontSize(11)
      .fillColor("#111827")
      .text(formatDate(first.createdAt), rightX, doc.y + 12);

    doc.y += rowGap;
    doc.fontSize(9).fillColor("#6b7280").text("ORIGEN", leftX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(fromLabel, leftX, doc.y + 12);
    doc.fontSize(9).fillColor("#6b7280").text("DESTINO", rightX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(toLabel, rightX, doc.y + 12);

    doc.y += rowGap;
    doc.fontSize(9).fillColor("#6b7280").text("ENVIADO POR", leftX, doc.y);
    doc
      .fontSize(11)
      .fillColor("#111827")
      .text(first.createdBy?.fullName ?? first.createdById, leftX, doc.y + 12);
    doc.fontSize(9).fillColor("#6b7280").text("ESTADO", rightX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(statusLabel, rightX, doc.y + 12);

    doc.y += rowGap + 10;
    doc.fontSize(12).fillColor("#111827").text("Detalle", margin, doc.y);
    doc.moveDown(0.4);

    const tableX = margin;
    let tableY = doc.y + 6;
    const rowHeight = 24;

    doc.rect(tableX, tableY, contentWidth, rowHeight).fill("#1f2937");
    doc
      .fillColor("#ffffff")
      .fontSize(9)
      .text("Producto", tableX + 10, tableY + 7, { width: contentWidth * 0.62 - 20 });
    doc.text("Codigo", tableX + contentWidth * 0.62, tableY + 7, {
      width: contentWidth * 0.2 - 12
    });
    doc.text("Cant.", tableX + contentWidth * 0.82, tableY + 7, {
      width: contentWidth * 0.18 - 12,
      align: "right"
    });

    tableY += rowHeight;
    doc.fillColor("#111827").fontSize(9);
    transfers.forEach((t: any, idx: number) => {
      const fill = idx % 2 === 0 ? "#f8fafc" : "#eef2ff";
      doc.rect(tableX, tableY, contentWidth, rowHeight).fill(fill);
      doc
        .fillColor("#111827")
        .text(t.item?.name ?? t.itemId, tableX + 10, tableY + 7, {
          width: contentWidth * 0.62 - 20
        });
      doc.text(t.item?.sku ?? "", tableX + contentWidth * 0.62, tableY + 7, {
        width: contentWidth * 0.2 - 12
      });
      doc.text(String(t.quantity), tableX + contentWidth * 0.82, tableY + 7, {
        width: contentWidth * 0.18 - 12,
        align: "right"
      });
      tableY += rowHeight;
      if (tableY > doc.page.height - margin - 60) {
        doc.addPage();
        tableY = margin;
      }
    });

    const note = String(first.note || "")
      .replace(/\[ENVIO:\d{6,10}\]\s*/i, "")
      .trim();
    if (note) {
      doc.moveDown(0.8);
      doc.fontSize(9).fillColor("#6b7280").text(`Nota: ${note}`, margin, doc.y);
    }

    doc.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR, Role.ALMACEN)
  @Get("transfer/:id/receipt.pdf")
  async transferReceipt(@Param("id") id: string, @Res() res: Response) {
    const transfer = await this.inventoryService.getTransferById(id);
    if (!transfer) {
      res.status(404).send("No encontrado");
      return;
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=boleta-transferencia.pdf");

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;
    const headerHeight = 50;
    const formatDate = (value?: Date | null) =>
      value ? value.toISOString().replace("T", " ").slice(0, 16) : "N/A";

    doc.rect(margin, margin, contentWidth, headerHeight).fill("#0f172a");
    doc.fillColor("#ffffff").fontSize(18).text("BITEL", margin + 12, margin + 16);
    doc.fontSize(12).text("TRANSFERENCIA DE INVENTARIO", 0, margin + 20, { align: "right" });
    doc.fillColor("#111827");

    doc.y = margin + headerHeight + 18;

    const fromLabel = `${transfer.fromLocal?.code ?? transfer.fromLocalId} - ${
      transfer.fromLocal?.name ?? ""
    }`.trim();
    const toLabel = `${transfer.toLocal?.code ?? transfer.toLocalId} - ${
      transfer.toLocal?.name ?? ""
    }`.trim();

    const leftX = margin;
    const rightX = margin + contentWidth / 2 + 10;
    const rowGap = 28;

    doc.fontSize(9).fillColor("#6b7280").text("CODIGO", leftX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(transfer.transferCode, leftX, doc.y + 12);
    doc.fontSize(9).fillColor("#6b7280").text("FECHA", rightX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(formatDate(transfer.createdAt), rightX, doc.y + 12);

    doc.y += rowGap;
    doc.fontSize(9).fillColor("#6b7280").text("ORIGEN", leftX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(fromLabel, leftX, doc.y + 12);
    doc.fontSize(9).fillColor("#6b7280").text("DESTINO", rightX, doc.y);
    doc.fontSize(11).fillColor("#111827").text(toLabel, rightX, doc.y + 12);

    doc.y += rowGap;
    doc.fontSize(9).fillColor("#6b7280").text("ENVIADO POR", leftX, doc.y);
    doc
      .fontSize(11)
      .fillColor("#111827")
      .text(transfer.createdBy?.fullName ?? transfer.createdById, leftX, doc.y + 12);
    doc.fontSize(9).fillColor("#6b7280").text("ESTADO", rightX, doc.y);
    const statusLabel =
      transfer.status === "OBSERVED"
        ? "Observado"
        : transfer.status === "RECEIVED"
          ? "Recibido"
          : "Enviado";
    doc.fontSize(11).fillColor("#111827").text(statusLabel, rightX, doc.y + 12);

    doc.y += rowGap + 10;
    doc.fontSize(12).fillColor("#111827").text("Detalle", margin, doc.y);
    doc.moveDown(0.4);

    const tableX = margin;
    let tableY = doc.y + 6;
    const rowHeight = 24;

    doc.rect(tableX, tableY, contentWidth, rowHeight).fill("#1f2937");
    doc
      .fillColor("#ffffff")
      .fontSize(9)
      .text("Producto", tableX + 10, tableY + 7, { width: contentWidth * 0.58 - 20 });
    doc.text("Codigo", tableX + contentWidth * 0.58, tableY + 7, {
      width: contentWidth * 0.22 - 12
    });
    doc.text("Cantidad", tableX + contentWidth * 0.8, tableY + 7, {
      width: contentWidth * 0.2 - 16,
      align: "right"
    });
    tableY += rowHeight;

    doc.rect(tableX, tableY, contentWidth, rowHeight).stroke("#e5e7eb");
    doc
      .fillColor("#111827")
      .fontSize(10)
      .text(transfer.item?.name ?? transfer.itemId, tableX + 10, tableY + 7, {
        width: contentWidth * 0.58 - 20
      });
    doc.text(transfer.item?.sku ?? "", tableX + contentWidth * 0.58, tableY + 7, {
      width: contentWidth * 0.22 - 12
    });
    doc.text(String(transfer.quantity), tableX + contentWidth * 0.8, tableY + 7, {
      width: contentWidth * 0.2 - 16,
      align: "right"
    });
    tableY += rowHeight;

    if (transfer.note) {
      doc.y = tableY + 14;
      doc.fontSize(9).fillColor("#6b7280").text(`Nota: ${transfer.note}`, margin, doc.y);
    }

    doc.moveDown(1.5);
    doc
      .fontSize(9)
      .fillColor("#6b7280")
      .text(`Generado: ${formatDate(new Date())}`, margin, doc.y, { align: "right" });
    doc.end();
  }
}
