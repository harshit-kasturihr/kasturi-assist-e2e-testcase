import type { APIRequestContext } from '@playwright/test';

export class ApiClient {
  constructor(
    private request: APIRequestContext,
    private baseURL: string,
  ) {}

  private url(path: string): string {
    return `${this.baseURL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
  }

  async get(path: string) {
    return this.request.get(this.url(path));
  }

  async post(path: string, data?: unknown) {
    return this.request.post(this.url(path), { data });
  }

  async put(path: string, data?: unknown) {
    return this.request.put(this.url(path), { data });
  }

  async delete(path: string) {
    return this.request.delete(this.url(path));
  }
}
