import { Router, Request, Response } from 'express';
import got from 'got';
import { AppDataSource } from '../database';
import { Account } from '../entities';
import { DriverRegistry } from '../drivers/DriverRegistry';

/**
 * 跨盘播放加速路由：
 *
 *  GET /api/play/:accountId/redirect?fileId=xxx
 *      302 重定向到网盘直链（轻量播放器/Go proxy 可直接跟随，缓存友好）。
 *
 *  GET /api/play/:accountId/stream?fileId=xxx
 *      服务端流式代理（透传 Range 分片请求），适用于：
 *      - 直链有 Referer/UA 防盗链必须由服务端带头转发的网盘
 *      - 客户端不支持 302 的场景
 *
 *  GET /api/play/:accountId/info?fileId=xxx
 *      返回直链 + 过期时间（供 Go proxy 反代层预热缓存使用）。
 */
export function buildPlaybackRoutes(): Router {
    const router = Router();

    const loadDriver = async (accountId: string) => {
        const repo = AppDataSource.getRepository(Account);
        const account = await repo.findOne({ where: { id: parseInt(accountId, 10) } });
        if (!account) throw new Error('账号不存在');
        return DriverRegistry.getDriverForAccount(account);
    };

    const parseFileIdRef = (raw: string): { accountId: string; fileId: string } | null => {
        // 兼容 "accountId:fileId" 复合格式（Emby PathMapping 生成 STRM 时使用）
        const m = raw.match(/^(\d+):(.+)$/);
        if (m) return { accountId: m[1], fileId: m[2] };
        return null;
    };

    // 直链信息（供 Go proxy / 播放器获取真实地址与有效期）
    router.get('/:accountId/info', async (req: Request, res: Response) => {
        try {
            const driver = await loadDriver(req.params.accountId);
            const { fileId } = req.query;
            if (!fileId) return res.status(400).json({ success: false, error: '缺少 fileId' });
            const result = await driver.getDownloadUrl(String(fileId));
            res.json({
                success: true,
                data: {
                    driveType: driver.driveType,
                    url: result.url,
                    expireAt: result.expireAt,
                    headers: result.headers
                }
            });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 302 重定向直链（默认播放入口，Emby/infuse 等播放器直接跟随）
    router.get('/:accountId/redirect', async (req: Request, res: Response) => {
        try {
            const driver = await loadDriver(req.params.accountId);
            const { fileId } = req.query;
            if (!fileId) return res.status(400).json({ success: false, error: '缺少 fileId' });

            const result = await driver.getDownloadUrl(String(fileId));
            // 告知客户端/代理层直链时效，便于缓存
            if (result.expireAt) {
                res.setHeader('X-Direct-Url-Expire', new Date(result.expireAt).toUTCString());
            }
            res.setHeader('X-Drive-Type', driver.driveType);
            res.redirect(302, result.url);
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 流式代理（透传 Range；防盗链网盘由服务端带头转发）
    router.get('/:accountId/stream', async (req: Request, res: Response) => {
        let upstream: any = null;
        try {
            const driver = await loadDriver(req.params.accountId);
            const { fileId } = req.query;
            if (!fileId) return res.status(400).json({ success: false, error: '缺少 fileId' });

            const result = await driver.getDownloadUrl(String(fileId));

            const headers: Record<string, string> = {
                'User-Agent': result.headers?.['User-Agent'] || 'Mozilla/5.0',
                ...(result.headers || {})
            };
            if (req.headers.range) {
                headers['Range'] = String(req.headers.range);
            }

            upstream = got.stream(result.url, { headers, timeout: { request: 120000 } });

            // 透传状态码与关键响应头
            upstream.on('response', (upRes: any) => {
                res.writeHead(upRes.statusCode || 200, {
                    'Content-Type': upRes.headers['content-type'] || 'application/octet-stream',
                    'Content-Length': upRes.headers['content-length'],
                    'Content-Range': upRes.headers['content-range'],
                    'Accept-Ranges': upRes.headers['accept-ranges'] || 'bytes',
                    'X-Drive-Type': driver.driveType
                });
            });
            upstream.on('error', (err: any) => {
                if (!res.headersSent) {
                    res.status(502).json({ success: false, error: `上游网盘流失败: ${err.message}` });
                } else {
                    res.end();
                }
            });
            req.on('close', () => upstream?.destroy?.());
            upstream.pipe(res);
        } catch (err: any) {
            upstream?.destroy?.();
            if (!res.headersSent) {
                res.status(500).json({ success: false, error: err.message });
            }
        }
    });

    return router;
}
