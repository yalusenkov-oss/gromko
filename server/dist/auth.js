/**
 * GROMKO Auth — JWT + bcrypt authentication
 */
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { queryOne, execute } from './db.js';
import 'dotenv/config';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET must be set in production');
}
const JWT_SECRET = process.env.JWT_SECRET || 'gromko-dev-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const SALT_ROUNDS = 10;
// ─── Helpers ───
function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch {
        return null;
    }
}
function formatUser(row) {
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role,
        avatar: row.avatar,
        isBlocked: row.is_blocked,
        likedTracks: row.liked_tracks || [],
        createdAt: row.created_at,
    };
}
// ─── Auth functions ───
export async function registerUser(name, email, password) {
    // Check if email taken
    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
        throw new Error('Пользователь с таким email уже зарегистрирован');
    }
    if (password.length < 6) {
        throw new Error('Пароль должен содержать минимум 6 символов');
    }
    const id = uuid();
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const avatar = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}&backgroundColor=ef4444`;
    await execute(`INSERT INTO users (id, name, email, password_hash, role, avatar)
     VALUES ($1, $2, $3, $4, 'user', $5)`, [id, name, email, passwordHash, avatar]);
    const user = await queryOne('SELECT * FROM users WHERE id = $1', [id]);
    const token = signToken({ userId: id, email, role: 'user' });
    return { user: formatUser(user), token };
}
export async function loginUser(email, password) {
    const row = await queryOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!row) {
        throw new Error('Неверный email или пароль');
    }
    if (row.is_blocked) {
        throw new Error('Аккаунт заблокирован');
    }
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) {
        throw new Error('Неверный email или пароль');
    }
    const user = formatUser(row);
    const token = signToken({ userId: user.id, email: user.email, role: user.role });
    return { user, token };
}
export async function getUserById(userId) {
    const row = await queryOne('SELECT * FROM users WHERE id = $1', [userId]);
    return row ? formatUser(row) : null;
}
// ─── Middleware ───
/** Extract user from JWT token. Does NOT block unauthenticated requests. */
export function authOptional(req, _res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return next();
    }
    const token = header.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
        return next();
    }
    // Attach user asynchronously
    getUserById(payload.userId)
        .then((user) => {
        if (user && !user.isBlocked) {
            req.user = user;
        }
        next();
    })
        .catch(() => next());
}
/** Require authenticated user. Returns 401 if not logged in. */
export function authRequired(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Необходима авторизация' });
        return;
    }
    const token = header.slice(7);
    const payload = verifyToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Недействительный токен' });
        return;
    }
    getUserById(payload.userId)
        .then((user) => {
        if (!user) {
            res.status(401).json({ error: 'Пользователь не найден' });
            return;
        }
        if (user.isBlocked) {
            res.status(403).json({ error: 'Аккаунт заблокирован' });
            return;
        }
        req.user = user;
        next();
    })
        .catch(() => {
        res.status(500).json({ error: 'Ошибка авторизации' });
    });
}
/** Require admin role */
export function adminRequired(req, res, next) {
    authRequired(req, res, () => {
        if (req.user?.role !== 'admin') {
            res.status(403).json({ error: 'Только для администраторов' });
            return;
        }
        next();
    });
}
//# sourceMappingURL=auth.js.map