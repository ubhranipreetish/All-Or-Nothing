import jwt, { Secret, SignOptions } from "jsonwebtoken";

const JWT_SECRET: Secret = process.env.JWT_SECRET!;

const signOptions: SignOptions = {
  expiresIn: (process.env.JWT_EXPIRES_IN ?? "7d") as SignOptions["expiresIn"],
};

export const signToken = (payload: object) => {
  return jwt.sign(payload, JWT_SECRET, signOptions);
};
