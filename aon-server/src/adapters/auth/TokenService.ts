export interface TokenPayload {
    userId: string;
}

/**
 * TokenService (port for the Adapter pattern)
 *
 * Abstracts session-token signing/verification so callers don't depend on a
 * specific library. {@link JwtTokenService} is the JWT-backed implementation.
 */
export interface TokenService {
    sign(payload: TokenPayload): string;
    verify(token: string): TokenPayload;
}
