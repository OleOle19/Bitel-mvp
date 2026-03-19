import { IsBoolean, IsEnum, IsOptional, IsString } from "class-validator";
import { Role } from "@prisma/client";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  localId?: string | null;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
