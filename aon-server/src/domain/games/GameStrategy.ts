export type GameType = "ROULETTE" | "MINES" | "DRAGON_TOWER" | "WHEEL" | "POKER";

/**
 * GameStrategy (Strategy)
 *
 * Per-game rules behind one interface. The game service runs the same flow
 * (bet -> track multiplier -> settle) for every game and delegates the parts
 * that differ to a strategy. Adding a new game means adding a strategy class and
 * registering it in the factory — no service code changes (Open/Closed).
 *
 * The bounds below match the limits the original controllers enforced; keeping
 * them on the strategy makes per-game tuning a one-line override later.
 */
export interface GameStrategy {
    readonly gameType: GameType;
    /** Lower/upper bound for a live multiplier update during play. */
    readonly minMultiplier: number;
    readonly maxMultiplier: number;
    /** Hard ceiling used to reject suspicious win claims (anti-cheat). */
    readonly maxWinMultiplier: number;
}

/** Shared defaults; individual games override only what differs from the base. */
abstract class BaseGameStrategy implements GameStrategy {
    abstract readonly gameType: GameType;
    readonly minMultiplier = 1;
    readonly maxMultiplier = 1000;
    readonly maxWinMultiplier = 100000;
}

export class RouletteStrategy extends BaseGameStrategy {
    readonly gameType = "ROULETTE" as const;
}

export class MinesStrategy extends BaseGameStrategy {
    readonly gameType = "MINES" as const;
}

export class DragonTowerStrategy extends BaseGameStrategy {
    readonly gameType = "DRAGON_TOWER" as const;
}

export class WheelStrategy extends BaseGameStrategy {
    readonly gameType = "WHEEL" as const;
}
