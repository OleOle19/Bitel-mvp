import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateInventoryDto {
  @IsString()
  localId!: string;

  @IsString()
  sku!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsInt()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cost?: number;

  @IsNumber()
  @Min(0)
  price!: number;
}
