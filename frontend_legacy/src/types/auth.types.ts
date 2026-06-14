// Authentication and User types based on backend User model

export type UserRole = 'buyer' | 'seller' | 'creator' | 'delivery' | 'admin' | 'superadmin';

export interface User {
    id: string; // Map _id to id in frontend
    _id: string;
    fullName: string;
    username: string;
    email: string;
    phone: string;
    countryCode: string;
    avatar?: string;
    bio?: string;
    role: UserRole;
    agentId?: string;
    badgeOwned?: boolean;
    referralCode?: string;
    referredBy?: string;
    referrals?: string[];
    socialRewards?: string[];
    isActive?: boolean;
    createdAt?: string | Date;
    walletAddress?: string;
    mallCoins?: number;
    mallPoints?: number;
    lastLocation?: {
        lat: number;
        lng: number;
        accuracy?: number;
        updatedAt?: string | Date;
    };
    notificationSettings?: {
        email: boolean;
        push: boolean;
        sms: boolean;
        whatsapp: boolean;
        categories?: string[];
    };
    preferences?: {
        theme?: 'light' | 'dark' | 'auto';
        accentColor?: string;
        fontSize?: 'small' | 'medium' | 'large';
        reducedMotion?: boolean;
        notifications?: {
            email: boolean;
            push: boolean;
            sms: boolean;
            marketing: boolean;
        };
        privacy?: {
            profileVisibility: 'public' | 'friends' | 'private';
            showEmail: boolean;
            showPhone: boolean;
            activityStatus: boolean;
        };
    };
}

export interface SignupRequest {
    name: string;
    username: string;
    email: string;
    password: string;
    phone: string;
    countryCode?: string;
    role?: UserRole;
    gender?: 'female' | 'male' | 'non-binary' | 'prefer-not-to-say';
    country?: string;
    city?: string;
    age?: number;
    dateOfBirth?: string;
}

export interface SignupResponse {
    user: User;
    token: string;
    refreshToken: string;
    message?: string;
}

export interface LoginRequest {
    email: string;
    password: string;
}

export interface LoginResponse {
    user: User;
    token: string;
    refreshToken: string;
    message?: string;
}

export interface ProfileResponse {
    user: User;
}

export interface UpdateLocationRequest {
    lat: number;
    lng: number;
    accuracy?: number;
}

export interface CheckUsernameResponse {
    available: boolean;
    message?: string;
}
