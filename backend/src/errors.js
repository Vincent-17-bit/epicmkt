export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
    this.status = 404;
  }
}

export class ValidationError extends Error {
  constructor(message = "Invalid input", fields = {}) {
    super(message);
    this.name = "ValidationError";
    this.status = 422;
    this.fields = fields;
  }
}
