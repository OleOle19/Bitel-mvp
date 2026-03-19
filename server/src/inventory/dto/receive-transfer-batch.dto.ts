import { IsOptional, IsString } from "class-validator";

export class ReceiveTransferBatchDto {
  @IsString()
  batchCode!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

