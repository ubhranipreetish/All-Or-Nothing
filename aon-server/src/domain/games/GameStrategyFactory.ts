import {
    DragonTowerStrategy,
    GameStrategy,
    GameType,
    MinesStrategy,
    RouletteStrategy,
    WheelStrategy,
} from "./GameStrategy";

/**
 * GameStrategyFactory (Factory)
 *
 * Resolves a {@link GameStrategy} from a game type. Callers ask the factory for
 * "the rules for MINES" without knowing which concrete class implements them, so
 * the registry is the single place that maps types to strategies.
 */
export class GameStrategyFactory {
    private readonly registry = new Map<GameType, GameStrategy>([
        ["ROULETTE", new RouletteStrategy()],
        ["MINES", new MinesStrategy()],
        ["DRAGON_TOWER", new DragonTowerStrategy()],
        ["WHEEL", new WheelStrategy()],
    ]);

    /** Returns the strategy for a game type, or null if the type is unknown. */
    create(gameType: string): GameStrategy | null {
        return this.registry.get(gameType as GameType) ?? null;
    }

    isSupported(gameType: string): boolean {
        return this.registry.has(gameType as GameType);
    }
}
