import { Controller, Get, Headers, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { SeoService } from './seo.service';

/**
 * SeoController — crawler-facing endpoints.
 *
 *   GET /api/v1/seo/prerender   ← nginx routes bot requests for public content
 *                                 routes here (X-Original-URI carries the path)
 *   GET /api/v1/seo/sitemap.xml ← nginx maps /sitemap.xml here
 *   GET /api/v1/seo/robots.txt  ← nginx maps /robots.txt here
 *
 * No auth guard: these are public by design and only ever reached via nginx.
 */
@Controller('seo')
export class SeoController {
  constructor(private readonly seoService: SeoService) {}

  private baseUrl(
    proto: string | undefined,
    fwdHost: string | undefined,
    host: string | undefined,
  ): string {
    const scheme = (proto ?? 'http').split(',')[0].trim() || 'http';
    const h = (fwdHost ?? host ?? 'localhost').split(',')[0].trim() || 'localhost';
    return `${scheme}://${h}`;
  }

  @Get('prerender')
  async prerender(
    @Headers('x-original-uri') originalUri: string | undefined,
    @Headers('x-forwarded-proto') proto: string | undefined,
    @Headers('x-forwarded-host') fwdHost: string | undefined,
    @Headers('host') host: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const baseUrl = this.baseUrl(proto, fwdHost, host);
    const { html, status } = await this.seoService.renderPath(originalUri ?? '/', baseUrl);
    void reply.status(status).type('text/html; charset=utf-8');
    return html;
  }

  @Get('sitemap.xml')
  async sitemap(
    @Headers('x-forwarded-proto') proto: string | undefined,
    @Headers('x-forwarded-host') fwdHost: string | undefined,
    @Headers('host') host: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const baseUrl = this.baseUrl(proto, fwdHost, host);
    const xml = await this.seoService.buildSitemap(baseUrl);
    void reply.type('application/xml; charset=utf-8');
    return xml;
  }

  @Get('robots.txt')
  robots(
    @Headers('x-forwarded-proto') proto: string | undefined,
    @Headers('x-forwarded-host') fwdHost: string | undefined,
    @Headers('host') host: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): string {
    const baseUrl = this.baseUrl(proto, fwdHost, host);
    void reply.type('text/plain; charset=utf-8');
    return this.seoService.buildRobots(baseUrl);
  }
}
