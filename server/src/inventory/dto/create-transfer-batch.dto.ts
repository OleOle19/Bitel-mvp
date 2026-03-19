import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from "class-validator";

class TransferBatchItemDto {
  @IsString()
  itemId!: string; // id or SKU

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateTransferBatchDto {
  @IsOptional()
  @IsString()
  fromLocalId?: string;

  @IsString()
  toLocalId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransferBatchItemDto)
  items!: TransferBatchItemDto[];
}

