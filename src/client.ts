import { getAuthConfig, type PaperclipAuth } from "./auth.js";
import { PaperclipApiError } from "./errors.js";

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

export class PaperclipClient {
  private auth: PaperclipAuth;
  private fetchFn: FetchFn;

  constructor(auth?: PaperclipAuth, fetchFn?: FetchFn) {
    this.auth = auth ?? getAuthConfig();
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
  }

  get companyId(): string {
    return this.auth.companyId;
  }

  buildHeaders(runId?: string): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.auth.apiKey}`,
      "Content-Type": "application/json",
    };
    const effectiveRunId = runId ?? this.auth.runId;
    if (effectiveRunId) {
      headers["X-Paperclip-Run-Id"] = effectiveRunId;
    }
    return headers;
  }

  async get<T>(path: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "GET",
      headers: this.buildHeaders(),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "POST",
      headers: this.buildHeaders(runId),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "PATCH",
      headers: this.buildHeaders(runId),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body: unknown, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "PUT",
      headers: this.buildHeaders(runId),
      body: JSON.stringify(body),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "DELETE",
      headers: this.buildHeaders(runId),
    });
    return this.handleResponse<T>(response);
  }

  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
      throw new PaperclipApiError(response.status, response.statusText, body);
    }
    if (response.status === 204 || response.headers.get("content-length") === "0") {
      return undefined as T;
    }
    return response.json() as Promise<T>;
  }
}
