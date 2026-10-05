import { api } from './api';

export interface APIKey {
  _id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scope: string[];
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  usageCount: number;
  environment: 'development' | 'staging' | 'production';
  createdAt: string;
  status?: 'active' | 'revoked' | 'expired';
  isValid?: boolean;
}

export interface APIKeyResponse extends APIKey {
  key?: string; // Only returned when creating/rotating
  message?: string;
}

export interface APIKeyUsageStats {
  _id: string;
  keyPrefix: string;
  name: string;
  usageCount: number;
  lastUsedAt: string | null;
  rateLimitPerMinute: number;
  scope: string[];
  status: 'active' | 'revoked' | 'expired';
}

export interface AggregateStats {
  totalKeys: number;
  totalUsage: number;
  activeKeys: number;
}

export interface CreateKeyRequest {
  name: string;
  scope: string[];
  expiresInDays?: number;
  environment?: 'development' | 'staging' | 'production';
  ipWhitelist?: string[];
  rateLimitPerMinute?: number;
}

export interface UpdateKeyRequest {
  name?: string;
  scope?: string[];
  rateLimitPerMinute?: number;
  ipWhitelist?: string[];
}

export const apiKeyApi = {
  /**
   * List all API keys for the current user
   */
  async listKeys() {
    return api.get<APIKey[]>('/api/api-keys');
  },

  /**
   * Generate a new API key
   * @param data - Key creation parameters
   * @returns New key (shown only once)
   */
  async generateKey(data: CreateKeyRequest) {
    return api.post<APIKeyResponse>('/api/api-keys', data);
  },

  /**
   * Update an existing API key
   * @param keyId - API key ID
   * @param data - Fields to update
   */
  async updateKey(keyId: string, data: UpdateKeyRequest) {
    return api.patch<APIKey>('/api/api-keys/' + keyId, data);
  },

  /**
   * Revoke (disable) an API key
   * @param keyId - API key ID
   */
  async revokeKey(keyId: string) {
    return api.delete<{ message: string; _id: string; revokedAt: string }>(
      '/api/api-keys/' + keyId
    );
  },

  /**
   * Rotate a compromised API key
   * Revokes the old key and generates a new one with the same settings
   * @param keyId - API key ID to rotate
   */
  async rotateKey(keyId: string) {
    return api.post<APIKeyResponse>('/api/api-keys/' + keyId + '/rotate', {});
  },

  /**
   * Get usage statistics for a specific key
   * @param keyId - API key ID
   */
  async getKeyUsage(keyId: string) {
    return api.get<APIKeyUsageStats>('/api/api-keys/' + keyId + '/usage');
  },

  /**
   * Get aggregate usage statistics for all keys
   */
  async getAggregateStats() {
    return api.get<AggregateStats>('/api/api-keys/stats/aggregate');
  },
};
