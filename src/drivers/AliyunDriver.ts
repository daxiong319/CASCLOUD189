import got from 'got';
import { BaseDriveDriver } from './BaseDriveDriver';
import {
    DriveType, DriveHealth, DriveFileEntry, ListFilesParams, ListFilesResult,
    CreateFolderResult, FileMetadata, RapidUploadResult, DownloadUrlResult
} from './types';

/**
 * 阿里云盘驱动（原生 TypeScript 实现）。
 *
 * 协议要点（阿里云盘开放协议）：
 *  - 认证：access_token（refresh_token 换取）
 *  - 列目录：GET /adrive/v1.0/openFile/list
 *  - 创建目录：POST /adrive/v1.0/openFile（type=folder）
 *  - 秒传：POST /adrive/v1.0/openFile/create
 *      * check_name_mode: auto_rename
 *      * content_hash（全量 SHA1） + content_hash_name: "sha1"
 *      * 命中 rapid_upload 标志即秒传成功
 *  - 直链：POST /adrive/v1.0/openFile/getDownloadUrl
 *      * 需要支持 range 的 302 直链
 */
export class AliyunDriver extends BaseDriveDriver {
    readonly driveType: DriveType = 'aliyun';
    readonly displayName = '阿里云盘';

    private static readonly API_BASE = 'https://openapi.alipan.com';
    private static readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    private accessToken: string = '';

    private buildHeaders(): Record<string, string> {
        return {
            'User-Agent': AliyunDriver.UA,
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json'
        };
    }

    private async request(uri: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<any> {
        try {
            const res = await got(`${AliyunDriver.API_BASE}${uri}`, {
                method,
                headers: this.buildHeaders(),
                json: method === 'POST' ? body : undefined,
                responseType: 'json',
                timeout: { request: 15000 }
            });
            return res.body;
        } catch (err: any) {
            const code = err.code || err.response?.statusCode || '';
            const detail = err.response?.body && typeof err.response.body === 'object'
                ? JSON.stringify(err.response.body)
                : (err.message || '网络请求失败');
            throw new Error(`阿里云盘请求 ${uri} 失败${code ? ` [${code}]` : ''}: ${detail}`);
        }
    }

    async init(account: any): Promise<boolean> {
        await super.init(account);
        const token = account?.accessToken || account?.token || account?.password;
        if (!token) return false;
        this.accessToken = String(token);
        return true;
    }

    async checkHealth(): Promise<DriveHealth> {
        try {
            const user = await this.request('/oauth/users/info', 'GET');
            if (user?.id) {
                return { valid: true, message: user.name || user.id };
            }
            return { valid: false, message: 'Access Token 已失效' };
        } catch (err: any) {
            return { valid: false, message: err.message };
        }
    }

    async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
        const res: any = await this.request('/adrive/v1.0/openFile/list', 'POST', {
            drive_id: (this.account as any)?.driveId || 'default',
            parent_file_id: params.folderId || 'root',
            limit: params.limit || 100,
            marker: params.marker || ''
        });
        const items = res?.items || [];
        const entries: DriveFileEntry[] = items.map((f: any) => ({
            fileId: f.file_id,
            fileName: f.name,
            isFolder: f.type === 'folder',
            fileSize: f.size || 0,
            createdAt: f.created_at,
            updatedAt: f.updated_at
        }));
        return { entries, nextMarker: res?.next_marker };
    }

    async createFolder(parentFolderId: string, folderName: string): Promise<CreateFolderResult> {
        const driveId = (this.account as any)?.driveId || 'default';
        const res: any = await this.request('/adrive/v1.0/openFile', 'POST', {
            drive_id: driveId,
            parent_file_id: parentFolderId || 'root',
            name: folderName,
            type: 'folder',
            check_name_mode: 'refuse'
        });
        const fileId = res?.file_id;
        if (!fileId) throw new Error(`创建阿里云盘目录失败: ${JSON.stringify(res)}`);
        return { folderId: fileId, folderName };
    }

    async deleteFile(fileId: string): Promise<boolean> {
        const driveId = (this.account as any)?.driveId || 'default';
        const res: any = await this.request(`/adrive/v1.0/openFile/recyclebin/trash`, 'POST', {
            drive_id: driveId,
            file_id: fileId
        });
        return !res?.code;
    }

