import { Request, Response, NextFunction } from "express";
import jwt, { Secret } from "jsonwebtoken";

const JWT_SECRET: Secret = process.env.JWT_SECRET!;


export const protect = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: string;
      };
      
    req.user = { userId: decoded.userId };
      
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};
