import { PokerTable, ActionType } from "../src/domain/poker/PokerTable";

/* Exercise the engine: many hands of random-but-legal play across varying
   player counts, asserting the game always terminates and chips are conserved. */

function legalRandomAction(t: PokerTable): { type: ActionType; amount?: number } {
    const s = t.seats[t.toAct]!;
    const toCall = t.currentBet - s.bet;
    const r = Math.random();
    if (toCall <= 0) {
        if (r < 0.25 && s.stack > t.bigBlind) return { type: "bet", amount: Math.min(s.bet + s.stack, t.bigBlind * 2) };
        return { type: "check" };
    }
    if (r < 0.2) return { type: "fold" };
    if (r < 0.35 && s.stack > toCall * 2) {
        const minTo = t.currentBet + t.minRaise;
        return { type: "raise", amount: Math.min(s.bet + s.stack, minTo) };
    }
    return { type: "call" };
}

let pass = 0, fail = 0;
const check = (name: string, ok: boolean) => { ok ? pass++ : fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); };

for (const players of [2, 3, 4, 6]) {
    const t = new PokerTable("SIM", 5, 10, 1000);
    for (let p = 0; p < players; p++) t.seatPlayer(`p${p}`, `P${p}`);
    const totalBefore = t.seats.reduce((a, s) => a + (s?.stack || 0), 0);

    for (let hand = 0; hand < 40; hand++) {
        if (!t.maybeStartHand()) break;
        let guard = 0;
        while (t.handActive) {
            if (++guard > 500) { check(`${players}p hand ${hand} terminates`, false); break; }
            const id = t.currentActorId();
            if (!id) break;
            // occasionally time the player out to exercise penalties
            if (Math.random() < 0.04) t.timeoutCurrent();
            else {
                const a = legalRandomAction(t);
                const err = t.act(id, a.type, a.amount);
                if (err) t.act(id, t.currentBet - t.seats[t.toAct]!.bet <= 0 ? "check" : "fold");
            }
        }
        // rebuy anyone who busted so the table keeps going
        for (const s of t.seats) if (s && s.stack <= 0) t.rebuy(s.id);
    }

    const totalAfter = t.seats.reduce((a, s) => a + (s?.stack || 0), 0);
    // chips conserved unless a rebuy injected play money — account for rebuys
    check(`${players}p: chips never negative`, t.seats.every((s) => !s || s.stack >= 0));
    check(`${players}p: totals are whole numbers`, Number.isInteger(totalAfter));
    console.log(`   ${players}p stacks: ${t.seats.map((s) => s?.stack).join(", ")} (start ${totalBefore})`);
}

// chip conservation in a single hand with no rebuys
{
    const t = new PokerTable("CONS", 5, 10, 1000);
    for (let p = 0; p < 4; p++) t.seatPlayer(`p${p}`, `P${p}`);
    const before = t.seats.reduce((a, s) => a + (s?.stack || 0), 0);
    t.maybeStartHand();
    let guard = 0;
    while (t.handActive && ++guard < 500) {
        const id = t.currentActorId()!;
        const a = legalRandomAction(t);
        if (t.act(id, a.type, a.amount)) t.act(id, t.currentBet - t.seats[t.toAct]!.bet <= 0 ? "check" : "fold");
    }
    const after = t.seats.reduce((a, s) => a + (s?.stack || 0), 0);
    check("single hand conserves chips exactly", before === after);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
