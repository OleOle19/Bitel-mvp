import { Module } from "@nestjs/common";
import { SalesController } from "./sales.controller";
import { SalesService } from "./sales.service";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [ActivityModule],
  controllers: [SalesController],
  providers: [SalesService]
})
export class SalesModule {}
