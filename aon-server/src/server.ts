import { createServer } from "http";
import { env } from "./config/env";
import { database } from "./config/database";
import app from "./app";
import { socketServer } from "./realtime/SocketServer";
import { container } from "./container";

const httpServer = createServer(app);

// Bring up the websocket server and wire the realtime adapters.
const io = socketServer.init(httpServer);
container.socketNotifier.register(); // Observer → EventBus
container.pokerGateway.register(io); // multiplayer poker on its own /poker namespace

database.connect().then(() => {
    httpServer.listen(env.port, () => {
        console.log(`Server running on port ${env.port}`);
    });
});
