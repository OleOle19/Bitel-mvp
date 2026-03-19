import { IsOptional, IsString } from "class-validator";

export class CreateClientDto {
  @IsString()
  fullName!: string;

  @IsOptional()
  @IsString()
  documentId?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  localId?: string;
}
