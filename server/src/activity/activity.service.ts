import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  log(params: {
    action: string;
    entity: string;
    entityId?: string;
    userId?: string;
    localId?: string;
    meta?: Prisma.InputJsonValue;
    before?: unknown;
    after?: unknown;
  }) {
    const safeBefore =
      params.before === undefined ? undefined : JSON.parse(JSON.stringify(params.before));
    const safeAfter =
      params.after === undefined ? undefined : JSON.parse(JSON.stringify(params.after));
    return this.prisma.activityLog.create({
      data: {
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        userId: params.userId,
        localId: params.localId,
        meta: params.meta,
        before: safeBefore as Prisma.InputJsonValue,
        after: safeAfter as Prisma.InputJsonValue
      }
    });
  }

  list(filters: {
    localId?: string;
    user?: string;
    from?: Date;
    to?: Date;
    action?: string;
    entity?: string;
  }) {
    const createdAt: Record<string, Date> = {};
    if (filters.from) createdAt.gte = filters.from;
    if (filters.to) createdAt.lte = filters.to;
    const where: Prisma.ActivityLogWhereInput = {
      localId: filters.localId,
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {})
    };

    const actionFilter = String(filters.action || "").trim();
    if (actionFilter) {
      where.action = { contains: actionFilter, mode: "insensitive" };
    }

    const entityFilter = String(filters.entity || "").trim();
    if (entityFilter) {
      where.entity = { contains: entityFilter, mode: "insensitive" };
    }

    const userFilter = String(filters.user || "").trim();
    if (userFilter) {
      where.OR = [
        { userId: { contains: userFilter, mode: "insensitive" } },
        { user: { is: { fullName: { contains: userFilter, mode: "insensitive" } } } },
        { user: { is: { email: { contains: userFilter, mode: "insensitive" } } } }
      ];
    }

    return this.prisma.activityLog.findMany({
      where,
      include: { user: true, local: true },
      orderBy: { createdAt: "desc" }
    });
  }
}
