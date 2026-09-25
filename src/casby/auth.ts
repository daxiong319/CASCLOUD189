import { Request, Response, NextFunction } from 'express';
import { AppDataSource } from '../database';
import { EmbyToken, EmbyUser } from '../entities';

export interface CasbyClientInfo {
    client?: string;
    device?: string;
    deviceId?: string;
    version?: string;
}

export interface CasbyContext {
    token?: string;
    user?: EmbyUser;
    clientInfo?: CasbyClientInfo;
}

declare global {
    namespace Express {
        interface Request {
            casby?: CasbyContext;
        }
    }
}

export function parseTokenFromHeaders(req: Request): string | null {
    let token = req.headers['x-emby-token'] || req.headers['x-mediabrowser-token'];
    if (token) return String(token);

    const authHeader = req.headers['authorization'] || req.headers['x-emby-authorization'];
    if (typeof authHeader === 'string') {
        const m1 = authHeader.match(/Token\s*=\s*"([^"]+)"/i);
        if (m1) return m1[1];
        const m2 = authHeader.match(/Token\s*=\s*([^,]+)/i);
        if (m2) return m2[1].trim();
        if (/^[a-z0-9-]{8,}$/i.test(authHeader.trim())) {
            return authHeader.trim();
        }
    }

    if (req.query?.api_key) return String(req.query.api_key);
    if (req.query?.['X-Emby-Token']) return String(req.query['X-Emby-Token']);

    return null;
}

export function parseClientInfo(req: Request): CasbyClientInfo {
    const raw = req.headers['x-emby-authorization'] || req.headers['x-mediabrowser-authorization'];
    if (!raw || typeof raw !== 'string') return {};

    const info: Record<string, string> = {};
    const parts = raw.split(',').map(s => s.trim());
    for (const p of parts) {
        const idx = p.indexOf('=');
        if (idx !== -1) {
            const k = p.slice(0, idx).trim().toLowerCase();
            let v = p.slice(idx + 1).trim();
            if (v.startsWith('"') && v.endsWith('"')) {
                v = v.slice(1, -1);
            }
            info[k] = v;
        }
    }

    return {
        client: info['client'],
        device: info['device'],
        deviceId: info['deviceid'],
        version: info['version']
    };
}

export function attachUserContext() {
    return async (req: Request, res: Response, next: NextFunction) => {
        const tokenStr = parseTokenFromHeaders(req);
        const clientInfo = parseClientInfo(req);
        req.casby = { clientInfo };

        if (!tokenStr) {
            return next();
        }

        try {
            const tokenRepo = AppDataSource.getRepository(EmbyToken);
            const userRepo = AppDataSource.getRepository(EmbyUser);

            const tokenRecord = await tokenRepo.findOne({ where: { token: tokenStr } });
            if (tokenRecord) {
                const user = await userRepo.findOne({ where: { id: tokenRecord.userId } });
                if (user && !user.isDisabled) {
                    req.casby.token = tokenStr;
                    req.casby.user = user;
                    // update lastUsedAt
                    tokenRepo.update({ token: tokenStr }, { lastUsedAt: new Date() }).catch(() => {});
                }
            }
        } catch (_) {}

        next();
    };
}

export function requireCasbyUser(req: Request, res: Response, next: NextFunction) {
    if (req.casby?.user) {
        return next();
    }
    return res.status(401).json({ error: 'Unauthorized' });
}
