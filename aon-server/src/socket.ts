import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

export type { Server as SocketServer };

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer): Server => {
    io = new Server(httpServer, {
        cors: {
            origin: "*", // Configure this based on your frontend URL in production
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket: Socket) => {
        console.log(`Client connected: ${socket.id}`);

        socket.on("disconnect", () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const getIO = (): Server => {
    if (!io) {
        throw new Error("Socket.IO not initialized");
    }
    return io;
};
