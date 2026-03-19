import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma, SaleStatus, SaleType } from "@prisma/client";

type Period = "day" | "week" | "month" | "year";

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function startOfWeek(date: Date) {
  const day = date.getDay() || 7;
  const diff = date.getDate() - day + 1;
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), diff));
}

function endOfWeek(date: Date) {
  const start = startOfWeek(date);
  return endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6));
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function resolveRange(period: Period, date: Date) {
  switch (period) {
    case "day":
      return { from: startOfDay(date), to: endOfDay(date) };
    case "week":
      return { from: startOfWeek(date), to: endOfWeek(date) };
    case "month":
      return { from: startOfMonth(date), to: endOfMonth(date) };
    case "year":
      return { from: startOfYear(date), to: endOfYear(date) };
    default:
      return { from: startOfDay(date), to: endOfDay(date) };
  }
}

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async summary(params: { localId?: string; period: Period; date: Date }) {
    const range = resolveRange(params.period, params.date);
    const where: Prisma.SaleWhereInput = {
      localId: params.localId,
      createdAt: { gte: range.from, lte: range.to },
      status: SaleStatus.ACTIVE
    };

    const aggregate = await this.prisma.sale.aggregate({
      where,
      _count: true,
      _sum: { total: true }
    });

    const byType = await this.prisma.sale.groupBy({
      where,
      by: ["type"],
      _sum: { total: true },
      _count: { _all: true }
    });

    const typeTotals = Object.values(SaleType).reduce((acc, type) => {
      const row = byType.find((r) => r.type === type);
      acc[type] = {
        total: Number(row?._sum?.total ?? 0),
        count: row?._count?._all ?? 0
      };
      return acc;
    }, {} as Record<SaleType, { total: number; count: number }>);

    const groupedByLocal = await this.prisma.sale.groupBy({
      where,
      by: ["localId"],
      _sum: { total: true },
      _count: { _all: true }
    });
    const localIds = groupedByLocal
      .map((row) => row.localId)
      .filter((value): value is string => Boolean(value));
    const locals = localIds.length
      ? await this.prisma.local.findMany({
          where: { id: { in: localIds } },
          select: { id: true, code: true, name: true }
        })
      : [];
    const localMap = locals.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {} as Record<string, { id: string; code: string; name: string }>);
    const byLocal = groupedByLocal
      .map((row) => {
        const local = localMap[row.localId] || null;
        return {
          localId: row.localId,
          localCode: local?.code ?? row.localId,
          localName: local?.name ?? "",
          total: Number(row._sum?.total ?? 0),
          count: Number(row._count?._all ?? 0)
        };
      })
      .sort((a, b) => b.total - a.total);

    return {
      from: range.from,
      to: range.to,
      totalSales: Number(aggregate._sum?.total ?? 0),
      salesCount: aggregate._count,
      byType: typeTotals,
      byLocal
    };
  }

  async liveCash(params: { localId?: string }) {
    const sessions = await this.prisma.cashSession.findMany({
      where: {
        status: "OPEN",
        ...(params.localId ? { localId: params.localId } : {})
      },
      include: { local: true },
      orderBy: { openedAt: "desc" }
    });

    if (sessions.length === 0) {
      return {
        sessionsOpen: 0,
        totalOpening: 0,
        totalSales: 0,
        totalTransactions: 0,
        totalExpected: 0,
        byLocal: []
      };
    }

    const sessionIds = sessions.map((s) => s.id);
    const salesBySession = await this.prisma.sale.groupBy({
      by: ["cashSessionId"],
      where: {
        cashSessionId: { in: sessionIds },
        status: SaleStatus.ACTIVE
      },
      _sum: { total: true }
    });
    const txRows = await this.prisma.activityLog.findMany({
      where: {
        entity: "CashSession",
        action: "cash.tx.create",
        entityId: { in: sessionIds }
      },
      select: { entityId: true, meta: true }
    });

    const salesMap = salesBySession.reduce((acc, row) => {
      if (row.cashSessionId) {
        acc[row.cashSessionId] = Number(row._sum?.total ?? 0);
      }
      return acc;
    }, {} as Record<string, number>);

    const txMap = txRows.reduce((acc, row) => {
      const key = String(row.entityId || "");
      if (!key) return acc;
      const meta = (row.meta ?? {}) as any;
      const signed = Number(meta?.signedAmount ?? 0);
      if (Number.isFinite(signed)) {
        acc[key] = (acc[key] ?? 0) + signed;
      }
      return acc;
    }, {} as Record<string, number>);

    const byLocal = sessions.map((session) => {
      const openingAmount = Number(session.openingAmount ?? 0);
      const salesTotal = Number(salesMap[session.id] ?? 0);
      const transactionsTotal = Number(txMap[session.id] ?? 0);
      const expected = openingAmount + salesTotal + transactionsTotal;
      return {
        cashSessionId: session.id,
        localId: session.localId,
        localName: session.local?.name ?? "",
        openingAmount,
        salesTotal,
        transactionsTotal,
        expected
      };
    });

    return {
      sessionsOpen: sessions.length,
      totalOpening: byLocal.reduce((sum, row) => sum + row.openingAmount, 0),
      totalSales: byLocal.reduce((sum, row) => sum + row.salesTotal, 0),
      totalTransactions: byLocal.reduce((sum, row) => sum + row.transactionsTotal, 0),
      totalExpected: byLocal.reduce((sum, row) => sum + row.expected, 0),
      byLocal
    };
  }

  async salesBySeller(params: { localId?: string; from: Date; to: Date }) {
    return this.prisma.sale.groupBy({
      by: ["userId"],
      where: {
        localId: params.localId,
        createdAt: { gte: params.from, lte: params.to },
        status: SaleStatus.ACTIVE
      },
      _sum: { total: true },
      _count: { _all: true }
    });
  }

  async salesByLocal(params: { localId?: string; from: Date; to: Date }) {
    return this.prisma.sale.groupBy({
      by: ["localId"],
      where: {
        localId: params.localId,
        createdAt: { gte: params.from, lte: params.to },
        status: SaleStatus.ACTIVE
      },
      _sum: { total: true },
      _count: { _all: true }
    });
  }

  async cashDifferences(params: { localId?: string; from: Date; to: Date }) {
    return this.prisma.cashSession.findMany({
      where: {
        localId: params.localId,
        closedAt: { gte: params.from, lte: params.to },
        difference: { not: 0 }
      },
      orderBy: { closedAt: "desc" }
    });
  }

  async cashClosures(params: { localId?: string; from: Date; to: Date }) {
    return this.prisma.cashSession.findMany({
      where: {
        localId: params.localId,
        closedAt: { gte: params.from, lte: params.to }
      },
      include: { local: true, user: true, approvedBy: true },
      orderBy: { closedAt: "desc" }
    });
  }

  async cashClosuresSummary(params: { localId?: string; from: Date; to: Date }) {
    const sessions = await this.cashClosures(params);
    const byLocal: Record<
      string,
      { localId: string; localName?: string; count: number; total: number; difference: number }
    > = {};
    let total = 0;
    let difference = 0;

    sessions.forEach((s) => {
      const key = s.localId;
      if (!byLocal[key]) {
        byLocal[key] = {
          localId: key,
          localName: s.local?.name,
          count: 0,
          total: 0,
          difference: 0
        };
      }
      byLocal[key].count += 1;
      const closing = Number(s.closingAmount ?? 0);
      const diff = Number(s.difference ?? 0);
      byLocal[key].total += closing;
      byLocal[key].difference += diff;
      total += closing;
      difference += diff;
    });

    return {
      sessions,
      byLocal: Object.values(byLocal),
      totals: { count: sessions.length, total, difference }
    };
  }

  async lowStock(localId?: string) {
    const items = await this.prisma.inventoryItem.findMany({
      where: {
        localId,
        minStock: { gt: 0 }
      },
      orderBy: { quantity: "asc" }
    });
    return items.filter((item) => item.quantity <= item.minStock);
  }

  async inventoryMovements(params: { localId?: string; from: Date; to: Date }) {
    const localFilter = params.localId
      ? { OR: [{ fromLocalId: params.localId }, { toLocalId: params.localId }] }
      : {};
    return this.prisma.inventoryMovement.findMany({
      where: {
        ...localFilter,
        createdAt: { gte: params.from, lte: params.to }
      },
      include: { item: true, user: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async inventoryKardexValued(params: { localId?: string; from: Date; to: Date }) {
    const movements = await this.inventoryMovements(params);
    return movements.map((m) => {
      const cost = m.item ? Number((m.item as any).cost ?? 0) : 0;
      const value = cost * Number(m.quantity ?? 0);
      return {
        ...m,
        cost,
        value
      };
    });
  }

  inventoryItems(localId?: string) {
    return this.prisma.inventoryItem.findMany({
      where: { localId },
      include: { local: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async alerts(params: { localId?: string; from: Date; to: Date }) {
    const [lowStock, cashDiffs, pendingTransfers, observedTransfers] = await Promise.all([
      this.lowStock(params.localId),
      this.cashDifferences(params),
      this.prisma.inventoryTransfer.findMany({
        where: {
          ...(params.localId
            ? { OR: [{ fromLocalId: params.localId }, { toLocalId: params.localId }] }
            : {}),
          status: "SENT"
        },
        orderBy: { createdAt: "desc" },
        take: 20
      }),
      this.prisma.inventoryTransfer.findMany({
        where: {
          ...(params.localId
            ? { OR: [{ fromLocalId: params.localId }, { toLocalId: params.localId }] }
            : {}),
          status: "OBSERVED"
        },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    ]);

    return {
      lowStockCount: lowStock.length,
      lowStock: lowStock.slice(0, 20),
      cashDiffsCount: cashDiffs.length,
      cashDiffs: cashDiffs.slice(0, 20),
      pendingTransfersCount: pendingTransfers.length,
      pendingTransfers,
      observedTransfersCount: observedTransfers.length,
      observedTransfers
    };
  }

  async salesByCategory(params: { localId?: string; from: Date; to: Date }) {
    const items = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          localId: params.localId,
          createdAt: { gte: params.from, lte: params.to },
          status: SaleStatus.ACTIVE
        },
        itemId: { not: null }
      }
    });

    const itemIds = Array.from(
      new Set(items.map((row) => row.itemId).filter((id): id is string => Boolean(id)))
    );
    const inventory = itemIds.length
      ? await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } })
      : [];
    const inventoryById = inventory.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {} as Record<string, (typeof inventory)[number]>);

    const byCategory: Record<
      string,
      { category: string; quantity: number; total: number; margin: number }
    > = {};

    items.forEach((row) => {
      const inv = row.itemId ? inventoryById[row.itemId] : undefined;
      const category = inv?.category?.trim() || "Sin categoria";
      if (!byCategory[category]) {
        byCategory[category] = { category, quantity: 0, total: 0, margin: 0 };
      }
      const discount = Number(row.discountAmount ?? 0);
      const lineTotal = Number(row.unitPrice) * row.quantity - discount;
      const cost = inv ? Number(inv.cost ?? 0) * row.quantity : 0;
      byCategory[category].quantity += row.quantity;
      byCategory[category].total += lineTotal;
      byCategory[category].margin += lineTotal - cost;
    });

    return Object.values(byCategory).sort((a, b) => b.total - a.total);
  }

  async topProducts(params: { localId?: string; from: Date; to: Date; limit?: number }) {
    const limit = Math.max(1, Math.min(50, Number(params.limit ?? 10)));
    const items = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          localId: params.localId,
          createdAt: { gte: params.from, lte: params.to },
          status: SaleStatus.ACTIVE
        }
      }
    });

    const itemIds = Array.from(
      new Set(items.map((row) => row.itemId).filter((id): id is string => Boolean(id)))
    );
    const inventory = itemIds.length
      ? await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } })
      : [];
    const inventoryById = inventory.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {} as Record<string, (typeof inventory)[number]>);

    const byKey: Record<
      string,
      {
        key: string;
        sku?: string;
        name: string;
        quantity: number;
        total: number;
        margin: number;
      }
    > = {};

    items.forEach((row) => {
      const inv = row.itemId ? inventoryById[row.itemId] : undefined;
      const sku = inv?.sku ?? undefined;
      const name = inv?.name ?? row.description;
      const key = row.itemId ?? `desc:${row.description}`;
      if (!byKey[key]) {
        byKey[key] = { key, sku, name, quantity: 0, total: 0, margin: 0 };
      }
      const discount = Number(row.discountAmount ?? 0);
      const lineTotal = Number(row.unitPrice) * row.quantity - discount;
      const cost = inv ? Number(inv.cost ?? 0) * row.quantity : 0;
      byKey[key].quantity += row.quantity;
      byKey[key].total += lineTotal;
      byKey[key].margin += lineTotal - cost;
    });

    return Object.values(byKey)
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
  }

  async kpis(params: { localId?: string; from: Date; to: Date }) {
    const sales = await this.prisma.sale.findMany({
      where: {
        localId: params.localId,
        createdAt: { gte: params.from, lte: params.to },
        status: SaleStatus.ACTIVE
      },
      include: { items: true }
    });

    const itemIds = Array.from(
      new Set(
        sales
          .flatMap((s) => s.items)
          .map((row) => row.itemId)
          .filter((id): id is string => Boolean(id))
      )
    );
    const inventory = itemIds.length
      ? await this.prisma.inventoryItem.findMany({ where: { id: { in: itemIds } } })
      : [];
    const inventoryById = inventory.reduce((acc, row) => {
      acc[row.id] = row;
      return acc;
    }, {} as Record<string, (typeof inventory)[number]>);

    const totalsByMethod: Record<string, number> = {};
    let totalSales = 0;
    let itemsCount = 0;
    let margin = 0;

    sales.forEach((sale) => {
      totalSales += Number(sale.total ?? 0);
      totalsByMethod[sale.method] = (totalsByMethod[sale.method] ?? 0) + Number(sale.total ?? 0);
      sale.items.forEach((it) => {
        itemsCount += it.quantity;
        const inv = it.itemId ? inventoryById[it.itemId] : undefined;
        const discount = Number(it.discountAmount ?? 0);
        const lineTotal = Number(it.unitPrice) * it.quantity - discount;
        const cost = inv ? Number(inv.cost ?? 0) * it.quantity : 0;
        margin += lineTotal - cost;
      });
    });

    const salesCount = sales.length;
    const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;
    const avgItems = salesCount > 0 ? itemsCount / salesCount : 0;
    const avgMargin = salesCount > 0 ? margin / salesCount : 0;

    return {
      salesCount,
      totalSales,
      avgTicket,
      itemsCount,
      avgItems,
      margin,
      avgMargin,
      totalsByMethod
    };
  }

  async globalSearch(params: { q: string; localId?: string }) {
    const q = params.q.trim();
    if (!q) return { inventory: [], clients: [], sales: [], cash: [] };

    const [inventory, clients, sales, cash] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where: {
          localId: params.localId,
          OR: [
            { sku: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      this.prisma.client.findMany({
        where: {
          ...(params.localId ? { OR: [{ localId: params.localId }, { localId: null }] } : {}),
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { documentId: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      this.prisma.sale.findMany({
        where: {
          localId: params.localId,
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { receiptNumber: { contains: q, mode: "insensitive" } }
          ]
        },
        orderBy: { createdAt: "desc" },
        take: 10
      }),
      this.prisma.cashSession.findMany({
        where: {
          localId: params.localId,
          id: { contains: q, mode: "insensitive" }
        },
        orderBy: { openedAt: "desc" },
        take: 10
      })
    ]);

    return { inventory, clients, sales, cash };
  }

  async backup() {
    const [locals, users, inventory, cash, sales, transfers, movements, clients, lines, activity] =
      await Promise.all([
        this.prisma.local.findMany({ orderBy: { createdAt: "asc" } }),
        this.prisma.user.findMany({ orderBy: { createdAt: "asc" } }),
        this.prisma.inventoryItem.findMany({ orderBy: { createdAt: "asc" } }),
        this.prisma.cashSession.findMany({ orderBy: { openedAt: "asc" } }),
        this.prisma.sale.findMany({ include: { items: true }, orderBy: { createdAt: "asc" } }),
        this.prisma.inventoryTransfer.findMany({ orderBy: { createdAt: "asc" } }),
        this.prisma.inventoryMovement.findMany({ orderBy: { createdAt: "asc" } }),
        this.prisma.client.findMany({ orderBy: { createdAt: "asc" } }),
        this.prisma.clientLine.findMany({ orderBy: { createdAt: "asc" } }),
        this.prisma.activityLog.findMany({ orderBy: { createdAt: "asc" } })
      ]);

    const safeUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      role: u.role,
      localId: u.localId,
      active: u.active,
      createdAt: u.createdAt
    }));

    return {
      generatedAt: new Date().toISOString(),
      locals,
      users: safeUsers,
      inventory,
      cash,
      sales,
      transfers,
      movements,
      clients,
      lines,
      activity
    };
  }

  async cashReconciliation(params: { cashSessionId: string }) {
    const session = await this.prisma.cashSession.findUnique({
      where: { id: params.cashSessionId },
      include: { sales: true, local: true, user: true, approvedBy: true }
    });
    if (!session) return null;

    const totalsByMethod: Record<string, number> = {};
    session.sales.forEach((sale) => {
      totalsByMethod[sale.method] = (totalsByMethod[sale.method] ?? 0) + Number(sale.total ?? 0);
    });

    const tx = await this.prisma.activityLog.findMany({
      where: { entity: "CashSession", entityId: session.id, action: "cash.tx.create" },
      orderBy: { createdAt: "asc" }
    });
    const transactionsTotal = tx.reduce((sum, row) => {
      const meta = (row.meta ?? {}) as any;
      const signed = Number(meta?.signedAmount ?? 0);
      return sum + (Number.isFinite(signed) ? signed : 0);
    }, 0);

    const expected =
      Number(session.openingAmount ?? 0) +
      session.sales.reduce((sum, s) => sum + Number(s.total ?? 0), 0) +
      transactionsTotal;

    return {
      session,
      totalsByMethod,
      transactions: tx,
      transactionsTotal,
      expected
    };
  }
}
