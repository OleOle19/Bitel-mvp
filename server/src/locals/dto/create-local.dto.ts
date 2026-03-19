import { IsOptional, IsString } from "class-validator";

export class CreateLocalDto {
  @IsString()
  name!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsString()
  address?: string;
}
