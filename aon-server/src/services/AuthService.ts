import { IdentityProvider } from "../adapters/auth/IdentityProvider";
import { TokenService } from "../adapters/auth/TokenService";
import { UserRepository } from "../repositories/UserRepository";
import { AppError } from "../shared/errors/AppError";

export interface AuthResult {
    token: string;
    user: {
        id: unknown;
        email: string;
        name?: string;
        avatar?: string;
    };
}

/**
 * AuthService
 *
 * Login-with-provider use case. It depends only on the {@link IdentityProvider}
 * and {@link TokenService} ports, so neither Google's SDK nor JWT appears here —
 * the concrete adapters are injected (Dependency Inversion).
 */
export class AuthService {
    constructor(
        private readonly identityProvider: IdentityProvider,
        private readonly tokenService: TokenService,
        private readonly users: UserRepository
    ) {}

    async loginWithGoogle(token: string | undefined): Promise<AuthResult> {
        if (!token) {
            throw AppError.badRequest("Google token missing");
        }

        const identity = await this.identityProvider.verify(token);
        if (!identity) {
            throw AppError.unauthorized("Invalid Google token");
        }

        let user = await this.users.findByGoogleId(identity.providerId);
        if (!user) {
            user = await this.users.create({
                googleId: identity.providerId,
                email: identity.email,
                name: identity.name,
                avatar: identity.avatar,
            });
        }

        const jwtToken = this.tokenService.sign({ userId: String(user._id) });

        return {
            token: jwtToken,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
            },
        };
    }
}
