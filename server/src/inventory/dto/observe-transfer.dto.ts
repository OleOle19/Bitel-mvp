import { IsOptional, IsString } from "class-validator";

export class ObserveTransferDto {
  @IsString()
  transferCode!: string;

  @IsOptional()
  @IsString()
  observation?: string;
}
