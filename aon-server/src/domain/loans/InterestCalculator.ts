export interface RepaymentBreakdown {
    /** Total amount owed (principal + compounded interest). */
    amount: number;
    /** Number of compounding days counted (day 1 = the day the loan was taken). */
    days: number;
}

/**
 * InterestCalculator (Strategy)
 *
 * Encapsulates the loan interest formula behind one interface, so the policy can
 * be swapped (flat, tiered, ...) without touching callers. This replaces the
 * identical `calculateRepaymentAmount` that was copy-pasted into the loan
 * controller, the leaderboard controller, and the socket module.
 */
export interface InterestCalculator {
    /** The daily interest rate expressed as a percentage (e.g. 10). */
    readonly ratePercent: number;
    /** Raw owed amount, unrounded — used for leaderboard net-worth math. */
    computeRaw(principal: number, loanDate: Date): RepaymentBreakdown;
    /** Owed amount rounded up to the nearest paisa — used for actual repayment. */
    compute(principal: number, loanDate: Date): RepaymentBreakdown;
}

/**
 * Compound daily interest: P * (1 + r)^days.
 * Day 1 starts the moment the loan is taken (immediate first-day interest);
 * every midnight crossed adds another compounding day.
 */
export class CompoundDailyInterestCalculator implements InterestCalculator {
    constructor(private readonly dailyRate = 0.1) {}

    get ratePercent(): number {
        return this.dailyRate * 100;
    }

    computeRaw(principal: number, loanDate: Date): RepaymentBreakdown {
        const now = new Date();

        const startOfLoanDay = new Date(loanDate);
        startOfLoanDay.setHours(0, 0, 0, 0);

        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        const daysDiff = Math.floor(
            (startOfToday.getTime() - startOfLoanDay.getTime()) / (1000 * 60 * 60 * 24)
        );
        const totalDays = daysDiff + 1;

        const amount = principal * Math.pow(1 + this.dailyRate, totalDays);
        return { amount, days: totalDays };
    }

    compute(principal: number, loanDate: Date): RepaymentBreakdown {
        const { amount, days } = this.computeRaw(principal, loanDate);
        // Round up to the nearest paisa.
        return { amount: Math.ceil(amount * 100) / 100, days };
    }
}
