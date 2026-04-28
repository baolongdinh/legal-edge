import { useState } from 'react';
import { Coins, AlertTriangle, AlertCircle, ChevronDown, Wallet, History, Package } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';

interface CreditBadgeProps {
  showDropdown?: boolean;
}

export function CreditBadge({ showDropdown = true }: CreditBadgeProps) {
  const { balance, loading } = useCredits();
  const [isOpen, setIsOpen] = useState(false);

  const getWarningColor = () => {
    if (!balance) return 'bg-gray-100 text-gray-600';
    switch (balance.warning_level) {
      case 'critical':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'low':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      default:
        return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  const getWarningIcon = () => {
    if (!balance) return null;
    switch (balance.warning_level) {
      case 'critical':
        return <AlertTriangle className="w-3 h-3 text-red-600" />;
      case 'low':
        return <AlertCircle className="w-3 h-3 text-yellow-600" />;
      default:
        return null;
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading || !balance) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-full animate-pulse">
        <Coins className="w-4 h-4 text-gray-400" />
        <span className="text-sm text-gray-400">...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => showDropdown && setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors ${
          getWarningColor()
        } ${showDropdown ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
      >
        <Coins className="w-4 h-4" />
        <span className="text-sm font-medium">
          {formatNumber(balance.balance)} credits
        </span>
        {getWarningIcon()}
        {showDropdown && <ChevronDown className="w-3 h-3" />}
      </button>

      {isOpen && showDropdown && (
        <CreditDropdown onClose={() => setIsOpen(false)} />
      )}
    </div>
  );
}

function CreditDropdown({ onClose }: { onClose: () => void }) {
  const { balance, transactions, refreshBalance } = useCredits();

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5" />
              <span className="font-semibold">Số dư Credits</span>
            </div>
            <button
              onClick={refreshBalance}
              className="text-white/80 hover:text-white text-sm"
            >
              Làm mới
            </button>
          </div>
          <div className="mt-2">
            <span className="text-3xl font-bold">{balance?.balance.toLocaleString()}</span>
            <span className="text-white/80 ml-1">credits</span>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 p-4 border-b border-gray-100">
          <div className="text-center">
            <p className="text-xs text-gray-500">Đã nạp tổng</p>
            <p className="font-semibold text-gray-700">
              {(balance?.lifetime_earned || 0).toLocaleString()}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Đã sử dụng</p>
            <p className="font-semibold text-gray-700">
              {(balance?.lifetime_spent || 0).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Recent Transactions */}
        <div className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Giao dịch gần đây</span>
          </div>
          
          {transactions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              Chưa có giao dịch nào
            </p>
          ) : (
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {transactions.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <div>
                    <p className="font-medium text-gray-700">
                      {getTransactionLabel(tx.type)}
                    </p>
                    <p className="text-xs text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString('vi-VN')}
                    </p>
                  </div>
                  <span
                    className={`font-semibold ${
                      tx.amount > 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 bg-gray-50 border-t border-gray-100">
          <a
            href="/credits"
            className="flex items-center justify-center gap-2 w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Package className="w-4 h-4" />
            <span>Nạp thêm credits</span>
          </a>
        </div>
      </div>
    </>
  );
}

function getTransactionLabel(type: string): string {
  const labels: Record<string, string> = {
    'chat': 'Chat AI',
    'chat:estimate': 'Chat AI (tạm giữ)',
    'chat:refund': 'Hoàn credits',
    'contract_analysis': 'Phân tích hợp đồng',
    'topup': 'Nạp credits',
    'topup:pending': 'Đang xử lý nạp',
    'bonus': 'Thưởng credits',
  };
  return labels[type] || type;
}
