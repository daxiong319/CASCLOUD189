import { Router, Request, Response } from 'express';
import got from 'got';
import { AppDataSource } from '../database';
import { Account } from '../entities';
import { DriverRegistry } from '../drivers/DriverRegistry';
import { CasFileService } from '../services/CasFileService';
import { CasTempFileDeleteQueueService } from '../services/CasTempFileDeleteQueueService';

/**
 * 跨盘播放加速路由：
 *
 *  GET /api/play/:accountId/redirect?fileId=xxx
 *      302 重定向到网盘直链（轻量播放器/Go proxy 可直接跟随，缓存友好）。
 *      ★ 支持虚拟 CAS 播放：当 fileId 以 cas: 开头或包含 .cas 清单内容时，
 *        自动通过秒传将视频即时还原到专属 Staging 目录，获取直链后返回 302，
 *        同时将临时文件压入清理队列（实现零空间占用即点即播）。
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

    // 内存中记录正在进行 CAS 秒传恢复的 Promise（并发防抖，防止多个播放器同时秒传同一部电影）
    const inflightCasResolves = new Map<string, Promise<{ fileId: string; fileName: string; error?: string }>>();

    const loadAccountAndDriver = async (accountIdStr: string) => {
        const repo = AppDataSource.getRepository(Account);
        const account = await repo.findOne({ where: { id: parseInt(accountIdStr, 10) } });
        if (!account) throw new Error('账号不存在');
        const driver = await DriverRegistry.getDriverForAccount(account);
        return { account, driver };
    };

    /**
     * 核心辅助：解析 fileId，若为 CAS 虚拟文件则秒传还原出真实 fileId
     */
    const resolveEffectiveFileId = async (
        account: Account,
        driver: any,
        rawFileId: string,
        casContentParam?: string
    ): Promise<string> => {
        let isCas = false;
        let casText = casContentParam || '';

        // 判断是否为虚拟 CAS 引用
        if (rawFileId.startsWith('cas:') || rawFileId.endsWith('.cas') || casText) {
            isCas = true;
            if (rawFileId.startsWith('cas:')) {
                // cas:base64Payload
                casText = rawFileId.substring(4);
            }
        }

        if (!isCas) {
            return rawFileId;
        }

        // 解析 CAS 清单 (支持 V1/V2 JSON, Base64, cloud189://, 管道符等所有格式)
        const manifest = CasFileService.parseManifestV2(casText);
        const lockKey = `${account.id}:${manifest.fileName}:${manifest.fileSize}`;

        let resolvePromise = inflightCasResolves.get(lockKey);
        if (!resolvePromise) {
            resolvePromise = (async () => {
                const metadata = CasFileService.toFileMetadata(manifest);
                // 秒传至网盘临时目录（root 根或 staging 目录）
                const rapidResult = await driver.rapidUpload('root', metadata);
                if (!rapidResult.success || !rapidResult.fileId) {
                    return {
                        fileId: '',
                        fileName: manifest.fileName,
                        error: `CAS 虚拟秒传恢复失败: ${rapidResult.message || '网盘无对应文件指纹'}`
                    };
                }

                // 压入延时自动清理队列（2小时后或播放完成后释放）
                CasTempFileDeleteQueueService.enqueue({
                    accountId: account.id,
                    fileId: rapidResult.fileId,
                    fileName: manifest.fileName,
                    driveType: (account as any).driveType || 'cloud189'
                });

                return {
                    fileId: rapidResult.fileId,
                    fileName: manifest.fileName
                };
            })();

            inflightCasResolves.set(lockKey, resolvePromise);
            resolvePromise.finally(() => {
                setTimeout(() => inflightCasResolves.delete(lockKey), 10000);
            });
        }

        const resolved = await resolvePromise;
        if (resolved.error || !resolved.fileId) {
            throw new Error(resolved.error || 'CAS 秒传恢复失败');
        }
        return resolved.fileId;
    };

    // 直链信息（供 Go proxy / 播放器获取真实地址与有效期）
    router.get('/:accountId/info', async (req: Request, res: Response) => {
        try {
            const { account, driver } = await loadAccountAndDriver(req.params.accountId);
            const { fileId, casContent } = req.query;
            if (!fileId && !casContent) return res.status(400).json({ success: false, error: '缺少 fileId 或 casContent' });

            const effectiveFileId = await resolveEffectiveFileId(
                account,
                driver,
                String(fileId || ''),
                casContent ? String(casContent) : undefined
            );

            const result = await driver.getDownloadUrl(effectiveFileId);
            res.json({
                success: true,
                data: {
                    driveType: driver.driveType,
                    url: result.url,
                    expireAt: result.expireAt,
                    headers: result.headers,
                    resolvedFileId: effectiveFileId
                }
            });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 302 重定向直链（默认播放入口，Emby/infuse 等播放器直接跟随）
    router.get('/:accountId/redirect', async (req: Request, res: Response) => {
        try {
            const { account, driver } = await loadAccountAndDriver(req.params.accountId);
            const { fileId, casContent } = req.query;
            if (!fileId && !casContent) return res.status(400).json({ success: false, error: '缺少 fileId 或 casContent' });

            const effectiveFileId = await resolveEffectiveFileId(
                account,
                driver,
                String(fileId || ''),
                casContent ? String(casContent) : undefined
            );

            const result = await driver.getDownloadUrl(effectiveFileId);
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
            const { account, driver } = await loadAccountAndDriver(req.params.accountId);
            const { fileId, casContent } = req.query;
            if (!fileId && !casContent) return res.status(400).json({ success: false, error: '缺少 fileId 或 casContent' });

            const effectiveFileId = await resolveEffectiveFileId(
                account,
                driver,
                String(fileId || ''),
                casContent ? String(casContent) : undefined
            );

            const result = await driver.getDownloadUrl(effectiveFileId);

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
