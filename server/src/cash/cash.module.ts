import { Module } from "@nestjs/common";
import { CashController } from "./cash.controller";
import { CashService } from "./cash.service";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [ActivityModule],
  controllers: [CashController],
  providers: [CashService]
})
export class CashModule {}
