import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class ReceiveTransferDto {
  @IsString()
  transferCode!: string;

  // Allows partial receptions. If omitted, receives full transfer quantity.
  @IsOptional()
  @IsInt()
  @Min(1)
  receivedQuantity?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
