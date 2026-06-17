import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

/**
 * SocketServer (Singleton)
 *
 * Wraps the single Socket.IO server. It manages connections and per-user rooms
 * (`user:<id>`) and exposes narrow `emitToUser` / `emitToAll` helpers. The rest
 * of the app never imports `socket.io` directly — it goes through this facade.
 */
class SocketServer {
    private static instance: SocketServer;
    private io: Server | null = null;

    private constructor() {}

    static getInstance(): SocketServer {
        if (!SocketServer.instance) {
            SocketServer.instance = new SocketServer();
        }
        return SocketServer.instance;
    }

    init(httpServer: HttpServer): Server {
        this.io = new Server(httpServer, {
            cors: { origin: "*", methods: ["GET", "POST"] },
        });

        this.io.on("connection", (socket: Socket) => {
            console.log(`Client connected: ${socket.id}`);

            // Join the user's personal room so we can target user-specific updates.
            socket.on("join-user-room", (userId: string) => {
                socket.join(`user:${userId}`);
                console.log(`Socket ${socket.id} joined room user:${userId}`);
            });

            socket.on("disconnect", () => {
                console.log(`Client disconnected: ${socket.id}`);
            });
        });

        return this.io;
    }

    emitToUser(userId: string, event: string, payload?: unknown): void {
        if (!this.io) return;
        const room = this.io.to(`user:${userId}`);
        // Emit with no argument when there's no payload (matches the original events).
        payload === undefined ? room.emit(event) : room.emit(event, payload);
    }

    emitToAll(event: string, payload?: unknown): void {
        if (!this.io) return;
        payload === undefined ? this.io.emit(event) : this.io.emit(event, payload);
    }
}

export const socketServer = SocketServer.getInstance();
