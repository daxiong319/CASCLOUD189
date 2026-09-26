import { IDriveDriver, DriveRegistration } from './types';

/**
 * 驱动基类：提供通用能力（HTTP 封装、直链 LRU 缓存、UA/代理设置）。
 * 具体网盘驱动继承本类并实现 IDriveDriver 接口。
 */
export abstract class BaseDriveDriver implements IDriveDriver {
    abstract readonly driveType: import('./types').DriveType;
    abstract readonly displayName: string;

    /** 账号原始数据 */
    protected account: any;

    /** 直链内存缓存: fileId -> { url, expireAt } */
    protected static urlCache = new Map<string, { url: string; expireAt: number; headers?: Record<string, string> }>();

    /** 缓存提前刷新窗口（毫秒）：直链过期前 5 分钟主动换新 */
    protected static readonly URL_REFRESH_AHEAD_MS = 5 * 60 * 1000;

    async init(account: any): Promise<boolean> {
        this.account = account;
        return true;
    }

    abstract checkHealth(): Promise<import('./types').DriveHealth>;
    abstract listFiles(params: import('./types').ListFilesParams): Promise<import('./types').ListFilesResult>;
    abstract createFolder(parentFolderId: string, folderName: string): Promise<import('./types').CreateFolderResult>;
    abstract deleteFile(fileId: string): Promise<boolean>;
    abstract rapidUpload(targetFolderId: string, meta: import('./types').FileMetadata): Promise<import('./types').RapidUploadResult>;
    abstract getDownloadUrl(fileId: string): Promise<import('./types').DownloadUrlResult>;

    /**
     * 带缓存的直链获取：命中且未临近过期直接返回，否则调 doGetDownloadUrl 换新。
     */
    protected async getCachedDownloadUrl(
        fileId: string,
        doGet: () => Promise<import('./types').DownloadUrlResult>,
        defaultTtlMs: number = 30 * 60 * 1000
    ): Promise<import('./types').DownloadUrlResult> {
        const cacheKey = `${this.driveType}:${fileId}`;
        const cached = BaseDriveDriver.urlCache.get(cacheKey);
        const now = Date.now();

        if (cached && cached.expireAt - BaseDriveDriver.URL_REFRESH_AHEAD_MS > now) {
            return { url: cached.url, expireAt: cached.expireAt, headers: cached.headers };
        }

        const fresh = await doGet();
        const ttl = fresh.expireAt && fresh.expireAt > now
            ? fresh.expireAt - now
            : defaultTtlMs;
        BaseDriveDriver.urlCache.set(cacheKey, {
            url: fresh.url,
            expireAt: now + ttl,
            headers: fresh.headers
        });
        return fresh;
    }

    /** 清理过期直链缓存（可由定时任务周期调用） */
    static purgeExpiredUrlCache(): number {
        const now = Date.now();
        let removed = 0;
        for (const [k, v] of BaseDriveDriver.urlCache) {
            if (v.expireAt <= now) {
                BaseDriveDriver.urlCache.delete(k);
                removed++;
            }
        }
        return removed;
    }
}
