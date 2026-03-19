import { IsString } from "class-validator";

export class ObserveTransferBatchDto {
  @IsString()
  batchCode!: string;

  @IsString()
  observation!: string;
}

