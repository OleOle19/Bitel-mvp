import {
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested
} from "class-validator";
import { Type } from "class-transformer";
import { PaymentMethod, ReceiptType, SaleType } from "@prisma/client";

class SaleItemDto {
  @IsOptional()
  @IsString()
  itemId?: string;

  @IsString()
  description!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;
}

export class CreateSaleDto {
  @IsString()
  localId!: string;

  @IsOptional()
  @IsString()
  clientId?: string;

  @IsOptional()
  @IsString()
  clientLineId?: string;

  @IsOptional()
  @IsString()
  lineNumber?: string;

  @IsEnum(SaleType)
  type!: SaleType;

  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountTotal?: number;

  @IsOptional()
  @IsEnum(ReceiptType)
  receiptType?: ReceiptType;

  @IsOptional()
  @IsString()
  receiptNumber?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items!: SaleItemDto[];
}