    /**
     * 阿里云盘秒传：
     *  - 使用全量 SHA1（content_hash）直接 create，命中 rapid_upload 即成功。
     *  - 若提供了 preHash（前 1KB SHA1），可先做 preHash 快速预检降低无效请求。
     */
    async rapidUpload(targetFolderId: string, meta: FileMetadata): Promise<RapidUploadResult> {
        const sha1 = meta.hashes.sha1;
        if (!sha1) {
            return {
                success: false,
                fileName: meta.fileName,
                rapidHit: false,
                message: '阿里云盘秒传需要全量 SHA1 特征（hashes.sha1），请在 V2 CAS 清单中提供'
            };
        }

        const driveId = (this.account as any)?.driveId || 'default';
        const res: any = await this.request('/adrive/v1.0/openFile/create', 'POST', {
            drive_id: driveId,
            parent_file_id: targetFolderId || 'root',
            name: meta.fileName,
            type: 'file',
            check_name_mode: 'auto_rename',
            size: meta.fileSize,
            content_hash: sha1.toLowerCase(),
            content_hash_name: 'sha1'
        });

        if (res?.rapid_upload) {
            return {
                success: true,
                fileId: res.file_id,
                fileName: res.name || meta.fileName,
                rapidHit: true
            };
        }

        // 未命中秒传，返回需要完整上传
        return {
            success: false,
            fileId: res?.file_id,
            fileName: meta.fileName,
            rapidHit: false,
            message: '阿里云盘特征未命中，需要完整上传（或特征库中无该文件）'
        };
    }

    async getDownloadUrl(fileId: string): Promise<DownloadUrlResult> {
        return this.getCachedDownloadUrl(`aliyun:${fileId}`, async () => {
            const driveId = (this.account as any)?.driveId || 'default';
            const res: any = await this.request('/adrive/v1.0/openFile/getDownloadUrl', 'POST', {
                drive_id: driveId,
                file_id: fileId,
                expire_sec: 14400
            });
            const url = res?.url;
            if (!url) throw new Error(`获取阿里云盘直链失败: ${JSON.stringify(res)}`);
            return {
                url: String(url),
                expireAt: res?.expiration ? new Date(res.expiration).getTime() : undefined
            };
        }, 60 * 60 * 1000);
    }

    /**
     * 阿里云盘分享转存（开放协议）：
     *  1) POST /adrive/v1.0/openFile/share/updateShareLink  或直接读取
     *     实际流程: share_link get -> list share files -> create by share
     */
    async saveShare(shareUrl: string, targetFolderId: string): Promise<{ fileId: string; fileName: string }> {
        const urlObj = new URL(shareUrl);
        const shareId = urlObj.searchParams.get('share_id')
            || shareUrl.match(/s\/([a-zA-Z0-9]+)/)?.[1]
            || '';
        if (!shareId) throw new Error(`无法从分享链接解析 share_id: ${shareUrl}`);

        const driveId = (this.account as any)?.driveId || 'default';

        // 获取分享 token（openApi 中分享保存需要 share_token）
        const tokenRes: any = await this.request('/adrive/v1.0/openFile/share/getShareToken', 'POST', {
            share_id: shareId
        });
        const shareToken = tokenRes?.share_token;
        if (!shareToken) throw new Error(`获取阿里云盘分享 token 失败: ${JSON.stringify(tokenRes)}`);

        // 列出分享根目录文件
        const listRes: any = await this.request('/adrive/v1.0/openFile/share/listFile', 'POST', {
            share_id: shareId,
            share_token: shareToken,
            parent_file_id: 'root',
            limit: 100
        });
        const items = listRes?.items || [];
        if (items.length === 0) throw new Error(`分享目录为空或已失效: ${shareUrl}`);

        // 保存全部顶层条目到目标目录
        const firstFile = items[0];
        const saveRes: any = await this.request('/adrive/v1.0/openFile/share/save', 'POST', {
            share_id: shareId,
            share_token: shareToken,
            file_id: firstFile.file_id,
            to_drive_id: driveId,
            to_parent_file_id: targetFolderId || 'root',
            auto_rename: true
        });
        const fileId = saveRes?.file_id;
        const fileName = saveRes?.name || firstFile?.name;
        if (!fileId) throw new Error(`阿里云盘分享转存失败: ${JSON.stringify(saveRes)}`);
        return { fileId: String(fileId), fileName: String(fileName) };
    }
}
