import { LeaderboardService } from "../services/LeaderboardService";
import { DomainEvent } from "../shared/events/DomainEvents";
import { eventBus } from "../shared/events/EventBus";
import { socketServer } from "./SocketServer";

/**
 * SocketNotifier (Observer)
 *
 * The bridge between domain events and the websocket. It subscribes to the
 * EventBus and translates each business event into a Socket.IO emission. This is
 * the ONLY place that knows both "what happened" and "how clients are told",
 * which is why services no longer import the socket layer at all.
 *
 * Adding a second reaction to an event (audit log, push notification) means
 * adding another subscriber — never editing the services that publish.
 */
export class SocketNotifier {
    constructor(private readonly leaderboard: LeaderboardService) {}

    register(): void {
        eventBus.subscribe(DomainEvent.WalletUpdated, ({ userId, balance, totalEarnings }) => {
            socketServer.emitToUser(userId, "wallet-update", { balance, totalEarnings });
        });

        eventBus.subscribe(DomainEvent.TransactionRecorded, ({ userId }) => {
            socketServer.emitToUser(userId, "transactions-update");
        });

        eventBus.subscribe(DomainEvent.LoansUpdated, ({ userId }) => {
            socketServer.emitToUser(userId, "loans-update");
        });

        eventBus.subscribe(DomainEvent.LeaderboardChanged, async () => {
            const result = await this.leaderboard.getLeaderboard();
            socketServer.emitToAll("leaderboard-update", result);
        });
    }
}
