export class ConflictError extends Error {
  readonly clash: unknown;
  constructor({ message, clash }: { message: string; clash?: unknown }) {
    super(message);
    this.name = "ConflictError";
    this.clash = clash;
  }
}

export class ForbiddenError extends Error {
  constructor({ message }: { message: string }) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor({ message }: { message: string }) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor({ message }: { message: string }) {
    super(message);
    this.name = "ValidationError";
  }
}
