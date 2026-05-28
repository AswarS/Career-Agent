import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    // Priority: header > body > query
    const fromHeader = req.headers['x-user-id'] as string | undefined;
    const raw =
      fromHeader ||
      req.body?.userId ||
      req.query?.userId;

    if (raw === undefined || raw === null || raw === '') {
      throw new UnauthorizedException('Missing userId. Provide X-User-Id header, body.userId, or query.userId');
    }

    const userId = Number(raw);
    if (!Number.isInteger(userId) || userId < 1) {
      throw new UnauthorizedException(`Invalid userId: "${raw}". Must be a positive integer.`);
    }

    req.userId = userId;
    next();
  }
}
