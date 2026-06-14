// Wallet API functions
import { api } from '../services/api';
import type {
    Wallet,
    WalletTransaction,
    DepositRequest,
    WithdrawRequest,
    SendMoneyRequest,
    ConvertRequest,
    BuyMallCoinsRequest,
    BuyMallCoinsResponse,
    ConversionWindow,
    ReceiveLinkResponse,
    TransactionsResponse,
} from '../types';

/**
 * Get user wallet balance
 */
export async function getWallet(): Promise<Wallet> {
    const response = await api.get<any>('/wallet');
    // Backend returns { wallet, txs }, extract the wallet object
    return response.data.wallet || response.data;
}

/**
 * Get wallet transactions
 */
export async function getTransactions(): Promise<WalletTransaction[]> {
    const response = await api.get<TransactionsResponse>('/wallet/transactions');
    return response.data.data || response.data.transactions || [];
}

/**
 * Deposit money into wallet
 */
export async function deposit(data: DepositRequest): Promise<void> {
    await api.post('/wallet/deposit', data);
}

/**
 * Withdraw money from wallet
 */
export async function withdraw(data: WithdrawRequest): Promise<void> {
    await api.post('/wallet/withdraw', data);
}

/**
 * Send money to another user
 */
export async function sendMoney(data: SendMoneyRequest): Promise<void> {
    await api.post('/wallet/send', data);
}

/**
 * Convert points to coins or coins to money
 */
export async function convert(data: ConvertRequest): Promise<void> {
    await api.post('/wallet/convert', data);
}

/**
 * Convert points to mallcoins
 */
export async function convertPoints(points: number): Promise<void> {
    await api.post('/wallet/convert-points', { points });
}

/**
 * Buy MallCoins with KES
 */
export async function buyMallCoins(data: BuyMallCoinsRequest): Promise<BuyMallCoinsResponse> {
    const response = await api.post<BuyMallCoinsResponse>('/wallet/buy', data);
    return response.data;
}

/**
 * Get conversion window status
 */
export async function getConversionWindow(): Promise<ConversionWindow> {
    const response = await api.get<ConversionWindow>('/wallet/convert-window');
    return response.data;
}

/**
 * Get current conversion rate
 */
export async function getConversionRate(): Promise<number> {
    const response = await api.get<{ rate: number }>('/wallet/rate');
    return response.data.rate || 2;
}

/**
 * Get current MallCoin buy price in KES
 */
export async function getBuyPrice(): Promise<number> {
    const response = await api.get<{ buyPrice: number }>('/wallet/buy-price');
    return response.data.buyPrice || 0.62;
}

/**
 * Get real-world market exchange rates (relative to KES)
 */
export async function getMarketRates(): Promise<Record<string, number>> {
    const response = await api.get<Record<string, number>>('/wallet/market-rates');
    return response.data;
}

export async function checkPinStatus(): Promise<{ isSet: boolean }> {
    const response = await api.get<{ isSet: boolean }>('/wallet/check-pin');
    return response.data;
}

export async function setPin(pin: string): Promise<{ ok: boolean; message: string }> {
    const response = await api.post<{ ok: boolean; message: string }>('/wallet/set-pin', { pin });
    return response.data;
}

export async function changePin(oldPin: string, newPin: string): Promise<{ ok: boolean; message: string }> {
    const response = await api.post<{ ok: boolean; message: string }>('/wallet/change-pin', { oldPin, newPin });
    return response.data;
}

export async function resetPin(idNumber: string, newPin: string): Promise<{ ok: boolean; message: string }> {
    const response = await api.post<{ ok: boolean; message: string }>('/wallet/reset-pin', { idNumber, newPin });
    return response.data;
}

/**
 * Create a receive link/QR code
 */
export async function createReceiveLink(amount?: number): Promise<ReceiveLinkResponse> {
    const response = await api.post<ReceiveLinkResponse>('/wallet/receive-link', { amount });
    return response.data;
}

/**
 * Download receipt for a transaction
 */
export async function downloadReceipt(txId: string): Promise<Blob> {
    const response = await api.get(`/wallet/receipt/${txId}`, {
        responseType: 'blob',
    });
    return response.data;
}
