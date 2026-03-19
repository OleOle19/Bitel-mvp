import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class ClientAccountEntryDto {
  @IsString()
  clientId!: string;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

