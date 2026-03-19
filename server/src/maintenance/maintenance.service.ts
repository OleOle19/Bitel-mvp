import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class MaintenanceService {
  constructor(private prisma: PrismaService) {}

  async resetDemoData() {
    return this.prisma.$transaction(async (tx) => {
      const saleItems = await tx.saleItem.deleteMany();
      const sales = await tx.sale.deleteMany();
      const cashSessions = await tx.cashSession.deleteMany();

      const clientLines = await tx.clientLine.deleteMany();
      const clients = await tx.client.deleteMany();

      const movements = await tx.inventoryMovement.deleteMany();
      const transfers = await tx.inventoryTransfer.deleteMany();
      const inventory = await tx.inventoryItem.deleteMany();

      const receiptSequences = await tx.receiptSequence.deleteMany();
      const activities = await tx.activityLog.deleteMany();

      return {
        deleted: {
          saleItems: saleItems.count,
          sales: sales.count,
          cashSessions: cashSessions.count,
          clientLines: clientLines.count,
          clients: clients.count,
          inventoryMovements: movements.count,
          inventoryTransfers: transfers.count,
          inventoryItems: inventory.count,
          receiptSequences: receiptSequences.count,
          activityLogs: activities.count
        }
      };
    });
  }
}

