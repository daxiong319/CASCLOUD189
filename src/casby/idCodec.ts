import crypto from 'crypto';

export function base64UrlEncode(str: string): string {
    return Buffer.from(String(str), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export function base64UrlDecodeToString(str: string): string {
    let s = String(str).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4 !== 0) {
        s += '=';
    }
    return Buffer.from(s, 'base64').toString('utf8');
}

export function shortHash(str: string, len: number = 10): string {
    return crypto.createHash('sha1').update(String(str || '')).digest('hex').slice(0, len);
}

export function encodeCasbyId(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;
    const t = obj.t;
    if (t === 'lib') return `l_${obj.id}`;
    if (t === 'movie') return `m_${obj.taskId}`;
    if (t === 'season') return `sn_${obj.taskId}`;
    if (t === 'episode') return `e_${obj.taskId}_${base64UrlEncode(obj.fileId)}`;
    if (t === 'series') {
        if (obj.tmdbId) return `s_${obj.libId}_t${obj.tmdbId}`;
        const kh = obj.keyHash || shortHash(obj.key, 12);
        return `s_${obj.libId}_k${kh}`;
    }
    if (t === 'tmdb_movie') return `tm_${obj.titleId}`;
    if (t === 'tmdb_series') return `ts_${obj.titleId}`;
    if (t === 'tmdb_season') return `tsn_${obj.seasonId}`;
    if (t === 'tmdb_episode') return `te_${obj.episodeId}`;
    return null;
}

export function decodeCasbyId(str: string): any {
    if (!str || typeof str !== 'string') return null;
    if (str.startsWith('l_')) {
        return { id: parseInt(str.slice(2), 10) };
    }
    if (str.startsWith('m_')) {
        return { taskId: parseInt(str.slice(2), 10) };
    }
    if (str.startsWith('sn_')) {
        return { taskId: parseInt(str.slice(3), 10) };
    }
    if (str.startsWith('e_')) {
        const parts = str.split('_');
        if (parts.length < 3) return null;
        const taskId = parseInt(parts[1], 10);
        const fileId = base64UrlDecodeToString(parts.slice(2).join('_'));
        return { taskId, fileId };
    }
    if (str.startsWith('s_')) {
        const parts = str.split('_');
        if (parts.length !== 3) return null;
        const libId = parseInt(parts[1], 10);
        const tag = parts[2];
        if (tag.startsWith('t')) {
            return { libId, tmdbId: tag.slice(1) };
        }
        if (tag.startsWith('k')) {
            return { libId, keyHash: tag.slice(1) };
        }
        return null;
    }
    if (str.startsWith('tm_')) {
        return { titleId: parseInt(str.slice(3), 10) };
    }
    if (str.startsWith('tsn_')) {
        return { seasonId: parseInt(str.slice(4), 10) };
    }
    if (str.startsWith('te_')) {
        return { episodeId: parseInt(str.slice(3), 10) };
    }
    if (str.startsWith('ts_')) {
        return { titleId: parseInt(str.slice(3), 10) };
    }
    return null;
}
