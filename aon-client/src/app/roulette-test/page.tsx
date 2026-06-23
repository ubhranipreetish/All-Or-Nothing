import Roulette from "../../components/Roulette";

/* Backend-free roulette: a local ₹5000 balance, no sign-in or server needed —
   spin freely to test the wheel, physics, payouts, and the table on any screen. */
export default function RouletteTestPage() {
    return <Roulette testMode />;
}
