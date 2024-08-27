import type * as Undici from 'undici';
import type { IncomingHttpHeaders } from 'undici/types/header.js';

export default class HttpResponse {
  constructor(
    public readonly statusCode: number,
    public readonly headers: Map<string, string | string[]>,
    public readonly body: Buffer
  ) {
    this.statusCode = statusCode;
    this.headers = headers;
    this.body = body;
  }

  get ok(): boolean {
    return this.statusCode >= 200 && this.statusCode < 300;
  }

  getHeader(key: string): string | null;
  getHeader(key: 'Set-Cookie'): string[] | null;
  getHeader(key: string): string | string[] | null {
    return this.headers.get(key.toLowerCase()) ?? null;
  }

  parseBodyAsText(): string {
    return this.body.toString('utf8');
  }

  parseBodyAsJson<T>(): T {
    return JSON.parse(this.parseBodyAsText());
  }

  static async fromUndiciResponse(response: Undici.Dispatcher.ResponseData): Promise<HttpResponse> {
    return new HttpResponse(
      response.statusCode,
      this.parseHeaders(response.headers),
      Buffer.from(await response.body.arrayBuffer())
    );
  }

  private static parseHeaders(headers: IncomingHttpHeaders): Map<string, string | string[]> {
    const parsedHeaders = new Map<string, string | string[]>();
    for (const [key, value] of Object.entries(headers)) {
      if (value != null) {
        parsedHeaders.set(key, value);
      }
    }
    return parsedHeaders;
  }
}
