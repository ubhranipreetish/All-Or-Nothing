"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";

interface Loan {
  _id: string;
  amount: number;
  status: "ACTIVE" | "REPAID";
  createdAt: string;
  repaymentAmount?: number;
  interestDays?: number;
  interestRate?: number;
}

interface WalletContextType {
  wallet: number;
  totalEarnings: number;
  loading: boolean;
  hasClaimed100Bonus: boolean;
  activeLoans: Loan[];
  activeLoansCount: number;
  canTakeLoan: boolean;
  deductMoney: (amount: number) => boolean;
  startGameSession: (amount: number, gameType: string, gameConfig?: any) => Promise<{ success: boolean; sessionId?: string; newBalance?: number }>;
  // Server-authoritative play — the client only names its choice; the server owns
  // the board/number and returns the outcome. No client-supplied amounts.
  minesReveal: (sessionId: string, tileIndex: number) => Promise<MinesRevealResult | null>;
  dragonReveal: (sessionId: string, tileIndex: number) => Promise<DragonRevealResult | null>;
  wheelSpin: (sessionId: string) => Promise<SpinResult | null>;
  rouletteSpin: (sessionId: string, bets: { key: string; amount: number }[]) => Promise<RouletteResult | null>;
  cashOutGame: (sessionId: string) => Promise<{ winAmount: number; newBalance: number } | null>;
  claimWelcomeBonus: () => Promise<boolean>;
  takeLoan: (amount: number) => Promise<boolean>;
  repayLoan: (loanId: string) => Promise<boolean>;
  recordLoss: (sessionId: string) => Promise<boolean>;
  refundBet: (gameType: string, sessionId?: string) => Promise<boolean>;
  refreshWallet: () => Promise<void>;
  fetchLoans: () => Promise<void>;
}

export interface MinesRevealResult {
  hit: boolean;
  tileIndex: number;
  multiplier?: number;
  safeReveals?: number;
  potentialWin?: number;
  mines?: number[]; // present only when hit — the full board reveal
  gemsRevealed?: number[];
}
export interface DragonRevealResult {
  hit: boolean;
  tileIndex: number;
  floor?: number;
  multiplier?: number;
  potentialWin?: number;
  maxed?: boolean;
  dragons?: number[]; // present only when hit
}
export interface SpinResult {
  index: number;
  multiplier: number;
  payout: number;
  newBalance: number;
}
export interface RouletteResult {
  index: number;
  number: number;
  won: number;
  newBalance: number;
}

