import { IsString, MinLength } from "class-validator";

export class CancelSaleDto {
  @IsString()
  @MinLength(4)
  reason!: string;
}
