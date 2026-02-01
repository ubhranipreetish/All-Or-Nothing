import dotenv from "dotenv";
dotenv.config();

import { createServer } from "http";
import app from "./app";
import { connectDB } from "./config/db";
import { initSocket } from "./socket";

const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);

// Initialize Socket.IO
initSocket(httpServer);

connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
