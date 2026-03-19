import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { ActivityService } from "../activity/activity.service";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private activity: ActivityService) {}

  list() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        localId: true,
        active: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    const updated = await this.prisma.user.update({
      where: { id },
      data: dto,
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        localId: true,
        active: true
      }
    });
    await this.activity.log({
      action: "user.update",
      entity: "User",
      entityId: updated.id,
      userId: actorId,
      localId: updated.localId ?? undefined,
      before,
      after: updated
    });
    return updated;
  }
}
