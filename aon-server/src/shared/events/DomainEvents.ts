/**
 * Domain events published by the service layer.
 *
 * Services describe *what happened* in business terms and stay ignorant of who
 * reacts (Socket.IO today, an email/audit sink tomorrow). This is the contract
 * shared between publishers (services) and subscribers (the realtime notifier).
 */
export const DomainEvent = {
    WalletUpdated: "wallet.updated",
    TransactionRecorded: "transaction.recorded",
    LoansUpdated: "loans.updated",
    LeaderboardChanged: "leaderboard.changed",
} as const;

export interface WalletUpdatedPayload {
    userId: string;
    balance: number;
    totalEarnings: number;
}

export interface TransactionRecordedPayload {
    userId: string;
}

export interface LoansUpdatedPayload {
    userId: string;
}

export type LeaderboardChangedPayload = Record<string, never>;

/** Maps each event name to the shape of its payload (type-safe pub/sub). */
export interface DomainEventPayloads {
    [DomainEvent.WalletUpdated]: WalletUpdatedPayload;
    [DomainEvent.TransactionRecorded]: TransactionRecordedPayload;
    [DomainEvent.LoansUpdated]: LoansUpdatedPayload;
    [DomainEvent.LeaderboardChanged]: LeaderboardChangedPayload;
}

export type DomainEventName = keyof DomainEventPayloads;
