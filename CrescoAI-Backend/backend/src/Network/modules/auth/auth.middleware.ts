import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

// TODO: 替换为登录注册后的 JWT/Session 解析，从 token 中提取 userId
const DEFAULT_USER_ID = 1;

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    const fromHeader = req.headers['x-user-id'] as string | undefined;
    const raw = fromHeader || req.body?.userId || req.query?.userId;

    if (raw !== undefined && raw !== null && raw !== '') {
      const userId = Number(raw);
      if (Number.isInteger(userId) && userId >= 1) {
        req.userId = userId;
        next();
        return;
      }
    }

    req.userId = DEFAULT_USER_ID;
    next();
  }
}
