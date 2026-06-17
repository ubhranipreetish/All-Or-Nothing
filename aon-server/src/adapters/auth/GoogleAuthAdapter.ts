import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env";
import { ExternalIdentity, IdentityProvider } from "./IdentityProvider";

/**
 * GoogleAuthAdapter (Adapter)
 *
 * Adapts the `google-auth-library` SDK to our {@link IdentityProvider} port. It
 * verifies a Google ID token and maps Google's payload shape (`sub`, `picture`)
 * onto our neutral {@link ExternalIdentity}, isolating the SDK to this one file.
 */
export class GoogleAuthAdapter implements IdentityProvider {
    private readonly client = new OAuth2Client(env.googleClientId);

    async verify(token: string): Promise<ExternalIdentity | null> {
        const ticket = await this.client.verifyIdToken({
            idToken: token,
            audience: env.googleClientId,
        });

        const payload = ticket.getPayload();
        if (!payload) return null;

        return {
            providerId: payload.sub,
            email: payload.email ?? "",
            name: payload.name,
            avatar: payload.picture,
        };
    }
}
