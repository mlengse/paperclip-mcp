export class PaperclipApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body: unknown,
    message?: string
  ) {
    super(message ?? `Paperclip API error ${status}: ${statusText}`);
    this.name = "PaperclipApiError";
  }
}
