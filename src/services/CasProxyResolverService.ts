import { AppDataSource } from '../database';
import { Account, ProxyFile, Task } from '../entities';
import CasFileService, { CasManifest } from './CasFileService';
import Cloud189RapidUploadService from './Cloud189RapidUploadService';
import CasTempFileDeleteQueueService from './CasTempFileDeleteQueueService';
const { Cloud189Service } = require('./cloud189');
import { logTaskEvent } from '../utils/logUtils';

export class CasProxyResolverService {
    public static async resolveTaskFile(taskId: number, proxyFileId: number): Promise<{ downloadUrl: string; fileName: string } | null> {
        const proxyFileRepo = AppDataSource.getRepository(ProxyFile);
        const taskRepo = AppDataSource.getRepository(Task);
        const accountRepo = AppDataSource.getRepository(Account);

        const proxyFile = await proxyFileRepo.findOne({ where: { id: proxyFileId, taskId } });
        if (!proxyFile) return null;

        const task = await taskRepo.findOne({ where: { id: taskId } });
        if (!task) return null;

        const account = await accountRepo.findOne({ where: { id: task.accountId } });
        if (!account) return null;

        // If it's a CAS file, parse manifest and rapid upload to temporary folder for direct download
        if (proxyFile.isCas && proxyFile.casContent) {
            const manifest = CasFileService.parseManifestText(proxyFile.casContent);
            return await this.resolveProvidedManifest(account, task, manifest);
        }

        return null;
    }

    public static async resolveProvidedManifest(
        account: Account,
        task: Task,
        manifest: CasManifest
    ): Promise<{ downloadUrl: string; fileName: string }> {
        const cloud189 = new Cloud189Service();
        await cloud189.init(account.id);

        const target = {
            client: cloud189.client,
            familyId: account.casFamilyId || account.familyId || undefined
        };

        const targetFolderId = task.targetFolderId || (target.familyId ? account.familyRootFolderId : '-11');

        // 执行秒传入库
        const res = await Cloud189RapidUploadService.rapidUploadManifest(
            target,
            targetFolderId,
            manifest,
            task.id
        );

        // 获取实际可播放下载直链
        let downloadUrl = '';
        if (target.familyId) {
            const fileInfo = await cloud189.client.getFamilyFileDownloadUrl(target.familyId, res.fileId);
            downloadUrl = fileInfo?.downloadUrl || fileInfo?.fileDownloadUrl || '';
        } else {
            const fileInfo = await cloud189.client.getFileDownloadUrl(res.fileId);
            downloadUrl = fileInfo?.downloadUrl || fileInfo?.fileDownloadUrl || '';
        }

        // 注册到后台延时删除队列，播放缓存后自动清理释放空间
        CasTempFileDeleteQueueService.enqueue({
            accountId: account.id,
            fileId: res.fileId,
            fileName: manifest.fileName,
            familyId: target.familyId
        });

        return {
            downloadUrl,
            fileName: manifest.fileName
        };
    }
}

export default CasProxyResolverService;
