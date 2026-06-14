// Wallet types based on backend Wallet model

export interface Wallet {
    _id?: string;
    ownerId: string;
    mallmoney: number;
    mallcoins: number;
    mallpoints: number;
    reserved?: number;
    currency?: string;
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export interface WalletTransaction {
    _id?: string;
    id?: string;
    walletId?: string;
    ownerId?: string;
    type: string;
    amount: number;
    currency?: string;
    status?: string;
    referenceId?: string;
    fromUserId?: string;
    toUserId?: string;
    description?: string;
    meta?: any;
    createdAt?: string | Date;
    updatedAt?: string | Date;
}

export interface DepositRequest {
    amount: number;
    method?: string;
    phone?: string;
}

export interface WithdrawRequest {
    amount: number;
    method?: string;
    phone?: string;
    pin?: string;
    source?: 'mallmoney' | 'mallcoins';
    dest?: string;
}

export interface SendMoneyRequest {
    fromUserId?: string;
    toUserId?: string;
    toUsername?: string;
    amount: number;
    pin?: string;
    type?: 'mallmoney' | 'mallcoins';
}

export interface ConvertRequest {
    mode?: 'points-to-coins' | 'coins-to-money';
    amount: number;
    points?: number;
}

export interface BuyMallCoinsRequest {
    amountKES: number;
    generateWallet?: boolean;
}

export interface BuyMallCoinsResponse {
    ok: boolean;
    txId: string;
    message: string;
    mintResult?: any;
}

export interface ConversionWindow {
    isOpen: boolean;
    opensAt?: string;
    closesAt?: string;
    nextWindow?: string;
}

export interface ReceiveLinkResponse {
    link?: string;
    url?: string;
    qrCode?: string;
    qrDataUrl?: string;
    payload?: string;
    ok?: boolean;
}

export interface TransactionsResponse {
    data: WalletTransaction[];
    transactions?: WalletTransaction[];
}
