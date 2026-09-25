import { Router, Request, Response } from 'express';
import { AppDataSource } from '../database';
import { EmbyLibrary, EmbyUser } from '../entities';
import { hashPassword } from './password';

export function buildAdminRouter(): Router {
    const router = Router();

    // 媒体库列表
    router.get('/api/emby/libraries', async (req: Request, res: Response) => {
        try {
            const repo = AppDataSource.getRepository(EmbyLibrary);
            const list = await repo.find({ order: { sort: 'ASC', id: 'ASC' } });
            res.json({ success: true, data: list });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 创建媒体库
    router.post('/api/emby/libraries', async (req: Request, res: Response) => {
        try {
            const { name, collectionType, sourceType, primaryImage, backdropImage } = req.body;
            if (!name) return res.status(400).json({ success: false, error: '名称不能为空' });
            const repo = AppDataSource.getRepository(EmbyLibrary);
            const lib = repo.create({
                name,
                collectionType: collectionType || 'movies',
                sourceType: sourceType || 'custom',
                primaryImage,
                backdropImage,
                isActive: true
            });
            await repo.save(lib);
            res.json({ success: true, data: lib });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 更新媒体库
    router.put('/api/emby/libraries/:id', async (req: Request, res: Response) => {
        try {
            const id = parseInt(req.params.id, 10);
            const repo = AppDataSource.getRepository(EmbyLibrary);
            await repo.update(id, req.body);
            res.json({ success: true });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 用户列表
    router.get('/api/emby/users', async (req: Request, res: Response) => {
        try {
            const repo = AppDataSource.getRepository(EmbyUser);
            const list = await repo.find({ order: { createdAt: 'ASC' } });
            res.json({ success: true, data: list.map(u => ({ id: u.id, username: u.username, isDisabled: u.isDisabled, createdAt: u.createdAt })) });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 创建用户
    router.post('/api/emby/users', async (req: Request, res: Response) => {
        try {
            const { username, password } = req.body;
            if (!username) return res.status(400).json({ success: false, error: '用户名不能为空' });
            const repo = AppDataSource.getRepository(EmbyUser);
            const pwdHash = password ? hashPassword(password) : null;
            const user = repo.create({
                username,
                passwordHash: pwdHash || undefined,
                isDisabled: false
            });
            await repo.save(user);
            res.json({ success: true, data: { id: user.id, username: user.username } });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 初始化默认管理员用户和媒体库
    router.post('/api/emby/bootstrap', async (req: Request, res: Response) => {
        try {
            const userRepo = AppDataSource.getRepository(EmbyUser);
            const libRepo = AppDataSource.getRepository(EmbyLibrary);

            const userCount = await userRepo.count();
            if (userCount === 0) {
                const defaultUser = userRepo.create({
                    username: 'emby',
                    passwordHash: undefined,
                    isDisabled: false
                });
                await userRepo.save(defaultUser);
            }

            const libCount = await libRepo.count();
            if (libCount === 0) {
                await libRepo.save([
                    libRepo.create({ name: '电影', collectionType: 'movies', isActive: true, sort: 1 }),
                    libRepo.create({ name: '电视剧', collectionType: 'tvshows', isActive: true, sort: 2 })
                ]);
            }

            res.json({ success: true, message: '初始化成功' });
        } catch (err: any) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    return router;
}
