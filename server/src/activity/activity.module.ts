import { Module } from "@nestjs/common";
import { ActivityController } from "./activity.controller";
import { LogsController } from "./logs.controller";
import { ActivityService } from "./activity.service";

@Module({
  controllers: [ActivityController, LogsController],
  providers: [ActivityService],
  exports: [ActivityService]
})
export class ActivityModule {}
