import { logTaskEvent } from '../utils/logUtils';
const { Cloud189Service } = require('./cloud189');

export interface DeleteEntry {
    accountId: number;
    fileId: string;
    fileName?: string;
    familyId?: string;
    scheduledAt?: number;
}

export class CasTempFileDeleteQueueService {
    private static queue: DeleteEntry[] = [];
    private static isDraining = false;
    private static DRAIN_INTERVAL_MS = 1000 * 60 * 5; // 5 minutes

    public static enqueue(entry: DeleteEntry): void {
        this.queue.push({
            ...entry,
            scheduledAt: Date.now() + 1000 * 60 * 2 // 2 minutes delay before deleting temp file
        });
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
