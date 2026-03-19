import { IsString } from "class-validator";

export class CreateLineDto {
  @IsString()
  clientId!: string;

  @IsString()
  number!: string;
}
