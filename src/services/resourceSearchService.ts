import PanSouService from './pansouService';
import { AppDataSource } from '../database';
import { Task } from '../entities';

export class ResourceSearchService {
    public static async searchCloudResources(keyword: string): Promise<any[]> {
        const results: any[] = [];
        const cleanKw = (keyword || '').trim();
        if (!cleanKw) return results;

        // 1. 本地已有任务检索
        try {
            const taskRepo = AppDataSource.getRepository(Task);
            const tasks = await taskRepo
                .createQueryBuilder('task')
                .where('task.resourceName LIKE :kw OR task.shareFolderName LIKE :kw', { kw: `%${cleanKw}%` })
                .take(20)
                .getMany();

            for (const t of tasks) {
                results.push({
                    title: t.resourceName || t.shareFolderName || `Task #${t.id}`,
                    url: t.shareLink,
                    source: '本地任务',
                    id: t.id
                });
            }
        } catch (_) {}

        // 2. 外部盘搜检索
        try {
            const pansouResults = await PanSouService.getTianyiLinks(cleanKw);
            for (const item of pansouResults) {
                results.push({
                    title: item.title || item.name || cleanKw,
                    url: item.url || item.link,
                    source: '盘搜',
                    images: item.image || item.poster || null
                });
            }
        } catch (_) {}

        // 3. 去重
        const seen = new Set<string>();
        return results.filter(r => {
            if (!r.url || seen.has(r.url)) return false;
            seen.add(r.url);
            return true;
        });
    }
}

export default ResourceSearchService;
