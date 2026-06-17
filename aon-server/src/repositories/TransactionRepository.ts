import Transaction, { ITransaction } from "../models/Transaction.model";

export interface PaginatedTransactions {
    transactions: ITransaction[];
    total: number;
}

export interface BiggestWin {
    amount: number;
    gameType?: string;
    createdAt: Date;
    meta?: { multiplier?: number };
}

/**
 * TransactionRepository (Repository pattern)
 *
 * Append-only ledger access. Every balance-changing operation records a row
 * through `create`; reads cover the user's history and their biggest win.
 */
export interface TransactionRepository {
    create(data: Partial<ITransaction>): Promise<ITransaction>;
    findBiggestWin(userId: string): Promise<BiggestWin | null>;
    findPaginated(
        userId: string,
        type: string | undefined,
        page: number,
        limit: number
    ): Promise<PaginatedTransactions>;
}

export class MongoTransactionRepository implements TransactionRepository {
    create(data: Partial<ITransaction>) {
        return Transaction.create(data);
    }

    findBiggestWin(userId: string) {
        return Transaction.findOne({ userId, type: "WIN" })
            .sort({ amount: -1 })
            .select("amount gameType createdAt meta")
            .lean<BiggestWin>()
            .exec();
    }

    async findPaginated(
        userId: string,
        type: string | undefined,
        page: number,
        limit: number
    ): Promise<PaginatedTransactions> {
        const query: Record<string, unknown> = { userId };
        if (type && ["BET", "WIN", "DEPOSIT", "WITHDRAW"].includes(type.toUpperCase())) {
            query.type = type.toUpperCase();
        }

        const skip = (page - 1) * limit;

        const [transactions, total] = await Promise.all([
            Transaction.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean<ITransaction[]>()
                .exec(),
            Transaction.countDocuments(query).exec(),
        ]);

        return { transactions, total };
    }
}
