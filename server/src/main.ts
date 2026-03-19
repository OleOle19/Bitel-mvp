import "dotenv/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("api/v1");
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true
    })
  );

  const http = app.getHttpAdapter().getInstance();
  http.get("/", (_req: any, res: any) => {
    res.status(200).json({
      ok: true,
      message: "Bitel API en linea",
      hint: "Usa rutas bajo /api/v1"
    });
  });
  http.get("/api/v1", (_req: any, res: any) => {
    res.status(200).json({
      ok: true,
      message: "Base API /api/v1 en linea",
      hint: "Ejemplo protegido: GET /api/v1/reports/summary"
    });
  });

  await app.listen(4000);
}

bootstrap();
