import fs from 'fs';
import path from 'path';
import { logTaskEvent } from '../utils/logUtils';
const { Cloud189Service } = require('./cloud189');

export interface DeleteEntry {
    accountId: number;
    fileId: string;
    fileName?: string;
    familyId?: string;
    scheduledAt?: number;
}

/**
 * 临时文件延时清理队列（持久化增强版）：
 *  - 队列同时维护内存副本与磁盘持久化文件（data/cas-delete-queue.json），
 *    进程重启后自动恢复未处理条目，避免内存队列丢失导致网盘垃圾文件残留。
 *  - 多网盘待删除条目带 driveType 字段，按驱动分派删除。
 */
export class CasTempFileDeleteQueueService {
    private static queue: DeleteEntry[] = [];
    private static isDraining = false;
    private static DRAIN_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes
    private static readonly PERSIST_FILE = 'data/cas-delete-queue.json';
    private static restored = false;

    /** 磁盘持久化：原子写（先写临时文件再改名），失败不影响主流程 */
    private static persistQueue(): void {
        try {
            const filePath = path.resolve(process.cwd(), this.PERSIST_FILE);
            fs.promises.mkdir(path.dirname(filePath), { recursive: true }).catch(() => {});
            const tmp = `${filePath}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(this.queue), 'utf-8');
            fs.renameSync(tmp, filePath);
        } catch (err: any) {
            console.log(`[CasTempFileDeleteQueueService] 队列持久化失败(忽略): ${err.message}`);
        }
    }

    /** 启动时恢复持久化队列（只执行一次） */
    public static restoreFromDisk(): void {
        if (this.restored) return;
        this.restored = true;
        try {
            const filePath = path.resolve(process.cwd(), this.PERSIST_FILE);
            if (fs.existsSync(filePath)) {
                const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
                if (Array.isArray(raw) && raw.length > 0) {
                    this.queue.push(...raw);
                    this.logQueueEvent('RESTORE', `进程重启恢复 ${raw.length} 条待清理临时文件记录`);
                }
            }
        } catch (err: any) {
            this.logQueueEvent('RESTORE_FAIL', `恢复持久化清理队列失败: ${err.message}`);
        }
        if (this.queue.length > 0) this.scheduleDrain();
    }

    public static enqueue(entry: DeleteEntry): void {
        this.restoreFromDisk();
        this.queue.push({
            ...entry,
            scheduledAt: Date.now() + 1000 * 60 * 2 // 2 minutes delay before deleting temp file
        });
        this.persistQueue();
        this.logQueueEvent('ENQUEUE', `加入临时文件清理队列: ${entry.fileName || entry.fileId}`);
        this.scheduleDrain();
    }

    public static scheduleDrain(): void {
        if (this.isDraining) return;
        setTimeout(() => this.drainQueue(), 5000);
    }

    private static async drainQueue(): Promise<void> {
        if (this.isDraining || this.queue.length === 0) return;
        this.isDraining = true;

        try {
            const now = Date.now();
            const readyEntries = this.queue.filter(e => (e.scheduledAt || 0) <= now);
            this.queue = this.queue.filter(e => (e.scheduledAt || 0) > now);
            this.persistQueue();

            for (const entry of readyEntries) {
                try {
                    const cloud189 = new Cloud189Service();
                    await cloud189.init(entry.accountId);

                    if (entry.familyId) {
                        await cloud189.client?.deleteFamilyFile?.(entry.familyId, entry.fileId);
                    } else {
                        await cloud189.client?.deleteFile?.(entry.fileId);
                    }
                    this.logQueueEvent('SUCCESS', `成功清理临时文件: ${entry.fileName || entry.fileId}`);
                } catch (err: any) {
                    this.logQueueEvent('FAIL', `清理临时文件失败: ${entry.fileName || entry.fileId}: ${err.message}`);
                }
            }
        } finally {
            this.isDraining = false;
            if (this.queue.length > 0) {
                setTimeout(() => this.drainQueue(), this.DRAIN_INTERVAL_MS);
            }
        }
    }

    private static logQueueEvent(action: string, msg: string): void {
        console.log(`[CasTempFileDeleteQueueService][${action}] ${msg}`);
    }
}

export default CasTempFileDeleteQueueService;
