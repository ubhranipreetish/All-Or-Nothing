import { NextFunction, Request, Response } from "express";

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/**
 * Wraps an async controller so any thrown/rejected error is forwarded to the
 * central error middleware. Keeps controllers free of repetitive try/catch.
 */
export const asyncHandler =
    (fn: AsyncRoute) => (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
