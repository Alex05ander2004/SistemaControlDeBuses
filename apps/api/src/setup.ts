import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Configuración compartida entre main.ts y los tests e2e. */
export function configureApp(app: INestApplication, webOrigin: string) {
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    // Sin esto el navegador no deja leer el nombre del archivo de las descargas (CSV).
    exposedHeaders: ['Content-Disposition'],
  });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  return app;
}
