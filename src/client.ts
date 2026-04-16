import { getAuthConfig, type PaperclipAuth } from "./auth.js";
import { PaperclipApiError } from "./errors.js";

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 30_000;

export class PaperclipClient {
  private auth: PaperclipAuth;
  private fetchFn: FetchFn;
  private timeoutMs: number;

  constructor(auth?: PaperclipAuth, fetchFn?: FetchFn) {
    this.auth = auth ?? getAuthConfig();
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
    const envTimeout = process.env["PAPERCLIP_REQUEST_TIMEOUT_MS"];
    this.timeoutMs = envTimeout ? parseInt(envTimeout, 10) : DEFAULT_TIMEOUT_MS;
  }

  get companyId(): string {
    return this.auth.companyId;
  }

  get agentId(): string {
    return this.auth.agentId;
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
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "POST",
      headers: this.buildHeaders(runId),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.handleResponse<T>(response);
  }

  async patch<T>(path: string, body: unknown, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "PATCH",
      headers: this.buildHeaders(runId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body: unknown, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "PUT",
      headers: this.buildHeaders(runId),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.handleResponse<T>(response);
  }

  async postForm<T>(path: string, form: FormData, runId?: string): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.auth.apiKey}`,
    };
    const effectiveRunId = runId ?? this.auth.runId;
    if (effectiveRunId) {
      headers["X-Paperclip-Run-Id"] = effectiveRunId;
    }
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "POST",
      headers,
      body: form,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string, runId?: string): Promise<T> {
    const response = await this.fetchFn(`${this.auth.apiUrl}${path}`, {
      method: "DELETE",
      headers: this.buildHeaders(runId),
      signal: AbortSignal.timeout(this.timeoutMs),
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
