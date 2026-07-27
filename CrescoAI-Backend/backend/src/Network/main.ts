import 'reflect-metadata';

// Disable interleaved thinking beta (ISP) — claude-sonnet/opus 4.x models automatically
// receive the 'interleaved-thinking-2025-05-14' beta header, which causes the streaming
// parser to receive thinking/signature deltas for non-thinking content blocks and throw
// 'Content block is not a thinking block' when thinkingConfig is 'disabled'.
//
// TODO: remove this env var once thinking mode is properly wired from frontend settings
// (see queryEngineFactory.ts TODO and update-api-settings.dto.ts field stubs).
// When thinking is enabled, the ISP beta works correctly with an explicit thinkingConfig.
process.env.DISABLE_INTERLEAVED_THINKING = '1';

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { enableConfigs } from '../utils/config.js';
import { ensureBootstrapMacro } from '../bootstrapMacro.js';
import { validateCareerAgentSecurityConfig } from './security.config.js';

enableConfigs();
validateCareerAgentSecurityConfig();
ensureBootstrapMacro();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 4000);
  console.log(`Server started on http://localhost:${process.env.PORT ?? 4000}`);
}

bootstrap().catch((err) => {
  console.error('Bootstrap failed:', err);
  process.exit(1);
});
