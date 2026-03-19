import { IsBoolean, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class OpenCashDto {
  @IsString()
  localId!: string;

  @IsNumber()
  @Min(0)
  openingAmount!: number;

  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
