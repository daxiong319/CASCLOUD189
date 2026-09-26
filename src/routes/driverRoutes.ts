import { Router, Request, Response } from 'express';
import { AppDataSource } from '../database';
import { Account } from '../entities';
import { DriverRegistry } from '../drivers/DriverRegistry';
import { CasFileService } from '../services/CasFileService';

/**
 * 多网盘驱动统一 REST API：
 *  GET  /api/drives                     驱动列表与能力
 *  GET  /api/drives/:driveType/health   账号健康检查
 *  GET  /api/drives/health              所有账号巡检
 *  GET  /api/drives/account/:accountId/files?folderId=
 *  POST /api/drives/account/:accountId/folder  { parentFolderId, folderName }
 *  POST /api/drives/account/:accountId/rapid   { targetFolderId, casContent }
 *  GET  /api/drives/account/:accountId/download?fileId=
 *  POST /api/drives/account/:accountId/save-share { shareUrl, targetFolderId }
 */
export function buildDriverRoutes(): Router {
    const router = Router();

    const loadAccount = async (accountId: string) => {
        const repo = AppDataSource.getRepository(Account);
        const account = await repo.findOne({ where: { id: parseInt(accountId, 10) } });
        if (!account) throw new Error('账号不存在');
        return account;
    };

    // 驱动列表（含能力与登录表单字段，供前端动态渲染）
    router.get('/', async (req: Request, res: Response) => {
        res.json({ success: true, data: DriverRegistry.listDrivers() });
    });

    // 全部账号健康巡检
    router.get('/health', async (req: Request, res: Response) => {
        try {
            const repo = AppDataSource.getRepository(Account);
            const accounts = await repo.find();
            const results = [];
            for (const acc of accounts) {
                try {
                    const driver = await DriverRegistry.getDriverForAccount(acc);
                    const health = await driver.checkHealth();
                    results.push({ accountId: acc.id, driveType: (acc as any).driveType || 'cloud189', ...health });
                } catch (err: any) {
                    results.push({ accountId: acc.id, driveType: (acc as any).driveType || 'cloud189', valid: false, message: err.message });
                }
            }
            res.json({ success: true, data: results });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 指定驱动类型健康检查（针对单账号）
    router.get('/:driveType/health', async (req: Request, res: Response) => {
        try {
            const { driveType } = req.params;
            const { accountId } = req.query;
            if (!accountId) return res.status(400).json({ success: false, error: '缺少 accountId' });
            const account = await loadAccount(String(accountId));
            const driver = await DriverRegistry.getDriverForAccount(account);
            if (driver.driveType !== driveType) {
                return res.status(400).json({ success: false, error: `账号类型 ${driver.driveType} 与请求的 ${driveType} 不匹配` });
            }
            res.json({ success: true, data: await driver.checkHealth() });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 列目录
    router.get('/account/:accountId/files', async (req: Request, res: Response) => {
        try {
            const account = await loadAccount(req.params.accountId);
            const driver = await DriverRegistry.getDriverForAccount(account);
            const result = await driver.listFiles({
                folderId: String(req.query.folderId || 'root'),
                limit: parseInt(String(req.query.limit || '100'), 10)
            });
            res.json({ success: true, data: result });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 创建目录
    router.post('/account/:accountId/folder', async (req: Request, res: Response) => {
        try {
            const account = await loadAccount(req.params.accountId);
            const driver = await DriverRegistry.getDriverForAccount(account);
            const { parentFolderId, folderName } = req.body;
            if (!folderName) return res.status(400).json({ success: false, error: '目录名不能为空' });
            const result = await driver.createFolder(parentFolderId || 'root', folderName);
            res.json({ success: true, data: result });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ★ 统一 CAS 秒传入库（V2 清单，支持任意已注册驱动）
    router.post('/account/:accountId/rapid', async (req: Request, res: Response) => {
        try {
            const account = await loadAccount(req.params.accountId);
            const driver = await DriverRegistry.getDriverForAccount(account);
            const { targetFolderId, casContent } = req.body;
            if (!casContent) return res.status(400).json({ success: false, error: 'CAS 内容不能为空' });

            const manifestV2 = CasFileService.parseManifestV2(casContent);
            const metadata = CasFileService.toFileMetadata(manifestV2);
            const result = await driver.rapidUpload(targetFolderId || 'root', metadata);

            res.json({
                success: result.success,
                data: result,
                message: result.message || (result.success
                    ? `${driver.displayName} 秒传成功: ${result.fileName}`
                    : `${driver.displayName} 秒传未命中`)
            });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 获取直链
    router.get('/account/:accountId/download', async (req: Request, res: Response) => {
        try {
            const account = await loadAccount(req.params.accountId);
            const driver = await DriverRegistry.getDriverForAccount(account);
            const { fileId } = req.query;
            if (!fileId) return res.status(400).json({ success: false, error: '缺少 fileId' });
            const result = await driver.getDownloadUrl(String(fileId));
            res.json({ success: true, data: result });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 保存分享链接（驱动支持时）
    router.post('/account/:accountId/save-share', async (req: Request, res: Response) => {
        try {
            const account = await loadAccount(req.params.accountId);
            const driver = await DriverRegistry.getDriverForAccount(account);
            if (!driver.saveShare) {
                return res.status(400).json({ success: false, error: `${driver.displayName} 暂不支持分享转存` });
            }
            const { shareUrl, targetFolderId } = req.body;
            const result = await driver.saveShare(shareUrl, targetFolderId || 'root');
            res.json({ success: true, data: result });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}
