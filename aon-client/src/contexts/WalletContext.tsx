"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";

interface WalletContextType {
  wallet: number;
  totalEarnings: number;
  loading: boolean;
  hasClaimed100Bonus: boolean;
  addMoney: (amount: number) => Promise<boolean>;
  deductMoney: (amount: number) => boolean;
  recordBet: (amount: number, gameType: string, gameId?: string) => Promise<boolean>;
  recordWin: (winAmount: number, betAmount: number, gameType: string, multiplier?: number, gameId?: string) => Promise<boolean>;
  claimWelcomeBonus: () => Promise<boolean>;
  refreshWallet: () => Promise<void>;
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
  const [hasClaimed100Bonus, setHasClaimed100Bonus] = useState<boolean>(true); // Default true to hide until checked

  const getToken = () => localStorage.getItem("token");
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

  // Fetch wallet balance and bonus status from backend
  const refreshWallet = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      // Fetch wallet balance
      const walletRes = await fetch(`${API_URL}/wallet/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (walletRes.ok) {
        const data = await walletRes.json();
        setWallet(data.walletBalance ?? 0);
        setTotalEarnings(data.totalEarnings ?? 0);
      }

      // Fetch bonus status
      const bonusRes = await fetch(`${API_URL}/bonus/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (bonusRes.ok) {
        const bonusData = await bonusRes.json();
        setHasClaimed100Bonus(bonusData.hasClaimed100Bonus ?? false);
      }
    } catch (error) {
      console.error("Failed to fetch wallet:", error);
    }
  }, [API_URL]);

  // Sync wallet when user logs in
  useEffect(() => {
    if (user) {
      refreshWallet();
    } else {
      setWallet(0);
      setTotalEarnings(0);
      setHasClaimed100Bonus(true); // Hide banner for non-logged in
    }
  }, [user, refreshWallet]);

  // Add money (deposit)
  const addMoney = async (amount: number): Promise<boolean> => {
    if (isNaN(amount) || amount <= 0 || amount > 10000000) return false;

    const token = getToken();
    if (!token) {
      setWallet((prev) => prev + amount);
      return true;
    }

    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/wallet/deposit`, {
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
        return true;
      }
      console.error("Deposit failed:", data.message);
      return false;
    } catch (error) {
      console.error("Deposit error:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <WalletContext.Provider
      value={{
        wallet,
        totalEarnings,
        loading,
        hasClaimed100Bonus,
        addMoney,
        deductMoney,
        recordBet,
        recordWin,
        claimWelcomeBonus,
        refreshWallet,
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
