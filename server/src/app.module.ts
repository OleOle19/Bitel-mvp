import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";
import { LocalsModule } from "./locals/locals.module";
import { InventoryModule } from "./inventory/inventory.module";
import { CashModule } from "./cash/cash.module";
import { SalesModule } from "./sales/sales.module";
import { ReportsModule } from "./reports/reports.module";
import { ActivityModule } from "./activity/activity.module";
import { ClientsModule } from "./clients/clients.module";
import { MaintenanceModule } from "./maintenance/maintenance.module";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    LocalsModule,
    InventoryModule,
    CashModule,
    SalesModule,
    ReportsModule,
    ActivityModule,
    ClientsModule,
    MaintenanceModule
  ]
})
export class AppModule {}
