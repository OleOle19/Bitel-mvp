import { Module } from "@nestjs/common";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [ActivityModule],
  controllers: [InventoryController],
  providers: [InventoryService]
})
export class InventoryModule {}
