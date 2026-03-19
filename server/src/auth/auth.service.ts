import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import * as bcrypt from "bcrypt";
import { RegisterDto } from "./dto/register.dto";
import { ActivityService } from "../activity/activity.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private activity: ActivityService
  ) {}

  async validateUser(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.active) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Credenciales inválidas");
    }
    return user;
  }

  async login(email: string, password: string) {
    let user: any;
    try {
      user = await this.validateUser(email, password);
    } catch (err) {
      await this.activity.log({
        action: "auth.login_failed",
        entity: "User",
        meta: { email }
      });
      throw err;
    }
    const payload = { sub: user.id, role: user.role, localId: user.localId };
    await this.activity.log({
      action: "auth.login",
      entity: "User",
      entityId: user.id,
      userId: user.id,
      localId: user.localId ?? undefined
    });
    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        localId: user.localId
      }
    };
  }

  async register(dto: RegisterDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash,
        role: dto.role,
        localId: dto.localId
      }
    });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      localId: user.localId
    };
  }
}
