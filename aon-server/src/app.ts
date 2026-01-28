import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import authRoutes from "./routes/auth.route";

const app = express();

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());

app.use("/api/auth", authRoutes);

app.get("/health", (_, res) => {
  res.json({ status: "OK" });
});

export default app;
