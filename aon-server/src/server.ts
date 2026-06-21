import { createServer } from "http";
import { env } from "./config/env";
import { database } from "./config/database";
import app from "./app";
import { socketServer } from "./realtime/SocketServer";
import { pokerHub } from "./realtime/poker/PokerHub";
import { container } from "./container";

const httpServer = createServer(app);

// Bring up the websocket server and wire the realtime observer to the EventBus.
const io = socketServer.init(httpServer);
container.socketNotifier.register();

// Multiplayer poker lives on its own /poker namespace (isolated from the rest).
pokerHub.register(io);

database.connect().then(() => {
    httpServer.listen(env.port, () => {
        console.log(`Server running on port ${env.port}`);
    });
});
