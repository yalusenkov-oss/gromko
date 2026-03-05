/**
 * GROMKO Auth — JWT + bcrypt authentication
 */
import { Request, Response, NextFunction } from 'express';
import 'dotenv/config';
export interface JwtPayload {
    userId: string;
    email: string;
    role: string;
}
export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: string;
    avatar: string | null;
    country: string | null;
    isBlocked: boolean;
    likedTracks: string[];
    likedAlbums: string[];
    likedArtists: string[];
    createdAt: string;
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthUser;
        }
    }
}
export declare function registerUser(name: string, email: string, password: string, country?: string): Promise<{
    user: AuthUser;
    token: string;
}>;
export declare function loginUser(email: string, password: string): Promise<{
    user: AuthUser;
    token: string;
}>;
export declare function getUserById(userId: string): Promise<AuthUser | null>;
/** Extract user from JWT token. Does NOT block unauthenticated requests. */
export declare function authOptional(req: Request, _res: Response, next: NextFunction): void;
/** Require authenticated user. Returns 401 if not logged in. */
export declare function authRequired(req: Request, res: Response, next: NextFunction): void;
/** Require admin role */
export declare function adminRequired(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map