import { TransactionRepository } from "../repositories/TransactionRepository";

/**
 * TransactionService
 *
 * Read-only access to a user's ledger with pagination. The repository runs the
 * query; this service shapes the pagination envelope the client expects.
 */
export class TransactionService {
    constructor(private readonly transactions: TransactionRepository) {}

    async getUserTransactions(userId: string, page: number, limit: number, type?: string) {
        const { transactions, total } = await this.transactions.findPaginated(
            userId,
            type,
            page,
            limit
        );

        const totalPages = Math.ceil(total / limit);

        return {
            transactions,
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNext: page < totalPages,
                hasPrev: page > 1,
            },
        };
    }
}
