import { IsEnum, IsOptional, IsString } from "class-validator";
import { ImportInventoryMode } from "./import-inventory.dto";

export class ImportInventoryExcelDto {
  @IsString()
  localId!: string;

  // Base64-encoded .xlsx file bytes.
  @IsString()
  fileBase64!: string;

  @IsOptional()
  @IsEnum(ImportInventoryMode)
  mode?: ImportInventoryMode;
}

