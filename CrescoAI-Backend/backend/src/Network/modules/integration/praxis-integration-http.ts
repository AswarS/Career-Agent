import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  NestInterceptor,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

type TraceRequest = Request & { praxisTraceId?: string };

@Injectable()
export class PraxisTraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const request = context.switchToHttp().getRequest<TraceRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const supplied = request.header('X-Trace-Id')?.trim();
    request.praxisTraceId = supplied && supplied.length <= 200
      ? supplied
      : `trace_${randomUUID()}`;
    response.setHeader('X-Trace-Id', request.praxisTraceId);
    return next.handle();
  }
}

@Catch()
export class PraxisIntegrationExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const request = host.switchToHttp().getRequest<TraceRequest>();
    const response = host.switchToHttp().getResponse<Response>();
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : 500;
    const exceptionResponse = exception instanceof HttpException
      ? exception.getResponse()
      : undefined;
    const detail = typeof exceptionResponse === 'object' && exceptionResponse
      ? exceptionResponse as Record<string, unknown>
      : {};
    const traceId = request.praxisTraceId ?? `trace_${randomUUID()}`;
    response.setHeader('X-Trace-Id', traceId);
    response.status(status).json({
      code: typeof detail.code === 'string'
        ? detail.code
        : this.codeFor(status),
      message: typeof detail.message === 'string'
        ? detail.message
        : 'Integration request failed.',
      retryable: status === 429 || status >= 500,
      traceId,
    });
  }

  private codeFor(status: number) {
    if (status === 400) return 'REQUEST_INVALID';
    if (status === 401) return 'SERVICE_AUTHENTICATION_FAILED';
    if (status === 403) return 'SERVICE_NOT_AUTHORIZED';
    if (status === 404) return 'RESOURCE_NOT_FOUND';
    if (status === 409) return 'VERSION_CONFLICT';
    if (status === 429) return 'RATE_LIMITED';
    return 'INTEGRATION_UNAVAILABLE';
  }
}
