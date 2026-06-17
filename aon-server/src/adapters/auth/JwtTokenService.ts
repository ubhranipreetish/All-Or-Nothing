import jwt, { Secret, SignOptions } from "jsonwebtoken";
import { env } from "../../config/env";
import { TokenPayload, TokenService } from "./TokenService";

/**
 * JwtTokenService (Adapter)
 *
 * Implements {@link TokenService} on top of `jsonwebtoken`. The auth service and
 * the auth middleware depend on the interface, so the JWT library lives only here.
 */
export class JwtTokenService implements TokenService {
    private readonly secret: Secret = env.jwtSecret;
    private readonly signOptions: SignOptions = {
        expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"],
    };

    sign(payload: TokenPayload): string {
        return jwt.sign(payload, this.secret, this.signOptions);
    }

    verify(token: string): TokenPayload {
        const decoded = jwt.verify(token, this.secret) as { userId: string };
        return { userId: decoded.userId };
    }
}
