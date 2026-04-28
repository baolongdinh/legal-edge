import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export interface CreditBalance {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  warning_level: 'none' | 'low' | 'critical';
}

export interface CreditPackage {
  id: string;
  name: string;
  price_vnd: number;
  credits: number;
  bonus_credits: number;
  total_credits: number;
  price_per_credit: number;
  savings_percent: number;
}

export interface CreditTransaction {
  id: string;
  amount: number;
  type: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export function useCredits() {
  const { user, getToken } = useAuth();
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-user-credits`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch credits');
      
      const data = await response.json();
      setBalance(data);
      setTransactions(data.recent_transactions || []);
    } catch (err) {
      console.error('[useCredits] Error fetching balance:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [user, getToken]);

  const fetchPackages = useCallback(async () => {
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-credit-packages`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch packages');
      
      const data = await response.json();
      setPackages(data.packages || []);
    } catch (err) {
      console.error('[useCredits] Error fetching packages:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    }
  }, [getToken]);

  const createCheckout = async (packageId: string, paymentMethod: 'vnpay' | 'momo') => {
    if (!user) throw new Error('Not authenticated');
    
    setLoading(true);
    try {
      const token = await getToken();
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-credit-checkout`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            package_id: packageId,
            payment_method: paymentMethod,
            return_url: `${window.location.origin}/payment/callback`,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout');
      }
      
      const data = await response.json();
      return data;
    } catch (err) {
      console.error('[useCredits] Error creating checkout:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  // Fetch balance on mount and when user changes
  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Fetch packages on mount
  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // Polling for balance updates (every 30 seconds)
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      fetchBalance();
    }, 30000);

    return () => clearInterval(interval);
  }, [user, fetchBalance]);

  return {
    balance,
    packages,
    transactions,
    loading,
    error,
    refreshBalance: fetchBalance,
    refreshPackages: fetchPackages,
    createCheckout,
  };
}
