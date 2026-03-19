import { IsEnum, IsNumber, IsOptional, IsString, Min } from "class-validator";

export enum CashTransactionType {
  DEPOSIT = "DEPOSIT",
  WITHDRAWAL = "WITHDRAWAL",
  EXPENSE = "EXPENSE",
  BANK_DEPOSIT = "BANK_DEPOSIT"
}

export class CashTransactionDto {
  @IsEnum(CashTransactionType)
  type!: CashTransactionType;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
