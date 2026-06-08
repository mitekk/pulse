import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { RedisService } from '../infra/redis/redis.service';

interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'ok' | 'error';
  redis: 'ok' | 'error';
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  async check(): Promise<HealthResponse> {
    const [dbStatus, redisStatus] = await Promise.all([this.checkDb(), this.redisService.ping()]);

    return {
      status: dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded',
      db: dbStatus,
      redis: redisStatus,
    };
  }

  private async checkDb(): Promise<'ok' | 'error'> {
    try {
      // Probe a core application table (not just `SELECT 1`) so a connected-but-
      // unmigrated database reports `error` instead of falsely "ok". LIMIT 0
      // returns no rows but still fails if the relation does not exist.
      await this.dataSource.query('SELECT 1 FROM users LIMIT 0');
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
