import type { INestApplication } from '@nestjs/common';
import { json, urlencoded } from 'express';

export function configureNetworkBodyParsers(app: INestApplication) {
  // Register the larger route first. Express skips later parsers after the body
  // has been consumed, while all other routes still receive the default limit.
  app.use('/api/career-agent/training', json({ limit: '2mb' }));
  app.use(json());
  app.use(urlencoded({ extended: true }));
}
