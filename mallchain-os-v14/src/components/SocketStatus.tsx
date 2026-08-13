/**
 * Task 5.12: SocketStatus Component
 * 
 * Displays real-time socket connection status indicator
 * Shows:
 * - "Connected" with green indicator when websocket is active
 * - "Disconnected" with red indicator when not connected
 * - "Reconnecting..." with yellow indicator during reconnection attempts
 * - Tooltip with current subscriptions and connection details
 */

import { useSocketStatus } from '../hooks/useSocketStatus';
import '../styles/socket-status.css';

export default function SocketStatus() {
  const socketStatus = useSocketStatus();

  // Determine display text and styles based on status
  const getStatusDisplay = () => {
    switch (socketStatus.status) {
      case 'connected':
        return {
          icon: '🟢',
          text: 'Connected',
          className: 'socket-status connected',
          title: `Real-time updates active\nSubscriptions: ${socketStatus.subscriptions.length}`,
        };
      case 'connecting':
        return {
          icon: '🟡',
          text: 'Connecting...',
          className: 'socket-status connecting',
          title: 'Establishing connection to real-time updates...',
        };
      case 'reconnecting':
        return {
          icon: '🟡',
          text: 'Reconnecting...',
          className: 'socket-status reconnecting',
          title: 'Attempting to restore connection...',
        };
      case 'disconnected':
      default:
        return {
          icon: '🔴',
          text: 'Disconnected',
          className: 'socket-status disconnected',
          title: socketStatus.message || 'Real-time updates unavailable',
        };
    }
  };

  const display = getStatusDisplay();

  return (
    <div className={display.className} title={display.title}>
      <span className="socket-icon">{display.icon}</span>
      <span className="socket-text">{display.text}</span>
      {socketStatus.subscriptions.length > 0 && (
        <span className="socket-count">{socketStatus.subscriptions.length}</span>
      )}
    </div>
  );
}
