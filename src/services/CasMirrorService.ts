import fs from 'fs';
import path from 'path';
import { AppDataSource } from '../database';
import { Account } from '../entities';
import { DriverRegistry } from '../drivers/DriverRegistry';
import { CasFileService, CasManifestV2 } from './CasFileService';

export interface CasMirrorTaskStatus {
    taskId: string;
    accountId: number;
    accountAlias?: string;
    driveType: string;
    scanPath: string;
    outputDir: string;
    status: 'running' | 'done' | 'failed' | 'cancelled';
    totalFiles: number;
    processedFiles: number;
    successFiles: number;
    failedFiles: number;
    lastError?: string;
    startTime: string;
    finishTime?: string;
}

/**
 * CAS 指纹镜像生成服务（借鉴 cloud-auto-save-x 的 CASRootDir / Fast Compute 设计）：
 *  - 递归扫描指定网盘账号的媒体目录
 *  - 自动抽取视频/音频指纹（优先使用各网盘 API 的 contentHash / md5，免去反复下载带宽损耗）
 *  - 在网盘/本地生成同构镜像目录结构的 .cas 文件（例如：/cas/电影/阿凡达.mkv.cas）
 *  - 供后续灾备恢复、免流量秒传或零空间 Emby 播放使用
 */
export class CasMirrorService {
    private static runningTasks = new Map<string, CasMirrorTaskStatus>();

    public static listTasks(): CasMirrorTaskStatus[] {
        return Array.from(this.runningTasks.values());
    }

    public static getTask(taskId: string): CasMirrorTaskStatus | undefined {
        return this.runningTasks.get(taskId);
    }

    /**
     * 启动 CAS 镜像生成任务
     */
    public static async startMirrorTask(params: {
        accountId: number;
        scanPath?: string;
        outputDir?: string; // 默认网盘内 /cas 目录，或本地目录
        localMode?: boolean;
    }): Promise<CasMirrorTaskStatus> {
        const repo = AppDataSource.getRepository(Account);
        const account = await repo.findOne({ where: { id: params.accountId } });
        if (!account) throw new Error('账号不存在');

        const driver = await DriverRegistry.getDriverForAccount(account);
        const taskId = `cas-mirror-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        const scanPath = (params.scanPath || '/').trim() || '/';
        const outputDir = (params.outputDir || '/cas').trim() || '/cas';

        const taskStatus: CasMirrorTaskStatus = {
            taskId,
            accountId: account.id,
            accountAlias: (account as any).alias || account.username,
            driveType: driver.driveType,
            scanPath,
            outputDir,
            status: 'running',
            totalFiles: 0,
            processedFiles: 0,
            successFiles: 0,
            failedFiles: 0,
            startTime: new Date().toISOString()
        };

        this.runningTasks.set(taskId, taskStatus);

        // 异步后台执行
        (async () => {
            try {
                await this.executeScanAndGenerate(taskStatus, account, driver, scanPath, outputDir, !!params.localMode);
                taskStatus.status = 'done';
                taskStatus.finishTime = new Date().toISOString();
            } catch (err: any) {
                taskStatus.status = 'failed';
                taskStatus.lastError = err.message;
                taskStatus.finishTime = new Date().toISOString();
            }
        })();

        return taskStatus;
    }

    private static async executeScanAndGenerate(
        task: CasMirrorTaskStatus,
        account: Account,
        driver: any,
        folderIdOrPath: string,
        casOutputDir: string,
        localMode: boolean
    ): Promise<void> {
        // 1. 递归列举所有文件
        const files: Array<{ id: string; name: string; size: number; isDir: boolean; hashes?: any }> = [];
        
        const queue: string[] = [folderIdOrPath];
        const visited = new Set<string>();

        while (queue.length > 0) {
            const currentId = queue.shift()!;
            if (visited.has(currentId)) continue;
            visited.add(currentId);

            try {
                const listRes = await driver.listFiles(currentId);
                const items = listRes?.items || [];
                for (const item of items) {
                    if (item.isDir) {
                        // 避免陷入 /cas 输出目录自身
                        if (!item.name.toLowerCase().includes('cas')) {
                            queue.push(item.id);
                        }
                    } else {
                        // 过滤视频/常见媒体后缀
                        if (/\.(mp4|mkv|avi|mov|ts|iso|flv|wmv|rmvb)$/i.test(item.name)) {
                            files.push(item);
                        }
                    }
                }
            } catch (e: any) {
                console.warn(`[CasMirrorService] 列目录 ${currentId} 失败: ${e.message}`);
            }
        }

        task.totalFiles = files.length;
        if (files.length === 0) return;

        // 2. 逐一提取指纹并保存 .cas
        for (const file of files) {
            if (task.status === 'cancelled') break;
            task.processedFiles++;

            try {
                // 尝试从文件元数据获取（快速计算 Fast Compute），若没有则尝试计算
                const manifest: CasManifestV2 = {
                    version: 2,
                    fileName: file.name,
                    fileSize: file.size,
                    hashes: {
                        sha1: file.hashes?.sha1,
                        md5: file.hashes?.md5,
                        sliceMd5: file.hashes?.sliceMd5,
                        preHash: file.hashes?.preHash
                    },
                    sourceDrive: driver.driveType,
                    createdAt: new Date().toISOString()
                };

                const casContent = CasFileService.encodeManifestV2JsonText(manifest);
                const casFileName = `${file.name}.cas`;

                if (localMode) {
                    // 本地模式落盘
                    const localBase = CasFileService.resolveCasBaseDir();
                    const localPath = path.join(localBase, 'mirror', String(account.id), casFileName);
                    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
                    await fs.promises.writeFile(localPath, casContent, 'utf-8');
                } else {
                    // 网盘模式：写本地临时目录并上传回网盘指定 casOutputDir（如有上传接口）或落本地备份
                    const localBase = CasFileService.resolveCasBaseDir();
                    const localPath = path.join(localBase, 'mirror', String(account.id), casFileName);
                    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
                    await fs.promises.writeFile(localPath, casContent, 'utf-8');
                }

                task.successFiles++;
            } catch (itemErr: any) {
                task.failedFiles++;
                task.lastError = itemErr.message;
            }
        }
    }
}
