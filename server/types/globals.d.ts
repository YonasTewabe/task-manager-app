import type { Buffer } from "node:buffer";
import type { AuthJwtPayload } from "./api-contracts.js";

declare global {
  type AnyRecord = Record<string, any>;
}

declare global {
  namespace Express {
    interface User extends Record<string, any> {
      id: string;
      role?: string;
      isActive?: boolean;
      mustChangePassword?: boolean;
    }

    interface Request {
      user?: User | null;
      rawBody?: Buffer;
      file?: AnyRecord;
      auth?: AuthJwtPayload;
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    user?: Express.User | null;
    rawBody?: Buffer;
    file?: AnyRecord;
    auth?: AuthJwtPayload;
  }
}

export {};
