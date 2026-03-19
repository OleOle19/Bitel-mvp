import { IsEmail } from "class-validator";

export class SendSaleReceiptDto {
  @IsEmail()
  email!: string;
}

