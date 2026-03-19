import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { ActivityModule } from "../activity/activity.module";

@Module({
  imports: [ActivityModule],
  controllers: [UsersController],
  providers: [UsersService]
})
export class UsersModule {}
