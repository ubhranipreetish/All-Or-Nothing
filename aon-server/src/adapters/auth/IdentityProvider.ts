/** Normalized identity returned by any third-party login provider. */
export interface ExternalIdentity {
    providerId: string; // the provider's stable user id (Google `sub`)
    email: string;
    name?: string;
    avatar?: string;
}

/**
 * IdentityProvider (port for the Adapter pattern)
 *
 * The auth service depends on this small interface, not on Google's SDK. A
 * concrete adapter translates a provider's response into {@link ExternalIdentity},
 * so swapping or adding providers (GitHub, Apple, ...) never touches the service.
 */
export interface IdentityProvider {
    verify(token: string): Promise<ExternalIdentity | null>;
}
