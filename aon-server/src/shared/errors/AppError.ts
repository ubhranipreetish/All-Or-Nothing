/**
 * AppError
 *
 * A domain/HTTP error that services throw instead of touching `res`. The HTTP
 * layer (error middleware) is the only place that knows how to turn one into a
 * response, keeping business logic free of transport concerns (SRP).
 *
 * `payload` is merged into the JSON body alongside `message`, which lets us
 * reproduce the existing responses that carry extra fields (e.g. an insufficient
 * balance error returning `required`, `available`, ...).
 */
export class AppError extends Error {
    readonly statusCode: number;
    readonly payload: Record<string, unknown>;

    constructor(statusCode: number, message: string, payload: Record<string, unknown> = {}) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.payload = payload;
        Object.setPrototypeOf(this, AppError.prototype);
    }

    static unauthorized(message = "Unauthorized") {
        return new AppError(401, message);
    }

    static badRequest(message: string, payload: Record<string, unknown> = {}) {
        return new AppError(400, message, payload);
    }

    static notFound(message: string) {
        return new AppError(404, message);
    }
}
