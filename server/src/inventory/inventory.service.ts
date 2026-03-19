import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInventoryDto } from "./dto/create-inventory.dto";
import { UpdateInventoryDto } from "./dto/update-inventory.dto";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { CreateTransferBatchDto } from "./dto/create-transfer-batch.dto";
import { ReceiveTransferDto } from "./dto/receive-transfer.dto";
import { ReceiveTransferBatchDto } from "./dto/receive-transfer-batch.dto";
import { ObserveTransferDto } from "./dto/observe-transfer.dto";
import { ObserveTransferBatchDto } from "./dto/observe-transfer-batch.dto";
import { AdjustInventoryDto } from "./dto/adjust-inventory.dto";
import { ActivityService } from "../activity/activity.service";
import { ImportInventoryDto, ImportInventoryMode } from "./dto/import-inventory.dto";
import { ImportInventoryExcelDto } from "./dto/import-inventory-excel.dto";
import ExcelJS from "exceljs";

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService, private activity: ActivityService) {}

  private extractBatchCode(note?: string | null) {
    const raw = String(note || "");
    const match = raw.match(/\[ENVIO:(\d{6,10})\]/i);
    return match ? match[1] : undefined;
  }

  private parseCsv(csv: string, delimiter = ",") {
    const lines = String(csv || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const rows = lines.map((line) => line.split(delimiter).map((cell) => cell.trim()));
    if (rows.length === 0) return [];

    const header = rows[0].map((h) => h.toLowerCase());
    const hasHeader = header.includes("sku") || header.includes("name") || header.includes("quantity");
    const dataRows = hasHeader ? rows.slice(1) : rows;
    const indexOf = (key: string, fallback: number) => {
      const idx = header.indexOf(key);
      return idx >= 0 ? idx : fallback;
    };

    const idxSku = indexOf("sku", 0);
    const idxName = indexOf("name", 1);
    const idxCategory = indexOf("category", 2);
    const idxQuantity = indexOf("quantity", 3);
    const idxMinStock = indexOf("minstock", 4);
    const idxPrice = indexOf("price", hasHeader ? 5 : 6);

    const toInt = (value: string) => {
      const n = Number(String(value || "").replace(",", "."));
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    };
    const toMoney = (value: string) => {
      const n = Number(String(value || "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };

    return dataRows
      .map((cols) => ({
        sku: cols[idxSku] || "",
        name: cols[idxName] || "",
        category: cols[idxCategory] || undefined,
        quantity: toInt(cols[idxQuantity] || "0"),
        minStock: toInt(cols[idxMinStock] || "0"),
        price: toMoney(cols[idxPrice] || "0")
      }))
      .filter((row) => row.sku && row.name);
  }

  async importCsv(dto: ImportInventoryDto, userId: string, userLocalId?: string) {
    if (userLocalId && dto.localId !== userLocalId) {
      throw new BadRequestException("Local no pertenece al usuario");
    }
    const delimiter = dto.delimiter && dto.delimiter.length > 0 ? dto.delimiter : ",";
    const mode = dto.mode ?? ImportInventoryMode.SET;
    const parsed = this.parseCsv(dto.csv, delimiter);
    if (parsed.length === 0) {
      throw new BadRequestException("CSV sin filas validas");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let movedCount = 0;

      for (const row of parsed) {
        const existing = await tx.inventoryItem.findUnique({
          where: { localId_sku: { localId: dto.localId, sku: row.sku } }
        });

        if (!existing) {
          const createdItem = await tx.inventoryItem.create({
            data: {
              localId: dto.localId,
              sku: row.sku,
              name: row.name,
              category: row.category,
              quantity: Math.max(0, row.quantity),
              minStock: Math.max(0, row.minStock),
              cost: 0 as any,
              price: row.price as any
            }
          });
          created += 1;
          if (createdItem.quantity > 0) {
            await tx.inventoryMovement.create({
              data: {
                type: "IN",
                itemId: createdItem.id,
                toLocalId: dto.localId,
                quantity: createdItem.quantity,
                note: "Import CSV",
                reason: "IMPORT_CSV",
                userId
              }
            });
            movedCount += 1;
          }
          continue;
        }

        const nextQuantity =
          mode === ImportInventoryMode.INCREMENT
            ? existing.quantity + Math.max(0, row.quantity)
            : Math.max(0, row.quantity);
        const diff = nextQuantity - existing.quantity;

        const updatedItem = await tx.inventoryItem.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            category: row.category,
            quantity: nextQuantity,
            minStock: Math.max(0, row.minStock),
            cost: 0 as any,
            price: row.price as any
          }
        });
        updated += 1;

        if (diff !== 0) {
          await tx.inventoryMovement.create({
            data: {
              type: diff > 0 ? "IN" : "OUT",
              itemId: updatedItem.id,
              fromLocalId: diff < 0 ? dto.localId : undefined,
              toLocalId: diff > 0 ? dto.localId : undefined,
              quantity: Math.abs(diff),
              note: "Import CSV (ajuste)",
              reason: "IMPORT_CSV",
              userId
            }
          });
          movedCount += 1;
        }
      }

      return { created, updated, movements: movedCount };
    });

    await this.activity.log({
      action: "inventory.import_csv",
      entity: "InventoryItem",
      userId,
      localId: dto.localId,
      meta: { ...result, rows: parsed.length, mode }
    });

    return { ok: true, ...result, rows: parsed.length };
  }

  async importExcel(dto: ImportInventoryExcelDto, userId: string, userLocalId?: string) {
    if (userLocalId && dto.localId !== userLocalId) {
      throw new BadRequestException("Local no pertenece al usuario");
    }
    const mode = dto.mode ?? ImportInventoryMode.SET;
    const buffer = Buffer.from(String(dto.fileBase64 || ""), "base64");
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException("Archivo vacio");
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException("Archivo sin hojas");
    }

    const rawHeader = (sheet.getRow(1).values as any[]).slice(1).map((v) =>
      String(v ?? "")
        .trim()
        .toLowerCase()
    );
    const hasHeader =
      rawHeader.includes("sku") || rawHeader.includes("name") || rawHeader.includes("quantity");

    const indexOf = (key: string, fallback: number) => {
      const idx = rawHeader.indexOf(key);
      return idx >= 0 ? idx : fallback;
    };
    const idxSku = indexOf("sku", 0);
    const idxName = indexOf("name", 1);
    const idxCategory = indexOf("category", 2);
    const idxQuantity = indexOf("quantity", 3);
    const idxMinStock = indexOf("minstock", 4);
    const idxPrice = indexOf("price", hasHeader ? 5 : 6);

    const toText = (value: any) => String(value ?? "").trim();
    const toInt = (value: any) => {
      const n = Number(String(value ?? "").replace(",", "."));
      return Number.isFinite(n) ? Math.trunc(n) : 0;
    };
    const toMoney = (value: any) => {
      const n = Number(String(value ?? "").replace(",", "."));
      return Number.isFinite(n) ? n : 0;
    };

    const startRow = hasHeader ? 2 : 1;
    const parsed: Array<{
      sku: string;
      name: string;
      category?: string;
      quantity: number;
      minStock: number;
      price: number;
    }> = [];
    for (let r = startRow; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const sku = toText(row.getCell(idxSku + 1).value);
      const name = toText(row.getCell(idxName + 1).value);
      if (!sku || !name) continue;
      parsed.push({
        sku,
        name,
        category: toText(row.getCell(idxCategory + 1).value) || undefined,
        quantity: toInt(row.getCell(idxQuantity + 1).value),
        minStock: toInt(row.getCell(idxMinStock + 1).value),
        price: toMoney(row.getCell(idxPrice + 1).value)
      });
    }

    if (parsed.length === 0) {
      throw new BadRequestException("Archivo sin filas validas");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      let updated = 0;
      let movedCount = 0;

      for (const row of parsed) {
        const existing = await tx.inventoryItem.findUnique({
          where: { localId_sku: { localId: dto.localId, sku: row.sku } }
        });

        if (!existing) {
          const createdItem = await tx.inventoryItem.create({
            data: {
              localId: dto.localId,
              sku: row.sku,
              name: row.name,
              category: row.category,
              quantity: Math.max(0, row.quantity),
              minStock: Math.max(0, row.minStock),
              cost: 0 as any,
              price: row.price as any
            }
          });
          created += 1;
          if (createdItem.quantity > 0) {
            await tx.inventoryMovement.create({
              data: {
                type: "IN",
                itemId: createdItem.id,
                toLocalId: dto.localId,
                quantity: createdItem.quantity,
                note: "Import Excel",
                reason: "IMPORT_EXCEL",
                userId
              }
            });
            movedCount += 1;
          }
          continue;
        }

        const nextQuantity =
          mode === ImportInventoryMode.INCREMENT
            ? existing.quantity + Math.max(0, row.quantity)
            : Math.max(0, row.quantity);
        const diff = nextQuantity - existing.quantity;

        const updatedItem = await tx.inventoryItem.update({
          where: { id: existing.id },
          data: {
            name: row.name,
            category: row.category,
            quantity: nextQuantity,
            minStock: Math.max(0, row.minStock),
            cost: 0 as any,
            price: row.price as any
          }
        });
        updated += 1;

        if (diff !== 0) {
          await tx.inventoryMovement.create({
            data: {
              type: diff > 0 ? "IN" : "OUT",
              itemId: updatedItem.id,
              fromLocalId: diff < 0 ? dto.localId : undefined,
              toLocalId: diff > 0 ? dto.localId : undefined,
              quantity: Math.abs(diff),
              note: "Import Excel (ajuste)",
              reason: "IMPORT_EXCEL",
              userId
            }
          });
          movedCount += 1;
        }
      }

      return { created, updated, movements: movedCount };
    });

    await this.activity.log({
      action: "inventory.import_excel",
      entity: "InventoryItem",
      userId,
      localId: dto.localId,
      meta: { ...result, rows: parsed.length, mode }
    });

    return { ok: true, ...result, rows: parsed.length };
  }

  list(localId?: string) {
    return this.prisma.inventoryItem.findMany({
      where: { localId },
      orderBy: { createdAt: "desc" }
    });
  }

  async create(dto: CreateInventoryDto, userId: string, userLocalId?: string) {
    if (userLocalId && dto.localId !== userLocalId) {
      throw new BadRequestException("Local no corresponde al usuario");
    }
    const item = await this.prisma.inventoryItem.create({ data: { ...dto, cost: 0 as any } });
    await this.activity.log({
      action: "inventory.create",
      entity: "InventoryItem",
      entityId: item.id,
      userId,
      localId: item.localId,
      meta: { sku: item.sku, quantity: item.quantity }
    });
    return item;
  }

  async update(id: string, dto: UpdateInventoryDto, userId: string, userLocalId?: string) {
    const before = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (userLocalId && before && before.localId !== userLocalId) {
      throw new BadRequestException("Item no pertenece al local");
    }
    const { cost: _ignoredCost, ...restDto } = dto;
    const item = await this.prisma.inventoryItem.update({
      where: { id },
      data: { ...restDto, cost: 0 as any }
    });
    await this.activity.log({
      action: "inventory.update",
      entity: "InventoryItem",
      entityId: item.id,
      userId,
      localId: item.localId,
      before,
      after: item
    });
    return item;
  }

  async adjust(dto: AdjustInventoryDto, userId: string, userLocalId?: string) {
    if (dto.type === "TRANSFER") {
      throw new BadRequestException("Tipo invalido para ajuste");
    }
    const scopedLocalId = userLocalId || dto.localId;
    let item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } });
    if (!item && scopedLocalId) {
      item = await this.prisma.inventoryItem.findUnique({
        where: { localId_sku: { localId: scopedLocalId, sku: dto.itemId } }
      });
    }
    if (!item) {
      throw new BadRequestException("Item no encontrado");
    }
    if (userLocalId && item.localId !== userLocalId) {
      throw new BadRequestException("Item no pertenece al local");
    }
    if (dto.type === "OUT" && item.quantity < dto.quantity) {
      throw new BadRequestException("Stock insuficiente");
    }

    const updated = await this.prisma.inventoryItem.update({
      where: { id: item.id },
      data:
        dto.type === "IN"
          ? { quantity: { increment: dto.quantity } }
          : { quantity: { decrement: dto.quantity } }
    });

    await this.prisma.inventoryMovement.create({
      data: {
        type: dto.type,
        itemId: item.id,
        fromLocalId: dto.type === "OUT" ? item.localId : undefined,
        toLocalId: dto.type === "IN" ? item.localId : undefined,
        quantity: dto.quantity,
        note: dto.reason,
        reason: dto.reason,
        userId
      }
    });

    await this.activity.log({
      action: "inventory.adjust",
      entity: "InventoryItem",
      entityId: item.id,
      userId,
      localId: item.localId,
      meta: { type: dto.type, quantity: dto.quantity, reason: dto.reason },
      before: item,
      after: updated
    });

    return updated;
  }

  async createTransfer(dto: CreateTransferDto, userId: string, userLocalId?: string) {
    const scopedFromLocalId = userLocalId || dto.fromLocalId;
    let item = await this.prisma.inventoryItem.findUnique({ where: { id: dto.itemId } });
    if (!item && scopedFromLocalId) {
      item = await this.prisma.inventoryItem.findUnique({
        where: { localId_sku: { localId: scopedFromLocalId, sku: dto.itemId } }
      });
    }
    if (!item) {
      throw new BadRequestException("Item no encontrado");
    }
    if (userLocalId && item.localId !== userLocalId) {
      throw new BadRequestException("Item no pertenece al local");
    }
    if (item.quantity < dto.quantity) {
      throw new BadRequestException("Stock insuficiente");
    }

    const transfer = await this.prisma.$transaction(async (tx) => {
      let transferCode = "";
      let attempts = 0;
      while (!transferCode && attempts < 5) {
        const candidate = Math.floor(100000 + Math.random() * 900000).toString();
        const exists = await tx.inventoryTransfer.findUnique({
          where: { transferCode: candidate }
        });
        if (!exists) {
          transferCode = candidate;
        }
        attempts += 1;
      }
      if (!transferCode) {
        throw new BadRequestException("No se pudo generar codigo");
      }

      const source = await tx.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: { decrement: dto.quantity } }
      });

      const created = await tx.inventoryTransfer.create({
        data: {
          transferCode,
          itemId: item.id,
          fromLocalId: item.localId,
          toLocalId: dto.toLocalId,
          quantity: dto.quantity,
          note: dto.note,
          createdById: userId
        }
      });

      await tx.inventoryMovement.create({
        data: {
          type: "TRANSFER",
          itemId: item.id,
          fromLocalId: item.localId,
          toLocalId: dto.toLocalId,
          quantity: dto.quantity,
          note: dto.note,
          reason: "TRANSFER_SENT",
          userId
        }
      });

      return { source, created };
    });

    await this.activity.log({
      action: "inventory.transfer.sent",
      entity: "InventoryItem",
      entityId: item.id,
      userId,
      localId: item.localId,
      meta: { toLocalId: dto.toLocalId, quantity: dto.quantity }
    });

    return transfer;
  }

  async createTransferBatch(dto: CreateTransferBatchDto, userId: string, userLocalId?: string) {
    const scopedFromLocalId = userLocalId || dto.fromLocalId;
    if (!scopedFromLocalId) {
      throw new BadRequestException("Local de origen requerido");
    }
    if (userLocalId && scopedFromLocalId !== userLocalId) {
      throw new BadRequestException("Local no pertenece al usuario");
    }
    if (!dto.toLocalId) {
      throw new BadRequestException("Local destino requerido");
    }
    if (dto.toLocalId === scopedFromLocalId) {
      throw new BadRequestException("Origen y destino no pueden ser iguales");
    }

    const merged = new Map<string, number>();
    (dto.items || []).forEach((row) => {
      const itemKey = String(row.itemId || "").trim();
      const qty = Number(row.quantity ?? 0);
      if (!itemKey || !Number.isFinite(qty) || qty < 1) return;
      merged.set(itemKey, (merged.get(itemKey) || 0) + Math.trunc(qty));
    });
    if (merged.size === 0) {
      throw new BadRequestException("Sin items para enviar");
    }

    const note = dto.note;

    const result = await this.prisma.$transaction(async (tx) => {
      // Generate a batch code. We persist it inside `note` as a tag so we don't need a schema migration.
      let batchCode = "";
      let attempts = 0;
      while (!batchCode && attempts < 8) {
        const candidate = Math.floor(10_000_000 + Math.random() * 90_000_000).toString(); // 8 digitos
        const tag = `[ENVIO:${candidate}]`;
        const tagExists = await tx.inventoryTransfer.findFirst({
          where: { note: { contains: tag } }
        });
        const codeExists = await tx.inventoryTransfer.findUnique({
          where: { transferCode: candidate }
        });
        if (!tagExists && !codeExists) {
          batchCode = candidate;
        }
        attempts += 1;
      }
      if (!batchCode) {
        throw new BadRequestException("No se pudo generar codigo de envio");
      }

      const batchTag = `[ENVIO:${batchCode}]`;
      const noteWithTag = note ? `${batchTag} ${note}` : batchTag;

      const createdTransfers = [];
      for (const [itemIdOrSku, qty] of merged.entries()) {
        let item = await tx.inventoryItem.findUnique({ where: { id: itemIdOrSku } });
        if (!item) {
          item = await tx.inventoryItem.findUnique({
            where: { localId_sku: { localId: scopedFromLocalId, sku: itemIdOrSku } }
          });
        }
        if (!item) {
          throw new BadRequestException(`Item no encontrado: ${itemIdOrSku}`);
        }
        if (item.localId !== scopedFromLocalId) {
          throw new BadRequestException(`Item no pertenece al local: ${itemIdOrSku}`);
        }
        if (item.quantity < qty) {
          throw new BadRequestException(`Stock insuficiente para ${item.sku} (${item.quantity} < ${qty})`);
        }

        let transferCode = "";
        let codeAttempts = 0;
        while (!transferCode && codeAttempts < 5) {
          const candidate = Math.floor(100000 + Math.random() * 900000).toString();
          const exists = await tx.inventoryTransfer.findUnique({ where: { transferCode: candidate } });
          if (!exists) transferCode = candidate;
          codeAttempts += 1;
        }
        if (!transferCode) {
          throw new BadRequestException("No se pudo generar codigo");
        }

        await tx.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: { decrement: qty } }
        });

        const created = await tx.inventoryTransfer.create({
          data: {
            transferCode,
            itemId: item.id,
            fromLocalId: item.localId,
            toLocalId: dto.toLocalId,
            quantity: qty,
            note: noteWithTag,
            createdById: userId
          }
        });

        await tx.inventoryMovement.create({
          data: {
            type: "TRANSFER",
            itemId: item.id,
            fromLocalId: item.localId,
            toLocalId: dto.toLocalId,
            quantity: qty,
            note: noteWithTag,
            reason: "TRANSFER_SENT_BATCH",
            userId
          }
        });

        createdTransfers.push(created);
      }

      return { batchCode, createdCount: createdTransfers.length };
    });

    await this.activity.log({
      action: "inventory.transfer.batch_sent",
      entity: "InventoryTransfer",
      userId,
      localId: scopedFromLocalId,
      meta: { batchCode: result.batchCode, toLocalId: dto.toLocalId, items: result.createdCount }
    });

    return { ok: true, ...result };
  }

  async receiveTransfer(dto: ReceiveTransferDto, userId: string, userLocalId?: string) {
    const transfer = await this.prisma.inventoryTransfer.findUnique({
      where: { transferCode: dto.transferCode },
      include: { item: true }
    });
    if (!transfer || transfer.status !== "SENT") {
      throw new BadRequestException("Transferencia no valida");
    }
    if (userLocalId && transfer.toLocalId !== userLocalId) {
      throw new BadRequestException("Transferencia no corresponde a tu local");
    }

    const destination = await this.prisma.inventoryItem.findUnique({
      where: { localId_sku: { localId: transfer.toLocalId, sku: transfer.item.sku } }
    });

    const receivedQuantity =
      dto.receivedQuantity === undefined || dto.receivedQuantity === null
        ? transfer.quantity
        : dto.receivedQuantity;
    if (receivedQuantity < 1 || receivedQuantity > transfer.quantity) {
      throw new BadRequestException("Cantidad recibida invalida");
    }
    const returnedQuantity = transfer.quantity - receivedQuantity;

    const updated = await this.prisma.$transaction(async (tx) => {
      const target = destination
        ? await tx.inventoryItem.update({
            where: { id: destination.id },
            data: { quantity: { increment: receivedQuantity } }
          })
        : await tx.inventoryItem.create({
            data: {
              localId: transfer.toLocalId,
              sku: transfer.item.sku,
              name: transfer.item.name,
              category: transfer.item.category,
              quantity: receivedQuantity,
              minStock: transfer.item.minStock,
              cost: 0 as any,
              price: transfer.item.price
            }
          });

      const moved = await tx.inventoryTransfer.update({
        where: { id: transfer.id },
        data: {
          status: returnedQuantity > 0 ? "OBSERVED" : "RECEIVED",
          receivedById: userId,
          receivedAt: new Date(),
          observedById: returnedQuantity > 0 ? userId : undefined,
          observedAt: returnedQuantity > 0 ? new Date() : undefined,
          observation:
            returnedQuantity > 0
              ? `Recepcion parcial: recibido ${receivedQuantity}/${transfer.quantity}. ${dto.note ?? ""}`.trim()
              : transfer.observation
        }
      });

      await tx.inventoryMovement.create({
        data: {
          type: "TRANSFER",
          itemId: transfer.itemId,
          fromLocalId: transfer.fromLocalId,
          toLocalId: transfer.toLocalId,
          quantity: receivedQuantity,
          note: dto.note ?? transfer.note,
          reason: returnedQuantity > 0 ? "TRANSFER_PARTIAL_RECEIVED" : "TRANSFER_RECEIVED",
          userId
        }
      });

      if (returnedQuantity > 0) {
        await tx.inventoryItem.update({
          where: { id: transfer.itemId },
          data: { quantity: { increment: returnedQuantity } }
        });
        await tx.inventoryMovement.create({
          data: {
            type: "TRANSFER",
            itemId: transfer.itemId,
            fromLocalId: transfer.toLocalId,
            toLocalId: transfer.fromLocalId,
            quantity: returnedQuantity,
            note: `Devolucion por recepcion parcial (${returnedQuantity})`,
            reason: "TRANSFER_PARTIAL_RETURN",
            userId
          }
        });
      }

      return { target, moved };
    });

    await this.activity.log({
      action: returnedQuantity > 0 ? "inventory.transfer.partial_received" : "inventory.transfer.received",
      entity: "InventoryTransfer",
      entityId: transfer.id,
      userId,
      localId: transfer.toLocalId,
      meta: {
        receivedQuantity,
        returnedQuantity,
        note: dto.note
      }
    });

    return updated;
  }

  async observeTransfer(dto: ObserveTransferDto, userId: string, userLocalId?: string) {
    const transfer = await this.prisma.inventoryTransfer.findUnique({
      where: { transferCode: dto.transferCode },
      include: { item: true }
    });
    if (!transfer || transfer.status !== "SENT") {
      throw new BadRequestException("Transferencia no valida");
    }
    if (userLocalId && transfer.toLocalId !== userLocalId) {
      throw new BadRequestException("Transferencia no corresponde a tu local");
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const source = await tx.inventoryItem.update({
        where: { id: transfer.itemId },
        data: { quantity: { increment: transfer.quantity } }
      });

      const observed = await tx.inventoryTransfer.update({
        where: { id: transfer.id },
        data: {
          status: "OBSERVED",
          observation: dto.observation,
          observedById: userId,
          observedAt: new Date()
        }
      });

      await tx.inventoryMovement.create({
        data: {
          type: "TRANSFER",
          itemId: transfer.itemId,
          fromLocalId: transfer.toLocalId,
          toLocalId: transfer.fromLocalId,
          quantity: transfer.quantity,
          note: dto.observation,
          reason: "TRANSFER_OBSERVED_RETURN",
          userId
        }
      });

      return { source, observed };
    });

    await this.activity.log({
      action: "inventory.transfer.observed",
      entity: "InventoryTransfer",
      entityId: transfer.id,
      userId,
      localId: transfer.fromLocalId,
      meta: { observation: dto.observation }
    });

    return updated;
  }

  async receiveTransferBatch(dto: ReceiveTransferBatchDto, userId: string, userLocalId?: string) {
    const code = String(dto.batchCode || "").trim();
    if (!code) {
      throw new BadRequestException("Codigo requerido");
    }

    const transfers = await this.prisma.inventoryTransfer.findMany({
      where: { note: { contains: `[ENVIO:${code}]` } },
      select: { transferCode: true, toLocalId: true, status: true }
    });

    if (!transfers || transfers.length === 0) {
      const single = await this.prisma.inventoryTransfer.findUnique({
        where: { transferCode: code },
        select: { transferCode: true, note: true }
      });
      if (!single) {
        throw new BadRequestException("No se encontro envio con ese codigo");
      }
      const batchCode = this.extractBatchCode(single.note);
      if (batchCode) {
        throw new BadRequestException(
          `Usa el codigo de envio ${batchCode} para recibir este lote.`
        );
      }
      // Compatibility for old single-transfer flows (without batch code).
      return this.receiveTransfer(
        { transferCode: code, note: dto.note } as ReceiveTransferDto,
        userId,
        userLocalId
      );
    }

    if (userLocalId && transfers.some((t) => t.toLocalId !== userLocalId)) {
      throw new BadRequestException("Transferencia no corresponde a tu local");
    }

    const pending = transfers.filter((t) => t.status === "SENT");
    let received = 0;
    for (const t of pending) {
      await this.receiveTransfer({ transferCode: t.transferCode, note: dto.note } as ReceiveTransferDto, userId, userLocalId);
      received += 1;
    }

    await this.activity.log({
      action: "inventory.transfer.batch_received",
      entity: "InventoryTransfer",
      userId,
      localId: userLocalId,
      meta: { batchCode: code, received }
    });

    return { ok: true, batchCode: code, received };
  }

  async observeTransferBatch(dto: ObserveTransferBatchDto, userId: string, userLocalId?: string) {
    const code = String(dto.batchCode || "").trim();
    if (!code) {
      throw new BadRequestException("Codigo requerido");
    }

    const transfers = await this.prisma.inventoryTransfer.findMany({
      where: { note: { contains: `[ENVIO:${code}]` } },
      select: { transferCode: true, toLocalId: true, status: true }
    });

    if (!transfers || transfers.length === 0) {
      const single = await this.prisma.inventoryTransfer.findUnique({
        where: { transferCode: code },
        select: { transferCode: true, note: true }
      });
      if (!single) {
        throw new BadRequestException("No se encontro envio con ese codigo");
      }
      const batchCode = this.extractBatchCode(single.note);
      if (batchCode) {
        throw new BadRequestException(
          `Usa el codigo de envio ${batchCode} para observar este lote.`
        );
      }
      // Compatibility for old single-transfer flows (without batch code).
      return this.observeTransfer(
        { transferCode: code, observation: dto.observation } as ObserveTransferDto,
        userId,
        userLocalId
      );
    }

    if (userLocalId && transfers.some((t) => t.toLocalId !== userLocalId)) {
      throw new BadRequestException("Transferencia no corresponde a tu local");
    }

    const pending = transfers.filter((t) => t.status === "SENT");
    let observed = 0;
    for (const t of pending) {
      await this.observeTransfer(
        { transferCode: t.transferCode, observation: dto.observation } as ObserveTransferDto,
        userId,
        userLocalId
      );
      observed += 1;
    }

    await this.activity.log({
      action: "inventory.transfer.batch_observed",
      entity: "InventoryTransfer",
      userId,
      localId: userLocalId,
      meta: { batchCode: code, observed }
    });

    return { ok: true, batchCode: code, observed };
  }

  getTransferById(id: string) {
    return this.prisma.inventoryTransfer.findUnique({
      where: { id },
      include: { item: true, fromLocal: true, toLocal: true, createdBy: true }
    });
  }

  getTransfersByBatchCode(batchCode: string) {
    const code = String(batchCode || "").trim();
    if (!code) return Promise.resolve([] as any);
    return this.prisma.inventoryTransfer.findMany({
      where: { note: { contains: `[ENVIO:${code}]` } },
      include: { item: true, fromLocal: true, toLocal: true, createdBy: true },
      orderBy: { createdAt: "asc" }
    });
  }

  async listTransfers(localId?: string) {
    const whereClause = localId
      ? {
          OR: [{ fromLocalId: localId }, { toLocalId: localId }]
        }
      : {};
    const transfers = await this.prisma.inventoryTransfer.findMany({
      where: whereClause,
      include: { item: true, fromLocal: true, toLocal: true },
      orderBy: { createdAt: "desc" }
    });

    return transfers.map((t) => ({
      ...t,
      batchCode: this.extractBatchCode(t.note)
    }));
  }

  listMovements(localId?: string, itemId?: string, from?: Date, to?: Date) {
    const itemTerm = String(itemId || "").trim();
    const filters: Array<Record<string, unknown>> = [];

    if (localId) {
      filters.push({
        OR: [{ fromLocalId: localId }, { toLocalId: localId }]
      });
    }

    if (itemTerm) {
      filters.push({
        OR: [
          { itemId: itemTerm },
          { item: { is: { sku: { contains: itemTerm, mode: "insensitive" } } } },
          { item: { is: { name: { contains: itemTerm, mode: "insensitive" } } } }
        ]
      });
    }

    if (from || to) {
      filters.push({
        createdAt: {
          gte: from,
          lte: to
        }
      });
    }

    return this.prisma.inventoryMovement.findMany({
      where: filters.length > 0 ? { AND: filters } : {},
      include: { item: true, user: true },
      orderBy: { createdAt: "desc" }
    });
  }
}
