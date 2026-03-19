import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import { ReportsService } from "./reports.service";
import { JwtAuthGuard } from "../auth/auth.guard";
import { RolesGuard } from "../common/roles.guard";
import { Roles } from "../common/roles.decorator";
import { Role } from "@prisma/client";
import { CurrentUser } from "../common/current-user.decorator";
import type { Response } from "express";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("reports")
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("summary")
  summary(
    @Query("localId") localId: string | undefined,
    @Query("period") period = "day",
    @Query("date") dateStr: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const date = dateStr ? new Date(dateStr) : new Date();
    return this.reportsService.summary({
      localId: scopeLocalId,
      period: period as any,
      date
    });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("alerts")
  alerts(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.alerts({ localId: scopeLocalId, from: fromDate, to: toDate });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("sales/by-seller")
  salesBySeller(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.salesBySeller({ localId: scopeLocalId, from: fromDate, to: toDate });
  }

  @Roles(Role.ADMIN, Role.AUDITOR)
  @Get("sales/by-local")
  salesByLocal(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.salesByLocal({ localId: scopeLocalId, from: fromDate, to: toDate });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("sales/by-category")
  salesByCategory(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.salesByCategory({ localId: scopeLocalId, from: fromDate, to: toDate });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("sales/top-products")
  topProducts(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @Query("limit") limit: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.topProducts({
      localId: scopeLocalId,
      from: fromDate,
      to: toDate,
      limit: limit ? Number(limit) : undefined
    });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("kpis")
  kpis(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.kpis({ localId: scopeLocalId, from: fromDate, to: toDate });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("search")
  search(@Query("q") q: string, @Query("localId") localId: string | undefined, @CurrentUser() user: any) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    return this.reportsService.globalSearch({ q: q ?? "", localId: scopeLocalId });
  }

  @Roles(Role.ADMIN)
  @Get("backup.json")
  async backup(@Res({ passthrough: true }) res: Response) {
    const data = await this.reportsService.backup();
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", "attachment; filename=bitel-backup.json");
    return data;
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("cash/differences")
  cashDifferences(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.cashDifferences({
      localId: scopeLocalId,
      from: fromDate,
      to: toDate
    });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("cash/live")
  cashLive(@Query("localId") localId: string | undefined, @CurrentUser() user: any) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    return this.reportsService.liveCash({ localId: scopeLocalId });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("cash/closures")
  cashClosures(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.cashClosuresSummary({
      localId: scopeLocalId,
      from: fromDate,
      to: toDate
    });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("cash/reconciliation")
  cashReconciliation(
    @Query("cashSessionId") cashSessionId: string,
    @CurrentUser() user: any
  ) {
    // Access is enforced by role; local scoping is handled client-side by providing ids the user can see.
    return this.reportsService.cashReconciliation({ cashSessionId });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("cash/closures.csv")
  async cashClosuresCsv(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    const summary = await this.reportsService.cashClosuresSummary({
      localId: scopeLocalId,
      from: fromDate,
      to: toDate
    });

    const lines = [
      "localId,localName,openedAt,closedAt,openingAmount,closingAmount,expectedAmount,difference,openedBy,approvedBy"
    ];
    summary.sessions.forEach((s) => {
      lines.push(
        [
          s.localId,
          s.local?.name ?? "",
          s.openedAt.toISOString(),
          s.closedAt?.toISOString() ?? "",
          Number(s.openingAmount ?? 0),
          Number(s.closingAmount ?? 0),
          Number(s.expectedAmount ?? 0),
          Number(s.difference ?? 0),
          s.user?.fullName ?? "",
          s.approvedBy?.fullName ?? ""
        ].join(",")
      );
    });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=cierres-caja.csv");
    return lines.join("\n");
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("cash/closures.xlsx")
  async cashClosuresXlsx(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    const summary = await this.reportsService.cashClosuresSummary({
      localId: scopeLocalId,
      from: fromDate,
      to: toDate
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Cierres");
    sheet.addRow([
      "Local",
      "Apertura",
      "Cierre",
      "Apertura Monto",
      "Cierre Monto",
      "Esperado",
      "Diferencia"
    ]);
    summary.sessions.forEach((s) => {
      sheet.addRow([
        s.local?.name ?? s.localId,
        s.openedAt.toISOString(),
        s.closedAt?.toISOString() ?? "",
        Number(s.openingAmount ?? 0),
        Number(s.closingAmount ?? 0),
        Number(s.expectedAmount ?? 0),
        Number(s.difference ?? 0)
      ]);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=cierres-caja.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("inventory/low-stock")
  lowStock(@Query("localId") localId: string | undefined, @CurrentUser() user: any) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    return this.reportsService.lowStock(scopeLocalId);
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("inventory/low-stock.xlsx")
  async lowStockXlsx(
    @Query("localId") localId: string | undefined,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const items = await this.reportsService.lowStock(scopeLocalId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Stock Bajo");
    sheet.addRow(["SKU", "Nombre", "Cantidad", "Stock Minimo", "Local"]);
    items.forEach((item) => {
      sheet.addRow([item.sku, item.name, item.quantity, item.minStock, item.localId]);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=stock-bajo.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("inventory/items.xlsx")
  async inventoryItemsXlsx(
    @Query("localId") localId: string | undefined,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const items = await this.reportsService.inventoryItems(scopeLocalId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Inventario");
    sheet.addRow(["Local", "Codigo", "Producto", "Categoria", "Stock", "Precio"]);
    items.forEach((it) => {
      sheet.addRow([
        it.local?.code ?? it.localId,
        it.sku,
        it.name,
        it.category ?? "",
        it.quantity,
        Number(it.price ?? 0)
      ]);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=inventario.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("inventory/items.pdf")
  async inventoryItemsPdf(
    @Query("localId") localId: string | undefined,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const items = await this.reportsService.inventoryItems(scopeLocalId);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=inventario.pdf");

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    const margin = doc.page.margins.left;
    const contentWidth = doc.page.width - margin * 2;

    doc.rect(margin, margin, contentWidth, 50).fill("#0f172a");
    doc.fillColor("#ffffff").fontSize(18).text("BITEL", margin + 12, margin + 16);
    doc.fontSize(12).text("REPORTE DE INVENTARIO", 0, margin + 20, { align: "right" });
    doc.fillColor("#111827");
    doc.y = margin + 70;

    const headers = ["Local", "Codigo", "Producto", "Stock", "Precio"];
    const colWidths = [
      contentWidth * 0.18,
      contentWidth * 0.18,
      contentWidth * 0.38,
      contentWidth * 0.12,
      contentWidth * 0.14
    ];
    const rowHeight = 22;

    let y = doc.y;
    doc.rect(margin, y, contentWidth, rowHeight).fill("#1f2937");
    doc.fillColor("#ffffff").fontSize(9);
    headers.forEach((h, idx) => {
      const x = margin + colWidths.slice(0, idx).reduce((s, w) => s + w, 0);
      doc.text(h, x + 6, y + 7, { width: colWidths[idx] - 12 });
    });
    y += rowHeight;

    doc.fillColor("#111827").fontSize(9);
    items.slice(0, 150).forEach((it) => {
      doc.rect(margin, y, contentWidth, rowHeight).stroke("#e5e7eb");
      const values = [
        it.local?.code ?? it.localId,
        it.sku,
        it.name,
        String(it.quantity),
        `S/ ${Number(it.price ?? 0).toFixed(2)}`
      ];
      values.forEach((val, idx) => {
        const x = margin + colWidths.slice(0, idx).reduce((s, w) => s + w, 0);
        doc.text(String(val), x + 6, y + 7, {
          width: colWidths[idx] - 12,
          align: idx >= 3 ? "right" : "left"
        });
      });
      y += rowHeight;
      if (y > doc.page.height - margin - rowHeight) {
        doc.addPage();
        y = margin;
      }
    });

    doc.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("inventory/movements")
  inventoryMovements(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.inventoryMovements({
      localId: scopeLocalId,
      from: fromDate,
      to: toDate
    });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("inventory/movements.xlsx")
  async inventoryMovementsXlsx(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    const movements = await this.reportsService.inventoryMovements({
      localId: scopeLocalId,
      from: fromDate,
      to: toDate
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Movimientos");
    sheet.addRow(["Tipo", "Item ID", "Cantidad", "Motivo", "Usuario", "Fecha"]);
    movements.forEach((m) => {
      sheet.addRow([
        m.type,
        m.itemId,
        m.quantity,
        m.reason ?? "",
        m.user?.fullName ?? m.userId,
        m.createdAt.toISOString()
      ]);
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=movimientos.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("inventory/kardex-valued")
  kardexValued(
    @Query("localId") localId: string | undefined,
    @Query("from") from: string | undefined,
    @Query("to") to: string | undefined,
    @CurrentUser() user: any
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const fromDate = from ? new Date(from) : new Date(new Date().setHours(0, 0, 0, 0));
    const toDate = to ? new Date(to) : new Date();
    return this.reportsService.inventoryKardexValued({ localId: scopeLocalId, from: fromDate, to: toDate });
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("summary.csv")
  async summaryCsv(
    @Query("localId") localId: string | undefined,
    @Query("period") period = "day",
    @Query("date") dateStr: string | undefined,
    @CurrentUser() user: any,
    @Res({ passthrough: true }) res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const date = dateStr ? new Date(dateStr) : new Date();
    const summary = await this.reportsService.summary({
      localId: scopeLocalId,
      period: period as any,
      date
    });

    const lines = [
      "from,to,totalSales,salesCount,productTotal,productCount,serviceTotal,serviceCount",
      `${summary.from.toISOString()},${summary.to.toISOString()},${summary.totalSales},${summary.salesCount},` +
        `${summary.byType.PRODUCT.total},${summary.byType.PRODUCT.count},` +
        `${summary.byType.SERVICE.total},${summary.byType.SERVICE.count}`
    ];
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=summary.csv");
    return lines.join("\n");
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("summary.xlsx")
  async summaryXlsx(
    @Query("localId") localId: string | undefined,
    @Query("period") period = "day",
    @Query("date") dateStr: string | undefined,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const date = dateStr ? new Date(dateStr) : new Date();
    const summary = await this.reportsService.summary({
      localId: scopeLocalId,
      period: period as any,
      date
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Resumen");
    sheet.addRow(["Desde", summary.from.toISOString()]);
    sheet.addRow(["Hasta", summary.to.toISOString()]);
    sheet.addRow(["Total ventas", summary.totalSales]);
    sheet.addRow(["Operaciones", summary.salesCount]);
    sheet.addRow([]);
    sheet.addRow(["Tipo", "Total", "Ops"]);
    sheet.addRow(["PRODUCT", summary.byType.PRODUCT.total, summary.byType.PRODUCT.count]);
    sheet.addRow(["SERVICE", summary.byType.SERVICE.total, summary.byType.SERVICE.count]);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=summary.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  }

  @Roles(Role.ADMIN, Role.AUDITOR, Role.VENDEDOR)
  @Get("summary.pdf")
  async summaryPdf(
    @Query("localId") localId: string | undefined,
    @Query("period") period = "day",
    @Query("date") dateStr: string | undefined,
    @CurrentUser() user: any,
    @Res() res: Response
  ) {
    const scopeLocalId =
      user.role === Role.ADMIN || user.role === Role.AUDITOR ? localId : user.localId;
    const date = dateStr ? new Date(dateStr) : new Date();
    const summary = await this.reportsService.summary({
      localId: scopeLocalId,
      period: period as any,
      date
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=summary.pdf");

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(18).text("Reporte de Ventas", { align: "left" });
    doc.moveDown(0.5);
    doc.fontSize(12).text(`Periodo: ${period}`);
    doc.text(`Desde: ${summary.from.toISOString()}`);
    doc.text(`Hasta: ${summary.to.toISOString()}`);
    doc.moveDown();
    doc.fontSize(14).text(`Total ventas: S/ ${summary.totalSales.toFixed(2)}`);
    doc.text(`Operaciones: ${summary.salesCount}`);
    doc.moveDown();
    doc.text(`Productos: S/ ${summary.byType.PRODUCT.total.toFixed(2)} (${summary.byType.PRODUCT.count})`);
    doc.text(`Servicios: S/ ${summary.byType.SERVICE.total.toFixed(2)} (${summary.byType.SERVICE.count})`);
    doc.end();
  }
}
