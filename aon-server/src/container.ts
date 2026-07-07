/**
 * Composition Root (manual Dependency Injection)
 *
 * The single place where concrete implementations are chosen and wired together.
 * Everything else depends on interfaces and receives its collaborators through
 * constructors, so swapping an adapter or repository happens here and nowhere
 * else (Dependency Inversion in practice).
 */
import { GoogleAuthAdapter } from "./adapters/auth/GoogleAuthAdapter";
import { JwtTokenService } from "./adapters/auth/JwtTokenService";
import { CompoundDailyInterestCalculator } from "./domain/loans/InterestCalculator";
import { GameStrategyFactory } from "./domain/games/GameStrategyFactory";

import { MongoUserRepository } from "./repositories/UserRepository";
import { MongoTransactionRepository } from "./repositories/TransactionRepository";
import { MongoGameSessionRepository } from "./repositories/GameSessionRepository";
import { MongoLoanRepository } from "./repositories/LoanRepository";

import { AuthService } from "./services/AuthService";
import { GameService } from "./services/GameService";
import { WalletService } from "./services/WalletService";
import { LoanService } from "./services/LoanService";
import { LeaderboardService } from "./services/LeaderboardService";
import { BonusService } from "./services/BonusService";
import { ProfileService } from "./services/ProfileService";
import { TransactionService } from "./services/TransactionService";
import { PokerService } from "./services/PokerService";

import { SocketNotifier } from "./realtime/SocketNotifier";
import { PokerGateway } from "./realtime/poker/PokerGateway";

// --- Infrastructure / adapters ---
const identityProvider = new GoogleAuthAdapter();
const tokenService = new JwtTokenService();
const interestCalculator = new CompoundDailyInterestCalculator();
const gameStrategyFactory = new GameStrategyFactory();

// --- Repositories ---
const userRepository = new MongoUserRepository();
const transactionRepository = new MongoTransactionRepository();
const gameSessionRepository = new MongoGameSessionRepository();
const loanRepository = new MongoLoanRepository();

// --- Services ---
const leaderboardService = new LeaderboardService(
    userRepository,
    loanRepository,
    interestCalculator
);
const authService = new AuthService(identityProvider, tokenService, userRepository);
const gameService = new GameService(
    userRepository,
    gameSessionRepository,
    transactionRepository,
    gameStrategyFactory
);
const walletService = new WalletService(userRepository, transactionRepository);
const loanService = new LoanService(
    userRepository,
    loanRepository,
    transactionRepository,
    interestCalculator
);
const bonusService = new BonusService(userRepository, transactionRepository);
const profileService = new ProfileService(userRepository, transactionRepository);
const transactionService = new TransactionService(transactionRepository);
const pokerService = new PokerService();

// --- Realtime adapters ---
const socketNotifier = new SocketNotifier(leaderboardService); // Observer on the EventBus
const pokerGateway = new PokerGateway(pokerService); // Socket.IO transport for poker

export const container = {
    tokenService,
    authService,
    gameService,
    walletService,
    loanService,
    leaderboardService,
    bonusService,
    profileService,
    transactionService,
    pokerService,
    socketNotifier,
    pokerGateway,
};

export type Container = typeof container;
