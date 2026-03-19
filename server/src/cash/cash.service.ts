import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OpenCashDto } from "./dto/open-cash.dto";
import { CloseCashDto } from "./dto/close-cash.dto";
import { ForceCloseDto } from "./dto/force-close.dto";
import { ActivityService } from "../activity/activity.service";
import { CashTransactionDto, CashTransactionType } from "./dto/cash-transaction.dto";

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService, private activity: ActivityService) {}

  private async sumTransactions(cashSessionId: string) {
    const tx = await this.prisma.activityLog.findMany({
      where: {
        entity: "CashSession",
        entityId: cashSessionId,
        action: "cash.tx.create"
      },
      orderBy: { createdAt: "asc" }
    });
    return tx.reduce((sum, row) => {
      const meta = (row.meta ?? {}) as any;
      const signed = Number(meta?.signedAmount ?? 0);
      return sum + (Number.isFinite(signed) ? signed : 0);
    }, 0);
  }

  list(localId?: string) {
    return this.prisma.cashSession.findMany({
      where: { localId },
      orderBy: { openedAt: "desc" }
    });
  }

  getById(id: string) {
    return this.prisma.cashSession.findUnique({
      where: { id },
      include: { local: true, user: true }
    });
  }

  async open(dto: OpenCashDto, userId: string, userRole: string) {
    const open = await this.prisma.cashSession.findFirst({
      where: { localId: dto.localId, status: "OPEN" }
    });
    if (open) {
      throw new BadRequestException("Ya existe una caja abierta");
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const openedToday = await this.prisma.cashSession.count({
      where: {
        localId: dto.localId,
        openedAt: {
          gte: dayStart,
          lt: dayEnd
        }
      }
    });

    if (openedToday > 0 && userRole !== "ADMIN") {
      throw new BadRequestException(
        "Solo un administrador puede abrir caja mas de una vez en el mismo dia."
      );
    }
    if (openedToday > 0 && userRole === "ADMIN" && !dto.force) {
      return {
        requiresConfirmation: true,
        openedToday,
        message: `Ya se abrio caja ${openedToday} vez/veces hoy en este local.`
      };
    }

    const session = await this.prisma.cashSession.create({
      data: {
        localId: dto.localId,
        openingAmount: dto.openingAmount,
        userId
      }
    });
    await this.activity.log({
      action: "cash.open",
      entity: "CashSession",
      entityId: session.id,
      userId,
      localId: session.localId,
      meta: openedToday > 0 ? { reopenedTodayCount: openedToday + 1 } : undefined
    });
    return session;
  }

  async close(dto: CloseCashDto, userId: string, userRole: string, userLocalId?: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: dto.cashSessionId },
      include: { sales: true }
    });
    if (!session || session.status !== "OPEN") {
      throw new BadRequestException("Caja no encontrada o ya cerrada");
    }
    const canBypassLocalScope = userRole === "ADMIN" || userRole === "AUDITOR";
    if (userLocalId && !canBypassLocalScope && session.localId !== userLocalId) {
      throw new BadRequestException("Caja no corresponde a tu local");
    }

    const transactionsTotal = await this.sumTransactions(session.id);
    const expectedAmount =
      Number(session.openingAmount) +
      session.sales.reduce((sum, sale) => sum + Number(sale.total), 0) +
      transactionsTotal;
    const difference = Number(dto.closingAmount) - expectedAmount;

    const updated = await this.prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closingAmount: dto.closingAmount,
        expectedAmount,
        difference,
        approvedById:
          userRole === "ADMIN" ||
          userRole === "AUDITOR" ||
          userRole === "VENDEDOR"
            ? userId
            : undefined
      }
    });
    await this.activity.log({
      action: "cash.close",
      entity: "CashSession",
      entityId: updated.id,
      userId,
      localId: updated.localId,
      meta: {
        expectedAmount,
        difference,
        transactionsTotal,
        breakdown: dto.breakdown ?? undefined
      },
      before: session,
      after: updated
    });
    return updated;
  }

  openForLocal(localId: string) {
    return this.prisma.cashSession.findFirst({
      where: { localId, status: "OPEN" }
    });
  }

  async forceClose(dto: ForceCloseDto, userId: string) {
    const session = await this.prisma.cashSession.findFirst({
      where: { localId: dto.localId, status: "OPEN" },
      include: { sales: true }
    });
    if (!session) {
      throw new BadRequestException("No hay caja abierta para este local");
    }

    const transactionsTotal = await this.sumTransactions(session.id);
    const expectedAmount =
      Number(session.openingAmount) +
      session.sales.reduce((sum, sale) => sum + Number(sale.total), 0) +
      transactionsTotal;
    const difference = Number(dto.closingAmount) - expectedAmount;

    const updated = await this.prisma.cashSession.update({
      where: { id: session.id },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
        closingAmount: dto.closingAmount,
        expectedAmount,
        difference,
        approvedById: userId
      }
    });

    await this.activity.log({
      action: "cash.force_close",
      entity: "CashSession",
      entityId: updated.id,
      userId,
      localId: updated.localId,
      meta: { reason: dto.reason, expectedAmount, difference, transactionsTotal },
      before: session,
      after: updated
    });

    return updated;
  }

  async listTransactions(cashSessionId: string, userRole: string, userLocalId?: string) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: cashSessionId }
    });
    if (!session) {
      throw new BadRequestException("Caja no encontrada");
    }
    const canBypassLocalScope = userRole === "ADMIN" || userRole === "AUDITOR";
    if (userLocalId && !canBypassLocalScope && session.localId !== userLocalId) {
      throw new BadRequestException("Caja no corresponde a tu local");
    }
    return this.prisma.activityLog.findMany({
      where: { entity: "CashSession", entityId: cashSessionId, action: "cash.tx.create" },
      orderBy: { createdAt: "desc" }
    });
  }

  async createTransaction(
    cashSessionId: string,
    dto: CashTransactionDto,
    userId: string,
    userRole: string,
    userLocalId?: string
  ) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: cashSessionId }
    });
    if (!session || session.status !== "OPEN") {
      throw new BadRequestException("Caja no encontrada o ya cerrada");
    }
    const canBypassLocalScope = userRole === "ADMIN" || userRole === "AUDITOR";
    if (userLocalId && !canBypassLocalScope && session.localId !== userLocalId) {
      throw new BadRequestException("Caja no corresponde a tu local");
    }

    const normalizedReason = String(dto.reason || "").trim();
    if (dto.type === CashTransactionType.EXPENSE && !normalizedReason) {
      throw new BadRequestException("Motivo obligatorio para gasto operativo");
    }

    const isPositive = dto.type === CashTransactionType.DEPOSIT;
    const signedAmount = (isPositive ? 1 : -1) * Number(dto.amount);

    await this.activity.log({
      action: "cash.tx.create",
      entity: "CashSession",
      entityId: session.id,
      userId,
      localId: session.localId,
      meta: {
        type: dto.type,
        amount: dto.amount,
        signedAmount,
        reason: normalizedReason || undefined
      }
    });

    return { ok: true };
  }
}
