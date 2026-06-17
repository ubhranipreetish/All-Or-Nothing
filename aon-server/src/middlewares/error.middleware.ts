import { NextFunction, Request, Response } from "express";
import { AppError } from "../shared/errors/AppError";

/**
 * Central error handler — the single place that turns errors into HTTP responses.
 *
 * Expected, business errors ({@link AppError}) carry their own status code and
 * optional payload fields. Anything else is an unexpected failure and becomes a
 * generic 500, with the real error logged server-side.
 */
export const errorHandler = (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
) => {
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ message: err.message, ...err.payload });
    }

    console.error(err);
    res.status(500).json({ message: "Internal Server Error" });
};
