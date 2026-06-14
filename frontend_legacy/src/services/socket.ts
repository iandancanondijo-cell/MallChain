import { io, Socket } from "socket.io-client";

// Ensure we connect to the correct backend URL
const URL = (import.meta as any).env?.VITE_API_BASE || "http://localhost:4000";

// Interface for Server-to-Client events
interface ServerToClientEvents {
    "task:completed": (data: { title: string; reward: number }) => void;
    "notification": (data: { title: string; message: string; type?: 'success' | 'error' | 'info' }) => void;
    "stats:update": (data: any) => void;
    "message:receive": (msg: any) => void;
    "message:sent": (msg: any) => void;
    "chat:typing": (data: { senderId: string; isTyping: boolean }) => void;
    "ledger:update": () => void;
    "wallet:update": (data: { mallmoney: number; mallcoins: number; mallpoints: number }) => void;
    "wallet:received": (data: { from: string; amount: number }) => void;
    "tx:update": (data: { transactionId: string; status: string; txHash?: string; height?: number }) => void;
}

// Interface for Client-to-Server events
interface ClientToServerEvents {
    "subscribeTask": (data: { taskId: string }) => void;
    "identity": (token: string) => void;
}

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(URL, {
    autoConnect: false, // Wait for auth
    transports: ["websocket", "polling"],
});

// Helper to connect with auth
export const connectSocket = (token: string) => {
    if (socket.connected) return;

    socket.auth = { token };
    socket.connect();

    socket.on("connect", () => {
        console.log("[Socket] Connected:", socket.id);
    });

    socket.on("connect_error", (err) => {
        console.error("[Socket] Connection Error:", err.message || err);
        // Socket will auto-retry with exponential backoff
    });

    socket.on("error", (err) => {
        console.error("[Socket] Error:", err);
    });
};

export const disconnectSocket = () => {
    if (socket.connected) socket.disconnect();
};