const WalletContext = createContext<WalletContextType | null>(null);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<number>(0);
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const [hasClaimed100Bonus, setHasClaimed100Bonus] = useState<boolean>(true);
  const [activeLoans, setActiveLoans] = useState<Loan[]>([]);
  const [canTakeLoan, setCanTakeLoan] = useState<boolean>(true);

  const getToken = () => localStorage.getItem("token");
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

  // Fetch active loans
  const fetchLoans = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/loan/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        const data = await res.json();
        setActiveLoans(data.loans || []);
        setCanTakeLoan(data.canTakeLoan ?? true);
      }
    } catch (error) {
      console.error("Failed to fetch loans:", error);
    }
  }, [API_URL]);

  // Fetch wallet balance and bonus status
  const refreshWallet = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      const walletRes = await fetch(`${API_URL}/wallet/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (walletRes.ok) {
        const data = await walletRes.json();
        setWallet(data.walletBalance ?? 0);
        setTotalEarnings(data.totalEarnings ?? 0);
      }

      const bonusRes = await fetch(`${API_URL}/bonus/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (bonusRes.ok) {
        const bonusData = await bonusRes.json();
        setHasClaimed100Bonus(bonusData.hasClaimed100Bonus ?? false);
      }

      // Also fetch loans
      await fetchLoans();
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
    }
  }, [API_URL, fetchLoans]);

  // Sync wallet when user logs in
  useEffect(() => {
    if (user) {
      refreshWallet();
    } else {
      setWallet(0);
      setTotalEarnings(0);
      setHasClaimed100Bonus(true);
      setActiveLoans([]);
      setCanTakeLoan(true);
    }
  }, [user, refreshWallet]);

  // Deduct money (local)
  const deductMoney = (amount: number): boolean => {
    if (isNaN(amount) || amount <= 0 || wallet < amount) return false;
    setWallet((prev) => prev - amount);
    return true;
  };

  // Authenticated POST helper for game endpoints.
  const gamePost = async (path: string, body: unknown): Promise<any | null> => {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(`${path} error:`, data?.message);
        return null;
      }
      return data;
    } catch (error) {
      console.error(`${path} request failed:`, error);
      return null;
    }
  };

  // Start a game session (New persistent way)
  const startGameSession = async (amount: number, gameType: string, gameConfig?: any): Promise<{ success: boolean; sessionId?: string; newBalance?: number }> => {
    const token = getToken();
    if (!token) {
      if (deductMoney(amount)) {
        return { success: true };
      }
      return { success: false };
    }

    const attemptStart = async () => {
      const res = await fetch(`${API_URL}/game/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, gameType, gameConfig }),
      });
      const data = await res.json();
      return { res, data };
    };

    try {
      let { res, data } = await attemptStart();

      // Self-heal: a previous round of this game never settled (e.g. the loss
      // call was still in flight when the player clicked Place Bet again). The
      // server returns the stuck session's id — forfeit it and retry once so the
      // player is never blocked from betting.
      if (!res.ok && data?.sessionId && /active game session/i.test(data?.message || "")) {
        await fetch(`${API_URL}/game/lose`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sessionId: data.sessionId }),
        });
        ({ res, data } = await attemptStart());
      }

      if (res.ok) {
        setWallet(data.newBalance);
        if (typeof data.totalEarnings === "number") setTotalEarnings(data.totalEarnings);
        return { success: true, sessionId: data.sessionId, newBalance: data.newBalance };
      }
      console.error("Start game error:", data.message);
      return { success: false };
    } catch (error) {
      console.error("Start game session error:", error);
      return { success: false };
    }
  };

  // Reveal one Mines tile — the server checks its own board.
  const minesReveal = async (sessionId: string, tileIndex: number): Promise<MinesRevealResult | null> => {
    return gamePost("/game/mines/reveal", { sessionId, tileIndex });
  };

  // Pick one Dragon Tower tile on the current floor.
  const dragonReveal = async (sessionId: string, tileIndex: number): Promise<DragonRevealResult | null> => {
    return gamePost("/game/dragon/reveal", { sessionId, tileIndex });
  };

  // Spin the wheel — server picks the segment and settles.
  const wheelSpin = async (sessionId: string): Promise<SpinResult | null> => {
    const data = await gamePost("/game/wheel/spin", { sessionId });
    if (data && typeof data.newBalance === "number") setWallet(data.newBalance);
    return data;
  };

  // Spin roulette — server picks the number and prices the bets by key.
  const rouletteSpin = async (
    sessionId: string,
    bets: { key: string; amount: number }[]
  ): Promise<RouletteResult | null> => {
    const data = await gamePost("/game/roulette/spin", { sessionId, bets });
    if (data && typeof data.newBalance === "number") setWallet(data.newBalance);
    return data;
  };

  // Cash out a Mines / Dragon Tower session at the SERVER-tracked multiplier.
  const cashOutGame = async (sessionId: string): Promise<{ winAmount: number; newBalance: number } | null> => {
    const data = await gamePost("/game/cashout", { sessionId });
    if (data && typeof data.newBalance === "number") {
      setWallet(data.newBalance);
      if (typeof data.totalEarnings === "number") setTotalEarnings(data.totalEarnings);
    }
    return data;
  };

  // Claim welcome bonus
  const claimWelcomeBonus = async (): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/bonus/claim-welcome`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setWallet(data.newBalance);
        setHasClaimed100Bonus(true);
        return true;
      }
      console.error("Claim bonus error:", data.message);
      return false;
    } catch (error) {
      console.error("Claim bonus error:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Take a loan
  const takeLoan = async (amount: number): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/loan/take`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount }),
      });

      const data = await res.json();
      if (res.ok) {
        setWallet(data.newBalance);
        setTotalEarnings(data.totalEarnings);
        await fetchLoans();
        return true;
      }
      console.error("Take loan error:", data.message);
      return false;
    } catch (error) {
      console.error("Take loan error:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Repay a loan
  const repayLoan = async (loanId: string): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/loan/repay/${loanId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setWallet(data.newBalance);
        setTotalEarnings(data.totalEarnings);
        await fetchLoans();
        return true;
      }
      console.error("Repay loan error:", data.message);
      return false;
    } catch (error) {
      console.error("Repay loan error:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Refund an unplayed stake (e.g. leaving a poker waiting room before the game starts)
  const refundBet = async (gameType: string, sessionId?: string): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;

    try {
      const res = await fetch(`${API_URL}/game/refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gameType, sessionId }),
      });

      const data = await res.json();
      if (res.ok) {
        setWallet(data.newBalance);
        if (typeof data.totalEarnings === "number") setTotalEarnings(data.totalEarnings);
        return true;
      }
      console.error("Refund error:", data.message);
      return false;
    } catch (error) {
      console.error("Refund bet error:", error);
      return false;
    }
  };

  // Record a loss (End Game)
  const recordLoss = async (sessionId: string): Promise<boolean> => {
    const token = getToken();
    if (!token) return true; // Local play doesn't need API call

    try {
      const res = await fetch(`${API_URL}/game/lose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ sessionId }),
      });

      if (res.ok) {
        return true;
      }
      const data = await res.json();
      console.error("Record loss error:", data.message);
      return false;
    } catch (error) {
      console.error("Record loss error:", error);
      return false;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        totalEarnings,
        loading,
        hasClaimed100Bonus,
        activeLoans,
        activeLoansCount: activeLoans.length,
        canTakeLoan,
        deductMoney,
        startGameSession,
        minesReveal,
        dragonReveal,
        wheelSpin,
        rouletteSpin,
        cashOutGame,
        claimWelcomeBonus,
        takeLoan,
        repayLoan,
        recordLoss,
        refundBet,
        refreshWallet,
        fetchLoans,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextType {
  const context = useContext(WalletContext);
  if (context === null) {
    throw new Error("useWallet must be used within a WalletProvider");
  }
  return context;
}
