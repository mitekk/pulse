import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

/**
 * LoggingInterceptor — attaches a unique request ID to every incoming HTTP request
 * and logs method, url, status, and duration on completion.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<{
      method?: string;
      url?: string;
      id?: string;
      headers?: Record<string, string>;
    }>();

    // Attach a request ID — Fastify generates one via `genReqId`; fall back to our own.
    const requestId = (req.id as string) ?? randomUUID();
    req.id = requestId;

    const method = req.method ?? 'UNKNOWN';
    const url = req.url ?? '/';
    const start = Date.now();

    return next.handle().pipe(
      tap(() => {
        const res = http.getResponse<{ statusCode?: number }>();
        const status = res.statusCode ?? 200;
        const duration = Date.now() - start;
        this.logger.log(`[${requestId}] ${method} ${url} → ${status} (${duration}ms)`);
      }),
    );
  }
}
