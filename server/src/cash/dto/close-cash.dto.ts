import { IsNumber, IsObject, IsOptional, IsString, Min } from "class-validator";

export class CloseCashDto {
  @IsString()
  cashSessionId!: string;

  @IsNumber()
  @Min(0)
  closingAmount!: number;

  // Cash count by denomination: { "200": 1, "0.5": 2, ... }.
  // Stored in ActivityLog meta for audit/reconciliation.
  @IsOptional()
  @IsObject()
  breakdown?: Record<string, number>;
}
