import { io } from 'socket.io-client'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const socket = io(API_URL, {
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  autoConnect: true
})

// Event listeners for debugging
socket.on('connect', () => {
  console.log('✅ Connected to realtime server:', socket.id)
})

socket.on('disconnect', () => {
  console.log('❌ Disconnected from realtime server')
})

socket.on('error', (error) => {
  console.error('Socket error:', error)
})

socket.on('system', (data) => {
  console.log('📢 System message:', data.message)
})

export default socket
