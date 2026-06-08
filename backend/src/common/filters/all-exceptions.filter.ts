import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

interface ErrorDetail {
  field?: string;
  message: string;
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
}

/**
 * Global exception filter that maps all errors to the standard error envelope:
 * { "error": { "code": "SCREAMING_SNAKE_CASE", "message": "...", "details": [...] } }
 *
 * Never leaks stack traces, DB error details, or internal paths to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.httpAdapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ url?: string; id?: string }>();

    const requestId = request.id ?? 'unknown';
    const requestUrl = request.url ?? 'unknown';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: ErrorDetail[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();

      if (typeof response === 'string') {
        message = response;
        code = this.statusToCode(status);
      } else if (typeof response === 'object' && response !== null) {
        const resp = response as Record<string, unknown>;

        // Services throw the pre-built envelope `{ error: { code, message, details } }`.
        // Honor it directly so the specific code/message survive to the client
        // instead of being flattened to a generic status-derived error.
        const envelope = resp['error'];
        if (typeof envelope === 'object' && envelope !== null && 'code' in envelope) {
          const err = envelope as Partial<ErrorEnvelope['error']>;
          code = typeof err.code === 'string' ? err.code : this.statusToCode(status);
          message = typeof err.message === 'string' ? err.message : message;
          details = Array.isArray(err.details) ? err.details : undefined;
        } else {
          message = typeof resp['message'] === 'string' ? resp['message'] : message;
          code =
            typeof resp['error'] === 'string'
              ? this.toScreamingSnake(resp['error'])
              : this.statusToCode(status);

          // class-validator ValidationPipe produces an array of constraint messages
          if (Array.isArray(resp['message'])) {
            details = (resp['message'] as string[]).map((msg) => ({ message: msg }));
            message = 'Validation failed';
            code = 'VALIDATION_ERROR';
          }
        }
      }
    } else if (this.isInvalidInputDbError(exception)) {
      // Malformed input that reached the DB (e.g. a non-numeric value for a
      // bigint id column → PG 22P02 / 22003). This is a client error, not a
      // server fault — surface 400 without leaking the DB message.
      status = HttpStatus.BAD_REQUEST;
      code = 'INVALID_INPUT';
      message = 'Invalid request parameter.';
    } else {
      // Programmer error — log with full detail but don't expose to client
      this.logger.error(
        `Unhandled exception [requestId=${requestId}] [url=${requestUrl}]`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // Log operational errors at warn level for observability without noise
    if (status < 500) {
      this.logger.warn(`[${requestId}] ${status} ${requestUrl} — ${code}: ${message}`);
    } else {
      this.logger.error(`[${requestId}] ${status} ${requestUrl} — ${code}: ${message}`);
    }

    const body: ErrorEnvelope = {
      error: {
        code,
        message,
        ...(details && details.length > 0 ? { details } : {}),
      },
    };

    httpAdapter.reply(ctx.getResponse(), body, status);
  }

  /**
   * Detects TypeORM/pg errors caused by malformed client input that reached the
   * database — invalid text for a typed column (22P02, e.g. non-numeric bigint id)
   * or numeric out of range (22003). These are 400s, not 500s.
   */
  private isInvalidInputDbError(exception: unknown): boolean {
    const code = (exception as { code?: unknown })?.code;
    const driverCode = (exception as { driverError?: { code?: unknown } })?.driverError?.code;
    return code === '22P02' || code === '22003' || driverCode === '22P02' || driverCode === '22003';
  }

  private statusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      405: 'METHOD_NOT_ALLOWED',
      409: 'CONFLICT',
      410: 'GONE',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? 'HTTP_ERROR';
  }

  private toScreamingSnake(str: string): string {
    return str.replace(/\s+/g, '_').toUpperCase();
  }
}
