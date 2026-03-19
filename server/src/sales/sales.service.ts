import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSaleDto } from "./dto/create-sale.dto";
import { ActivityService } from "../activity/activity.service";
import { CancelSaleDto } from "./dto/cancel-sale.dto";
import nodemailer from "nodemailer";
import { buildSaleReceiptPdfBuffer } from "./sale-receipt.pdf";

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService, private activity: ActivityService) {}

  private parseBoolean(value?: string) {
    const normalized = String(value || "")
      .trim()
      .toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  private buildSmtpTransport() {
    const host = String(process.env.SMTP_HOST || "").trim();
    if (!host) {
      throw new BadRequestException(
        "SMTP no configurado. Define SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM."
      );
    }

    const rawPort = Number(process.env.SMTP_PORT || 587);
    const port = Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 587;
    const secure = this.parseBoolean(process.env.SMTP_SECURE) || port === 465;
    const user = String(process.env.SMTP_USER || "").trim();
    const pass = String(process.env.SMTP_PASS || "").trim();
    const isGmailHost = host.toLowerCase().includes("gmail.com");

    if ((user && !pass) || (!user && pass)) {
      throw new BadRequestException("SMTP incompleto: SMTP_USER y SMTP_PASS deben estar juntos.");
    }
    if (isGmailHost && (!user || !pass)) {
      throw new BadRequestException(
        "Para Gmail debes configurar SMTP_USER y SMTP_PASS (con App Password de 16 caracteres)."
      );
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      ...(user ? { auth: { user, pass } } : {})
    });
  }

  async create(dto: CreateSaleDto, userId: string) {
    const sale = await this.prisma.$transaction(async (tx) => {
      const openCash = await tx.cashSession.findFirst({
        where: { localId: dto.localId, status: "OPEN" }
      });
      if (!openCash) {
        throw new BadRequestException("No hay caja abierta para este local");
      }

      const receiptType = dto.receiptType ?? "BOLETA_FISICA";
      let receiptNumber = dto.receiptNumber;
      if (!receiptNumber) {
        const sequence = await tx.receiptSequence.upsert({
          where: {
            localId_receiptType: { localId: dto.localId, receiptType }
          },
          update: { currentNumber: { increment: 1 } },
          create: {
            localId: dto.localId,
            receiptType,
            currentNumber: 1
          }
        });
        const series = receiptType === "BOLETA_ELECTRONICA" ? "B001" : "F001";
        receiptNumber = `${series}-${String(sequence.currentNumber).padStart(6, "0")}`;
      }

      const normalizedItems: Array<{
        itemId?: string;
        description: string;
        quantity: number;
        unitPrice: number;
        discountAmount?: number;
      }> = [];

      for (const item of dto.items) {
        let resolvedDescription = String(item.description || "").trim();
        let resolvedUnitPrice = Number(item.unitPrice ?? 0);

        if (item.itemId) {
          const inventoryItem = await tx.inventoryItem.findUnique({
            where: { id: item.itemId }
          });
          if (!inventoryItem || inventoryItem.localId !== dto.localId) {
            throw new BadRequestException("Item invalido para este local");
          }
          // Precio fijo: cuando hay item seleccionado, el precio sale del inventario.
          resolvedUnitPrice = Number(inventoryItem.price ?? 0);
          if (!resolvedDescription) {
            resolvedDescription = String(inventoryItem.name || "").trim();
          }

          // Atomic decrement prevents overselling under concurrent sales.
          const updated = await tx.inventoryItem.updateMany({
            where: {
              id: item.itemId,
              localId: dto.localId,
              quantity: { gte: item.quantity }
            },
            data: { quantity: { decrement: item.quantity } }
          });
          if (updated.count === 0) {
            throw new BadRequestException("Stock insuficiente");
          }
        }

        if (!resolvedDescription) {
          throw new BadRequestException("Descripcion invalida");
        }

        normalizedItems.push({
          itemId: item.itemId,
          description: resolvedDescription,
          quantity: item.quantity,
          unitPrice: resolvedUnitPrice,
          discountAmount: item.discountAmount ?? 0
        });
      }

      const subTotal = normalizedItems.reduce(
        (sum, item) => sum + item.quantity * Number(item.unitPrice ?? 0),
        0
      );
      const itemsDiscount = normalizedItems.reduce(
        (sum, item) => sum + Number(item.discountAmount ?? 0),
        0
      );
      const discountTotal = Number(dto.discountTotal ?? 0) + itemsDiscount;
      const total = Math.max(subTotal - discountTotal, 0);

      const createdSale = await tx.sale.create({
        data: {
          localId: dto.localId,
          userId,
          cashSessionId: openCash.id,
          clientId: dto.clientId,
          clientLineId: dto.clientLineId,
          lineNumber: dto.lineNumber,
          type: dto.type,
          method: dto.method,
          subTotal,
          discountTotal,
          total,
          receiptType,
          receiptNumber,
          items: {
            create: normalizedItems.map((item) => ({
              itemId: item.itemId,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discountAmount: item.discountAmount ?? 0
            }))
          }
        }
      });

      // Kardex: log OUT movements for inventory-backed sale items.
      for (const item of normalizedItems) {
        if (!item.itemId) continue;
        await tx.inventoryMovement.create({
          data: {
            type: "OUT",
            itemId: item.itemId,
            fromLocalId: dto.localId,
            quantity: item.quantity,
            note: `Venta ${createdSale.id}`,
            reason: "SALE",
            userId
          }
        });
      }

      return createdSale;
    });

    await this.activity.log({
      action: "sale.create",
      entity: "Sale",
      entityId: sale.id,
      userId,
      localId: sale.localId,
      meta: { total: Number(sale.total ?? 0) }
    });

    return sale;
  }

  list(localId?: string, status?: string) {
    return this.prisma.sale.findMany({
      where: { localId, status: status as any },
      include: { items: true },
      orderBy: { createdAt: "desc" }
    });
  }

  getById(id: string) {
    return this.prisma.sale.findUnique({
      where: { id },
      include: { items: true, local: true, user: true, client: true, clientLine: true }
    });
  }

  async sendReceiptByEmail(id: string, email: string, userId: string) {
    const sale = await this.getById(id);
    if (!sale) {
      throw new BadRequestException("Venta no encontrada");
    }
    if (sale.receiptType !== "BOLETA_ELECTRONICA") {
      throw new BadRequestException("Solo se permite envio por correo para boleta electronica.");
    }
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (!normalizedEmail) {
      throw new BadRequestException("Correo requerido");
    }

    const transport = this.buildSmtpTransport();
    const smtpUser = String(process.env.SMTP_USER || "").trim();
    const fromAddress =
      String(process.env.SMTP_FROM || "").trim() ||
      (smtpUser ? `Bitel Demo <${smtpUser}>` : "Bitel Demo <no-reply@bitel.local>");
    const attachment = await buildSaleReceiptPdfBuffer(sale);
    const receiptCode = String(sale.receiptNumber || sale.id);

    try {
      const info = await transport.sendMail({
        from: fromAddress,
        to: normalizedEmail,
        subject: `Comprobante electronico ${receiptCode}`,
        text: [
          "Hola,",
          "",
          "Adjuntamos tu comprobante electronico de BITEL.",
          `Comprobante: ${receiptCode}`,
          `Venta: ${sale.id}`,
          "",
          "Gracias por tu compra."
        ].join("\n"),
        attachments: [
          {
            filename: `comprobante-${receiptCode}.pdf`,
            content: attachment,
            contentType: "application/pdf"
          }
        ]
      });

      await this.activity.log({
        action: "sale.receipt.email",
        entity: "Sale",
        entityId: sale.id,
        userId,
        localId: sale.localId,
        meta: {
          email: normalizedEmail,
          receiptType: sale.receiptType,
          receiptNumber: sale.receiptNumber,
          messageId: info.messageId,
          accepted: (info.accepted || []).map((entry) =>
            typeof entry === "string" ? entry : entry.address || String(entry)
          ),
          rejected: (info.rejected || []).map((entry) =>
            typeof entry === "string" ? entry : entry.address || String(entry)
          )
        }
      });

      return {
        ok: true,
        email: normalizedEmail,
        messageId: info.messageId,
        message: "Comprobante electronico enviado por correo."
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.activity.log({
        action: "sale.receipt.email.error",
        entity: "Sale",
        entityId: sale.id,
        userId,
        localId: sale.localId,
        meta: {
          email: normalizedEmail,
          receiptType: sale.receiptType,
          receiptNumber: sale.receiptNumber,
          error: reason
        }
      });
      throw new BadRequestException(`No se pudo enviar el comprobante por correo: ${reason}`);
    }
  }

  async cancel(id: string, dto: CancelSaleDto, userId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true }
    });
    if (!sale || sale.status !== "ACTIVE") {
      throw new BadRequestException("Venta no valida");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of sale.items) {
        if (item.itemId) {
          await tx.inventoryItem.update({
            where: { id: item.itemId },
            data: { quantity: { increment: item.quantity } }
          });
          await tx.inventoryMovement.create({
            data: {
              type: "IN",
              itemId: item.itemId,
              toLocalId: sale.localId,
              quantity: item.quantity,
              note: "Cancelacion de venta",
              reason: "SALE_CANCEL",
              userId
            }
          });
        }
      }

      return tx.sale.update({
        where: { id },
        data: {
          status: "CANCELED",
          canceledAt: new Date(),
          canceledById: userId,
          cancelReason: dto.reason
        }
      });
    });

    await this.activity.log({
      action: "sale.cancel",
      entity: "Sale",
      entityId: sale.id,
      userId,
      localId: sale.localId,
      meta: { reason: dto.reason },
      before: sale,
      after: updated
    });

    return updated;
  }
}
