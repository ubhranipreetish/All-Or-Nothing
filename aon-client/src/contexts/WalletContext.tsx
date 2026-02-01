"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useAuth } from "./AuthContext";

interface WalletContextType {
  wallet: number;
  totalEarnings: number;
  loading: boolean;
  addMoney: (amount: number) => Promise<boolean>;
  deductMoney: (amount: number) => boolean;
  recordBet: (amount: number, gameType: string, gameId?: string) => Promise<boolean>;
  recordWin: (winAmount: number, betAmount: number, gameType: string, multiplier?: number, gameId?: string) => Promise<boolean>;
  refreshWallet: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | null>(null);

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<number>(0); // Start with 0, will sync from backend
  const [totalEarnings, setTotalEarnings] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const getToken = () => localStorage.getItem("token");
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5001/api";

  // Fetch wallet balance from backend
  const refreshWallet = useCallback(async () => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_URL}/wallet/balance`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        setWallet(data.walletBalance ?? 0);
        setTotalEarnings(data.totalEarnings ?? 0);
      } else {
        console.error("Failed to fetch wallet:", res.status, await res.text());
      }
    } catch (error) {
      console.error("Failed to fetch wallet balance:", error);
    }
  }, [API_URL]);

  // Sync wallet when user logs in
  useEffect(() => {
    if (user) {
      refreshWallet();
    } else {
      // Reset for non-logged in users
      setWallet(0);
      setTotalEarnings(0);
    }
  }, [user, refreshWallet]);

  // Add money (deposit) - calls backend API
  const addMoney = async (amount: number): Promise<boolean> => {
    if (isNaN(amount) || amount <= 0 || amount > 10000000) {
      console.error("Invalid amount:", amount);
      return false;
    }

    const token = getToken();

    // If not logged in, use local state
    if (!token) {
      setWallet((prev) => prev + amount);
      return true;
    }

    try {
      setLoading(true);
      console.log("Depositing:", amount, "to", `${API_URL}/wallet/deposit`);

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
        console.log("Deposit success, new balance:", data.newBalance);
        return true;
      } else {
        console.error("Deposit failed:", data.message || data);
        return false;
      }
    } catch (error) {
      console.error("Deposit error:", error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Deduct money (local only - for immediate UI feedback before bet is recorded)
  const deductMoney = (amount: number): boolean => {
    if (isNaN(amount) || amount <= 0) {
      return false;
    }
    if (wallet >= amount) {
      setWallet((prev) => prev - amount);
      return true;
    }
    return false;
  };

  // Record a bet - calls backend API
  const recordBet = async (amount: number, gameType: string, gameId?: string): Promise<boolean> => {
    const token = getToken();

    // If not logged in, just use local deduction
    if (!token) {
      return deductMoney(amount);
    }

    try {
      console.log("Recording bet:", { amount, gameType }, "to", `${API_URL}/game/bet`);

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
        console.log("Bet recorded, new balance:", data.newBalance);
        return true;
      } else {
        console.error("Bet error:", data.message || data);
        return false;
      }
    } catch (error) {
      console.error("Record bet error:", error);
      return false;
    }
  };

  // Record a win - calls backend API
  const recordWin = async (
    winAmount: number,
    betAmount: number,
    gameType: string,
    multiplier?: number,
    gameId?: string
  ): Promise<boolean> => {
    const token = getToken();

    // If not logged in, just add locally
    if (!token) {
      setWallet((prev) => prev + winAmount);
      return true;
    }

    try {
      console.log("Recording win:", { winAmount, betAmount, gameType, multiplier });

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
        console.log("Win recorded, new balance:", data.newBalance);
        return true;
      } else {
        console.error("Win error:", data.message || data);
        return false;
      }
    } catch (error) {
      console.error("Record win error:", error);
      return false;
    }
  };

  return (
    <WalletContext.Provider
      value={{
        wallet,
        totalEarnings,
        loading,
        addMoney,
        deductMoney,
        recordBet,
        recordWin,
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
