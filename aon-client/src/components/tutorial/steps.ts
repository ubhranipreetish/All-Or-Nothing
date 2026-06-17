import { TutorialStep } from "./useTutorial";

/**
 * Per-game walkthroughs. Each array follows that game's actual click-flow, and
 * the `highlight` ids must match the element ids rendered by the component.
 */

export const MINES_STEPS: TutorialStep[] = [
    {
        id: "welcome",
        title: "Welcome to Mines! 💎",
        message: "Reveal gems to grow your multiplier — but one mine ends the round. Let's walk through it.",
        action: "start-button",
        highlight: "",
    },
    {
        id: "bet-amount",
        title: "Step 1: Set your bet",
        message: "Type how much you want to wager. It's deducted from your wallet when the round starts.",
        action: "Click the Bet Amount field",
        highlight: "bet-amount-input",
    },
    {
        id: "half-double",
        title: "Quick adjust",
        message: "Use ½ and 2x to instantly halve or double your bet.",
        action: "Click the ½ button",
        highlight: "half-btn",
    },
    {
        id: "mine-count",
        title: "Step 2: Choose mines",
        message: "More mines means a higher multiplier but bigger risk. 3–5 is a comfortable start.",
        action: "Click the Mines field",
        highlight: "mine-count-input",
    },
    {
        id: "start-game",
        title: "Step 3: Place the bet",
        message: "Hit Bet to deal the board and begin revealing tiles.",
        action: "Click the Bet button",
        highlight: "bet-button",
    },
    {
        id: "reveal-tile",
        title: "Step 4: Reveal a tile",
        message: "Tap a tile to flip it. Gems 💎 are safe, mines 💣 are not. Try the glowing tile.",
        action: "Click the glowing tile",
        highlight: "tutorial-tile",
    },
    {
        id: "multiplier-info",
        title: "Step 5: Watch the multiplier",
        message: "Every safe gem lifts your multiplier and your cash-out value rises with it.",
        action: "Click the multiplier",
        highlight: "multiplier-capsule",
    },
    {
        id: "cashout",
        title: "Step 6: Cash out",
        message: "Bank your winnings any time. The longer you go, the more you risk — quit while ahead!",
        action: "Click Cash Out",
        highlight: "cashout-button",
    },
    {
        id: "complete",
        title: "You're ready! 🎉",
        message: "That's the whole loop: bet, reveal, cash out. Now try a real round — good luck!",
        action: "start-button",
        highlight: "",
    },
];

export const DRAGON_TOWER_STEPS: TutorialStep[] = [
    {
        id: "welcome",
        title: "Welcome to Dragon Tower! 🐉",
        message: "Climb the tower one row at a time. Pick safe tiles, dodge the dragon, and cash out high.",
        action: "start-button",
        highlight: "",
    },
    {
        id: "bet-amount",
        title: "Step 1: Set your bet",
        message: "Enter your wager. It's deducted from your wallet when you start climbing.",
        action: "Click the Bet Amount field",
        highlight: "amount2",
    },
    {
        id: "half-double",
        title: "Quick adjust",
        message: "Use ½ and 2x to quickly change your bet size.",
        action: "Click the ½ button",
        highlight: "half2",
    },
    {
        id: "difficulty",
        title: "Step 2: Pick difficulty",
        message: "Fewer safe tiles per row means a steeper multiplier — and a hungrier dragon. 🔥",
        action: "Click the Difficulty selector",
        highlight: "difficulty2",
    },
    {
        id: "start-game",
        title: "Step 3: Place the bet",
        message: "Hit Bet to build the tower and unlock the first row.",
        action: "Click the Bet button",
        highlight: "bet2",
    },
    {
        id: "climb",
        title: "Step 4: Climb a row",
        message: "Pick one tile in the active row. A coin 🪙 is safe and lets you climb higher. Try the glowing tile.",
        action: "Click the glowing tile",
        highlight: "tutorial-tile",
    },
    {
        id: "multiplier-info",
        title: "Step 5: Watch it grow",
        message: "Each safe row multiplies your payout. Your potential earnings climb with every step.",
        action: "Click the multiplier",
        highlight: "dt-multiplier",
    },
    {
        id: "cashout",
        title: "Step 6: Cash out",
        message: "Secure your winnings before the dragon catches you. Greed is how towers fall!",
        action: "Click Cash Out",
        highlight: "cashout",
    },
    {
        id: "complete",
        title: "You're ready! 🎉",
        message: "Bet, climb, cash out. Now scale a real tower — may the dragon stay asleep!",
        action: "start-button",
        highlight: "",
    },
];

export const WHEEL_STEPS: TutorialStep[] = [
    {
        id: "welcome",
        title: "Welcome to Fortune Wheel! 🎡",
        message: "Place a bet, spin once, and win whatever the pointer lands on. One spin decides it all.",
        action: "start-button",
        highlight: "",
    },
    {
        id: "bet-amount",
        title: "Step 1: Set your bet",
        message: "Enter your wager. It's deducted from your wallet the moment you spin.",
        action: "Click the Bet Amount field",
        highlight: "amount3",
    },
    {
        id: "half-double",
        title: "Quick adjust",
        message: "Use ½ and 2x to fine-tune your bet.",
        action: "Click the ½ button",
        highlight: "half3",
    },
    {
        id: "risk",
        title: "Step 2: Choose risk",
        message: "Higher risk shrinks the winning slices but boosts the payout. Pick your appetite.",
        action: "Click the Risk selector",
        highlight: "difficulty3",
    },
    {
        id: "segments",
        title: "Step 3: Choose segments",
        message: "More segments means more slices on the wheel — and a different spread of payouts.",
        action: "Click the Segments selector",
        highlight: "segments-count",
    },
    {
        id: "spin",
        title: "Step 4: Spin the wheel",
        message: "Hit Spin to send it flying. Watch where the pointer at the top lands.",
        action: "Click the Spin button",
        highlight: "bet3",
    },
    {
        id: "legend",
        title: "Step 5: Read the payouts",
        message: "These are the multipliers in play. The pointer's slice is multiplied by your bet.",
        action: "Click the multipliers",
        highlight: "multipliers-legend",
    },
    {
        id: "result-info",
        title: "Step 6: Land & win",
        message: "Land a multiplier and it's added to your wallet instantly. A 0.00x slice means you lose the bet.",
        action: "Got it",
        highlight: "",
    },
    {
        id: "complete",
        title: "You're ready! 🎉",
        message: "Bet, spin, collect. Give the real wheel a whirl — fortune favours the bold!",
        action: "start-button",
        highlight: "",
    },
];
