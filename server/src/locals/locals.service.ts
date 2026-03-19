import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateLocalDto } from "./dto/create-local.dto";

@Injectable()
export class LocalsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.local.findMany({ orderBy: { createdAt: "desc" } });
  }

  lookup() {
    return this.prisma.local.findMany({
      select: { id: true, code: true, name: true, active: true },
      orderBy: { createdAt: "desc" }
    });
  }

  create(dto: CreateLocalDto) {
    return this.prisma.local.create({ data: dto });
  }
}
