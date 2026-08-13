/**
 * Task 5.12: useSocketStatus Hook
 * 
 * Provides real-time socket connection status tracking
 * - Monitors connection/disconnection events
 * - Tracks reconnection attempts
 * - Provides UI-friendly status labels
 * - Auto-updates when connection state changes
 */

import { useState, useEffect } from 'react';
import { socketManager } from '../services/socket';

export interface SocketStatus {
  connected: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'reconnecting';
  subscriptions: string[];
  message?: string;
}

/**
 * Hook to track socket connection status
 * Returns current status and updates whenever connection state changes
 */
export function useSocketStatus(): SocketStatus {
  const [status, setStatus] = useState<SocketStatus>({
    connected: socketManager.isConnected(),
    status: socketManager.isConnected() ? 'connected' : 'disconnected',
    subscriptions: socketManager.getSubscriptions(),
  });

  useEffect(() => {
    // Update status immediately
    const updateStatus = () => {
      setStatus({
        connected: socketManager.isConnected(),
        status: socketManager.isConnected() ? 'connected' : 'disconnected',
        subscriptions: socketManager.getSubscriptions(),
      });
    };

    // Listen for connection events
    if (socketManager.socket) {
      const handleConnect = () => {
        console.log('[Hook] Socket connected');
        setStatus({
          connected: true,
          status: 'connected',
          subscriptions: socketManager.getSubscriptions(),
          message: 'Connected to real-time updates',
        });
      };

      const handleDisconnect = (reason: string) => {
        console.log('[Hook] Socket disconnected:', reason);
        setStatus({
          connected: false,
          status: 'disconnected',
          subscriptions: socketManager.getSubscriptions(),
          message: `Disconnected: ${reason}`,
        });
      };

      const handleConnectError = (error: any) => {
        console.log('[Hook] Socket error:', error);
        setStatus((prev) => ({
          ...prev,
          status: 'disconnected',
          message: 'Connection error - retrying...',
        }));
      };

      const handleReconnecting = () => {
        console.log('[Hook] Socket reconnecting');
        setStatus((prev) => ({
          ...prev,
          status: 'reconnecting',
          message: 'Attempting to reconnect...',
        }));
      };

      socketManager.socket.on('connect', handleConnect);
      socketManager.socket.on('disconnect', handleDisconnect);
      socketManager.socket.on('connect_error', handleConnectError);
      socketManager.socket.on('reconnect_attempt', handleReconnecting);

      // Initial status
      updateStatus();

      // Cleanup listeners on unmount
      return () => {
        if (socketManager.socket) {
          socketManager.socket.off('connect', handleConnect);
          socketManager.socket.off('disconnect', handleDisconnect);
          socketManager.socket.off('connect_error', handleConnectError);
          socketManager.socket.off('reconnect_attempt', handleReconnecting);
        }
      };
    }

    updateStatus();
  }, [socketManager.socket]);

  return status;
}
