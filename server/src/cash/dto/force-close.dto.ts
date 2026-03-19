import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class ForceCloseDto {
  @IsString()
  localId!: string;

  @IsNumber()
  @Min(0)
  closingAmount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
