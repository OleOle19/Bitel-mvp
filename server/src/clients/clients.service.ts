import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateClientDto } from "./dto/create-client.dto";
import { CreateLineDto } from "./dto/create-line.dto";
import { ActivityService } from "../activity/activity.service";

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService, private activity: ActivityService) {}

  private normalizeDocumentId(documentId?: string) {
    const digits = String(documentId || "").replace(/\D/g, "");
    return digits || undefined;
  }

  private detectDocumentType(documentId?: string) {
    const normalized = this.normalizeDocumentId(documentId);
    if (!normalized) return null;
    if (normalized.length === 8) return "DNI";
    if (normalized.length === 11) return "RUC";
    return null;
  }

  async create(dto: CreateClientDto) {
    const normalizedDocumentId = this.normalizeDocumentId(dto.documentId);
    const documentType = this.detectDocumentType(normalizedDocumentId);
    if (normalizedDocumentId && !documentType) {
      throw new BadRequestException("Documento invalido. Usa DNI (8) o RUC (11).");
    }
    const payload = {
      ...dto,
      documentId: normalizedDocumentId
    };

    if (normalizedDocumentId) {
      const existing = await this.prisma.client.findFirst({
        where: { documentId: normalizedDocumentId },
        orderBy: { createdAt: "desc" }
      });
      if (existing) {
        return this.prisma.client.update({
          where: { id: existing.id },
          data: {
            fullName: payload.fullName || existing.fullName,
            phone: payload.phone || existing.phone,
            localId: payload.localId ?? existing.localId,
            documentId: normalizedDocumentId
          }
        });
      }
    }

    return this.prisma.client.create({ data: payload });
  }

  addLine(dto: CreateLineDto) {
    return this.prisma.clientLine.create({
      data: { clientId: dto.clientId, number: dto.number }
    });
  }

  search(query: string) {
    return this.prisma.client.findMany({
      where: {
        OR: [
          { fullName: { contains: query, mode: "insensitive" } },
          { documentId: { contains: query, mode: "insensitive" } },
          { phone: { contains: query, mode: "insensitive" } }
        ]
      },
      include: { lines: true }
    });
  }

  async lookupDocument(documentId: string, localId?: string) {
    const normalizedDocumentId = this.normalizeDocumentId(documentId);
    const documentType = this.detectDocumentType(normalizedDocumentId);
    if (!normalizedDocumentId || !documentType) {
      throw new BadRequestException("Documento invalido. Usa DNI (8) o RUC (11).");
    }

    const whereByDocument = {
      documentId: normalizedDocumentId,
      ...(localId ? { OR: [{ localId }, { localId: null }] } : {})
    };

    const existingClient = await this.prisma.client.findFirst({
      where: whereByDocument,
      include: { lines: true },
      orderBy: { createdAt: "desc" }
    });

    if (existingClient) {
      return {
        found: true,
        source: "LOCAL_DB",
        documentId: normalizedDocumentId,
        documentType,
        data: {
          fullName: existingClient.fullName ?? "",
          phone: existingClient.phone ?? ""
        },
        client: existingClient
      };
    }

    const token =
      process.env.DOCUMENT_LOOKUP_TOKEN ||
      process.env.APIS_TOKEN ||
      process.env.RENIEC_SUNAT_TOKEN;
    if (!token) {
      return {
        found: false,
        source: "NOT_CONFIGURED",
        documentId: normalizedDocumentId,
        documentType,
        data: {}
      };
    }

    const url =
      documentType === "DNI"
        ? `${process.env.RENIEC_API_URL || "https://api.apis.net.pe/v2/reniec/dni"}?numero=${normalizedDocumentId}`
        : `${process.env.SUNAT_API_URL || "https://api.apis.net.pe/v2/sunat/ruc/full"}?numero=${normalizedDocumentId}`;

    try {
      const fetchFn = (globalThis as any).fetch as any;
      if (typeof fetchFn !== "function") {
        return {
          found: false,
          source: "NOT_AVAILABLE",
          documentId: normalizedDocumentId,
          documentType,
          data: {}
        };
      }
      const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        return {
          found: false,
          source: "EXTERNAL_ERROR",
          documentId: normalizedDocumentId,
          documentType,
          data: {}
        };
      }
      const payload = await res.json();
      if (documentType === "DNI") {
        const fullName = String(
          payload?.nombreCompleto ||
            [payload?.nombres, payload?.apellidoPaterno, payload?.apellidoMaterno]
              .filter(Boolean)
              .join(" ")
        ).trim();
        return {
          found: Boolean(fullName),
          source: "RENIEC",
          documentId: normalizedDocumentId,
          documentType,
          data: { fullName }
        };
      }

      const fullName = String(payload?.nombre || payload?.razonSocial || "").trim();
      const phone = String(payload?.telefono || payload?.telefono1 || payload?.telefono2 || "").trim();
      return {
        found: Boolean(fullName),
        source: "SUNAT",
        documentId: normalizedDocumentId,
        documentType,
        data: { fullName, phone }
      };
    } catch (error) {
      return {
        found: false,
        source: "EXTERNAL_ERROR",
        documentId: normalizedDocumentId,
        documentType,
        data: {}
      };
    }
  }

  history(clientId: string) {
    return this.prisma.sale.findMany({
      where: { clientId },
      include: { items: true },
      orderBy: { createdAt: "desc" }
    });
  }

  async account(clientId: string) {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: { lines: true }
    });
    if (!client) return null;

    const events = await this.prisma.activityLog.findMany({
      where: {
        entity: "Client",
        entityId: clientId,
        action: { in: ["client.account.debt", "client.account.payment"] }
      },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    const balance = events.reduce((sum, row) => {
      const meta = (row.meta ?? {}) as any;
      const signed = Number(meta?.signedAmount ?? 0);
      return sum + (Number.isFinite(signed) ? signed : 0);
    }, 0);

    const aggregate = await this.prisma.sale.aggregate({
      where: { clientId, status: "ACTIVE" },
      _count: true,
      _sum: { total: true }
    });
    const lastSale = await this.prisma.sale.findFirst({
      where: { clientId },
      orderBy: { createdAt: "desc" }
    });

    return {
      client,
      balance,
      salesCount: aggregate._count,
      totalSales: Number(aggregate._sum?.total ?? 0),
      lastSaleAt: lastSale?.createdAt ?? null,
      events
    };
  }

  async addDebt(params: { clientId: string; amount: number; note?: string }, userId?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: params.clientId } });
    if (!client) return null;
    await this.activity.log({
      action: "client.account.debt",
      entity: "Client",
      entityId: client.id,
      userId,
      localId: client.localId ?? undefined,
      meta: {
        amount: params.amount,
        signedAmount: Number(params.amount),
        note: params.note
      }
    });
    return { ok: true };
  }

  async addPayment(params: { clientId: string; amount: number; note?: string }, userId?: string) {
    const client = await this.prisma.client.findUnique({ where: { id: params.clientId } });
    if (!client) return null;
    await this.activity.log({
      action: "client.account.payment",
      entity: "Client",
      entityId: client.id,
      userId,
      localId: client.localId ?? undefined,
      meta: {
        amount: params.amount,
        signedAmount: -Number(params.amount),
        note: params.note
      }
    });
    return { ok: true };
  }
}
