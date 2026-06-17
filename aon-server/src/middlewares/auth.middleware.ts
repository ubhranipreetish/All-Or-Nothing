import { Request, Response, NextFunction } from "express";
import { TokenService } from "../adapters/auth/TokenService";
import { JwtTokenService } from "../adapters/auth/JwtTokenService";

/**
 * Auth guard. Depends on the {@link TokenService} abstraction rather than a JWT
 * library directly, so the signing/verification mechanism can change without
 * touching the middleware (Dependency Inversion).
 */
export const createProtect =
    (tokenService: TokenService) =>
    (req: Request, res: Response, next: NextFunction) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const token = authHeader.split(" ")[1];

        try {
            const { userId } = tokenService.verify(token);
            req.user = { userId };
            next();
        } catch {
            res.status(401).json({ message: "Invalid token" });
        }
    };

/** Default guard used by the routes, backed by the JWT adapter. */
export const protect = createProtect(new JwtTokenService());
