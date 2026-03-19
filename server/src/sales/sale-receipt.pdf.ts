import { Prisma } from "@prisma/client";
import PDFDocument from "pdfkit";

export type SaleReceiptRecord = Prisma.SaleGetPayload<{
  include: { items: true; local: true; user: true; client: true; clientLine: true };
}>;

function toNumber(value: unknown) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  const decimal = value as { toNumber?: () => number; toString?: () => string };
  if (typeof decimal.toNumber === "function") return decimal.toNumber();
  if (typeof decimal.toString === "function") return Number(decimal.toString());
  return Number(value);
}

function formatMoney(value: unknown) {
  return `S/ ${toNumber(value).toFixed(2)}`;
}

function formatDate(value?: Date | null) {
  return value ? value.toISOString().replace("T", " ").slice(0, 16) : "N/A";
}

function shortText(text: string, max = 38) {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function renderSaleReceiptPdf(doc: InstanceType<typeof PDFDocument>, sale: SaleReceiptRecord) {
  const margin = doc.page.margins.left;
  const contentWidth = doc.page.width - margin * 2;
  const headerHeight = 52;

  doc.rect(margin, margin, contentWidth, headerHeight).fill("#0f172a");
  doc.fillColor("#ffffff").fontSize(18).text("BITEL", margin + 12, margin + 16);
  doc.fontSize(12).text("COMPROBANTE DE VENTA", 0, margin + 20, { align: "right" });
  doc.fillColor("#111827");

  doc.y = margin + headerHeight + 18;

  const localCode = sale.local?.code ?? "N/A";
  const localName = sale.local?.name ?? "N/A";
  const saleDate = formatDate(sale.createdAt);
  const receiptTypeLabel =
    sale.receiptType === "BOLETA_ELECTRONICA"
      ? "Boleta electronica"
      : sale.receiptType === "BOLETA_FISICA"
        ? "Boleta fisica"
        : sale.receiptType;
  const receiptLabel = sale.receiptType
    ? `${receiptTypeLabel} ${sale.receiptNumber ?? ""}`.trim()
    : "N/A";
  const clientName = sale.client?.fullName || "Publico general";
  const clientDoc = sale.client?.documentId || "";
  const clientPhone = sale.client?.phone || "";

  const leftX = margin;
  const rightX = margin + contentWidth / 2 + 10;
  const rowGap = 28;

  doc.fontSize(9).fillColor("#6b7280").text("LOCAL", leftX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(`${localCode} - ${localName}`, leftX, doc.y + 12);

  doc.fontSize(9).fillColor("#6b7280").text("VENTA", rightX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(sale.id, rightX, doc.y + 12);

  doc.y += rowGap;
  doc.fontSize(9).fillColor("#6b7280").text("FECHA", leftX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(saleDate, leftX, doc.y + 12);

  doc.fontSize(9).fillColor("#6b7280").text("COMPROBANTE", rightX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(receiptLabel, rightX, doc.y + 12);

  doc.y += rowGap;
  doc.fontSize(9).fillColor("#6b7280").text("CLIENTE", leftX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(clientName, leftX, doc.y + 12);

  doc.fontSize(9).fillColor("#6b7280").text("DOCUMENTO", rightX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(clientDoc || "N/A", rightX, doc.y + 12);

  doc.y += rowGap;
  doc.fontSize(9).fillColor("#6b7280").text("TELEFONO", leftX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(clientPhone || "N/A", leftX, doc.y + 12);

  doc.fontSize(9).fillColor("#6b7280").text("METODO", rightX, doc.y);
  doc.fontSize(11).fillColor("#111827").text(sale.method, rightX, doc.y + 12);

  doc.y += rowGap + 10;
  doc.fontSize(12).fillColor("#111827").text("Detalle de items", margin, doc.y);
  doc.moveDown(0.4);

  const tableX = margin;
  let tableY = doc.y + 6;
  const rowHeight = 22;
  const colWidths = [
    contentWidth * 0.42,
    contentWidth * 0.1,
    contentWidth * 0.16,
    contentWidth * 0.14,
    contentWidth * 0.18
  ];

  const drawHeaderCell = (text: string, x: number, width: number) => {
    doc
      .fillColor("#ffffff")
      .fontSize(9)
      .text(text, x + 6, tableY + 6, { width: width - 12 });
  };

  doc.rect(tableX, tableY, contentWidth, rowHeight).fill("#1f2937");
  drawHeaderCell("Producto", tableX, colWidths[0]);
  drawHeaderCell("Cant", tableX + colWidths[0], colWidths[1]);
  drawHeaderCell("P.Unit", tableX + colWidths[0] + colWidths[1], colWidths[2]);
  drawHeaderCell("Desc", tableX + colWidths[0] + colWidths[1] + colWidths[2], colWidths[3]);
  drawHeaderCell(
    "Total",
    tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3],
    colWidths[4]
  );
  tableY += rowHeight;

  sale.items.forEach((item) => {
    const discountLine = Number(item.discountAmount ?? 0);
    const lineTotal = Number(item.unitPrice) * item.quantity - discountLine;
    doc.rect(tableX, tableY, contentWidth, rowHeight).stroke("#e5e7eb");
    doc.fillColor("#111827").fontSize(9).text(shortText(item.description || ""), tableX + 6, tableY + 6, {
      width: colWidths[0] - 12
    });
    doc.text(String(item.quantity), tableX + colWidths[0] + 6, tableY + 6, {
      width: colWidths[1] - 12,
      align: "right"
    });
    doc.text(formatMoney(item.unitPrice), tableX + colWidths[0] + colWidths[1] + 6, tableY + 6, {
      width: colWidths[2] - 12,
      align: "right"
    });
    doc.text(
      formatMoney(discountLine),
      tableX + colWidths[0] + colWidths[1] + colWidths[2] + 6,
      tableY + 6,
      {
        width: colWidths[3] - 12,
        align: "right"
      }
    );
    doc.text(
      formatMoney(lineTotal),
      tableX + colWidths[0] + colWidths[1] + colWidths[2] + colWidths[3] + 6,
      tableY + 6,
      {
        width: colWidths[4] - 12,
        align: "right"
      }
    );
    tableY += rowHeight;
  });

  tableY += 12;
  const totalsX = tableX + contentWidth * 0.55;
  const totalsWidth = contentWidth * 0.45;

  doc.rect(totalsX, tableY, totalsWidth, 90).stroke("#e5e7eb");
  doc.fillColor("#111827").fontSize(10);
  doc.text("SubTotal", totalsX + 10, tableY + 12);
  doc.text(formatMoney(sale.subTotal ?? 0), totalsX + 10, tableY + 12, {
    width: totalsWidth - 20,
    align: "right"
  });
  doc.text("Descuento", totalsX + 10, tableY + 36);
  doc.text(formatMoney(sale.discountTotal ?? 0), totalsX + 10, tableY + 36, {
    width: totalsWidth - 20,
    align: "right"
  });
  doc.fontSize(12).text("Total", totalsX + 10, tableY + 60);
  doc.fontSize(12).text(formatMoney(sale.total ?? 0), totalsX + 10, tableY + 60, {
    width: totalsWidth - 20,
    align: "right"
  });

  doc.moveDown(1.5);
  doc
    .fontSize(9)
    .fillColor("#6b7280")
    .text(`Generado: ${formatDate(new Date())}`, margin, doc.y, { align: "right" });
}

export function buildSaleReceiptPdfBuffer(sale: SaleReceiptRecord): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ margin: 40, size: "A4" });

    doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    renderSaleReceiptPdf(doc, sale);
    doc.end();
  });
}
