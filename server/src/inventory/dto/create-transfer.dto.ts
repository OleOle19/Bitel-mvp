import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateTransferDto {
  @IsString()
  itemId!: string;

  @IsOptional()
  @IsString()
  fromLocalId?: string;

  @IsString()
  toLocalId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
