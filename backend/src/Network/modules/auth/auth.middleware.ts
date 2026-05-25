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
    req.userId = DEFAULT_USER_ID;
    next();
  }
}
