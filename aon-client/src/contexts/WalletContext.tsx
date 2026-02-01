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
  recordBet: (amount: number, gameType: string, gameId?: string) => Promise<boolean>;
  recordWin: (winAmount: number, betAmount: number, gameType: string, multiplier?: number, gameId?: string) => Promise<boolean>;
  claimWelcomeBonus: () => Promise<boolean>;
  takeLoan: (amount: number) => Promise<boolean>;
  repayLoan: (loanId: string) => Promise<boolean>;
  refreshWallet: () => Promise<void>;
  fetchLoans: () => Promise<void>;
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

  // Record a bet
  const recordBet = async (amount: number, gameType: string, gameId?: string): Promise<boolean> => {
    const token = getToken();
    if (!token) return deductMoney(amount);

    try {
      const res = await fetch(`${API_URL}/game/bet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount, gameType, gameId }),
      });

      const data = await res.json();
      if (res.ok) {
        setWallet(data.newBalance);
        return true;
      }
      console.error("Bet error:", data.message);
      return false;
    } catch (error) {
      console.error("Record bet error:", error);
      return false;
    }
  };

  // Record a win
  const recordWin = async (
    winAmount: number,
    betAmount: number,
    gameType: string,
    multiplier?: number,
    gameId?: string
  ): Promise<boolean> => {
    const token = getToken();
    if (!token) {
      setWallet((prev) => prev + winAmount);
      return true;
    }

    try {
      const res = await fetch(`${API_URL}/game/win`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ winAmount, betAmount, gameType, multiplier, gameId }),
      });

      const data = await res.json();
      if (res.ok) {
        setWallet(data.newBalance);
        setTotalEarnings(data.totalEarnings);
        return true;
      }
      console.error("Win error:", data.message);
      return false;
    } catch (error) {
      console.error("Record win error:", error);
      return false;
    }
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
        recordBet,
        recordWin,
        claimWelcomeBonus,
        takeLoan,
        repayLoan,
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
