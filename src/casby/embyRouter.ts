import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { AppDataSource } from '../database';
import { EmbyLibrary, EmbyPlaybackState, EmbyToken, EmbyUser, Task } from '../entities';
import { attachUserContext, requireCasbyUser } from './auth';
import { verifyPassword } from './password';
import {
    buildAuthenticationResult,
    buildBrandingConfiguration,
    buildItemsResponse,
    buildPublicSystemInfo,
    buildViewsResponse,
    nowIso
} from './embyResponses';

export function buildEmbyRouter(): Router {
    const router = Router();

    // 挂载鉴权中间件
    router.use(attachUserContext());

    const SERVER_ID = crypto.createHash('md5').update('CASCLOUD189-Casby-Server').digest('hex');
    const SERVER_NAME = 'Casby Media Server';
    const VERSION = '1.1.32';

    // 1. 公开系统信息与配置
    router.get('/System/Info/Public', (req: Request, res: Response) => {
        res.json(buildPublicSystemInfo({
            serverName: SERVER_NAME,
            serverId: SERVER_ID,
            version: VERSION,
            baseUrl: `${req.protocol}://${req.get('host')}`
        }));
    });

    router.get('/System/Ping', (req: Request, res: Response) => {
        res.send('true');
    });

    router.get('/Branding/Configuration', (req: Request, res: Response) => {
        res.json(buildBrandingConfiguration(SERVER_NAME));
    });

    router.get('/Localization/Options', (req: Request, res: Response) => {
        res.json([
            { Name: 'Chinese', Value: 'zh-CN' },
            { Name: 'English', Value: 'en-US' }
        ]);
    });

    // 2. 用户公开信息与认证
    router.get('/Users/Public', async (req: Request, res: Response) => {
        try {
            const userRepo = AppDataSource.getRepository(EmbyUser);
            const users = await userRepo.find({ where: { isDisabled: false } });
            res.json(users.map(u => ({
                Name: u.username,
                Id: u.id,
                HasPassword: !!u.passwordHash
            })));
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    router.post('/Users/AuthenticateByName', async (req: Request, res: Response) => {
        try {
            const { Username, Pw, Password } = req.body;
            const pwd = Pw || Password || '';
            const userRepo = AppDataSource.getRepository(EmbyUser);
            const tokenRepo = AppDataSource.getRepository(EmbyToken);

            const user = await userRepo.findOne({ where: { username: Username, isDisabled: false } });
            if (!user) {
                return res.status(401).json({ error: 'User not found' });
            }

            if (user.passwordHash) {
                const ok = verifyPassword(pwd, user.passwordHash);
                if (!ok) {
                    return res.status(401).json({ error: 'Password incorrect' });
                }
            }

            const tokenStr = crypto.randomUUID();
            await tokenRepo.save(tokenRepo.create({
                token: tokenStr,
                userId: user.id,
                lastUsedAt: new Date()
            }));

            res.json(buildAuthenticationResult({
                user: { id: user.id, username: user.username },
                token: tokenStr,
                serverId: SERVER_ID
            }));
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // 3. 用户主视图 (Views / UserViews)
    router.get(['/Users/:userId/Views', '/UserViews'], requireCasbyUser, async (req: Request, res: Response) => {
        try {
            const libRepo = AppDataSource.getRepository(EmbyLibrary);
            const libs = await libRepo.find({ where: { isActive: true }, order: { sort: 'ASC' } });

            const items = libs.map(l => ({
                Name: l.name,
                ServerId: SERVER_ID,
                Id: `l_${l.id}`,
                CollectionType: l.collectionType || 'movies',
                Type: 'CollectionFolder',
                IsFolder: true
            }));

            res.json(buildViewsResponse(items));
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // 4. Items 列表与查询
    router.get(['/Users/:userId/Items', '/Items'], requireCasbyUser, async (req: Request, res: Response) => {
        try {
            const parentId = String(req.query.ParentId || '');
            const startIndex = parseInt(String(req.query.StartIndex || '0'), 10);
            const limit = parseInt(String(req.query.Limit || '50'), 10);

            const taskRepo = AppDataSource.getRepository(Task);
            const [tasks, total] = await taskRepo.findAndCount({
                skip: startIndex,
                take: limit,
                order: { createdAt: 'DESC' }
            });

            const items = tasks.map(t => ({
                Name: t.resourceName || `Task_${t.id}`,
                ServerId: SERVER_ID,
                Id: `m_${t.id}`,
                Type: t.videoType === 'tv' ? 'Series' : 'Movie',
                IsFolder: t.isFolder,
                ProductionYear: t.year ? parseInt(t.year, 10) : undefined
            }));

            res.json(buildItemsResponse(items, startIndex, total, SERVER_ID));
        } catch (err: any) {
            res.status(500).json({ error: err.message });
        }
    });

    // 5. 播放状态报告与进度更新
    router.post('/Sessions/Playing', requireCasbyUser, (req: Request, res: Response) => {
        res.status(204).end();
    });

    router.post('/Sessions/Playing/Progress', requireCasbyUser, async (req: Request, res: Response) => {
        try {
            const { ItemId, PositionTicks } = req.body;
            const userId = req.casby?.user?.id;
            if (userId && ItemId) {
                const pbRepo = AppDataSource.getRepository(EmbyPlaybackState);
                let state = await pbRepo.findOne({ where: { userId, itemId: ItemId } });
                if (!state) {
                    state = pbRepo.create({ userId, itemId: ItemId });
                }
                state.positionTicks = PositionTicks || 0;
                state.lastPlayedAt = new Date();
                await pbRepo.save(state);
            }
            res.status(204).end();
        } catch (_) {
            res.status(204).end();
        }
    });

    router.post('/Sessions/Playing/Stopped', requireCasbyUser, (req: Request, res: Response) => {
        res.status(204).end();
    });

    return router;
}
