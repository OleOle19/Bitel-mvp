import { IsEnum, IsOptional, IsString } from "class-validator";

export enum ImportInventoryMode {
  SET = "SET",
  INCREMENT = "INCREMENT"
}

export class ImportInventoryDto {
  @IsString()
  localId!: string;

  // CSV columns: sku,name,category,quantity,minStock,price
  // Header row is optional.
  @IsString()
  csv!: string;

  @IsOptional()
  @IsEnum(ImportInventoryMode)
  mode?: ImportInventoryMode;

  @IsOptional()
  @IsString()
  delimiter?: string;
}
