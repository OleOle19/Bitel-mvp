import { IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { MovementType } from "@prisma/client";

export class AdjustInventoryDto {
  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  localId?: string;

  @IsEnum(MovementType)
  type!: MovementType; // IN or OUT

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
