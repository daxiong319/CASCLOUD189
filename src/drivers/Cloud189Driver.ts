import { BaseDriveDriver } from './BaseDriveDriver';
import {
    DriveType, DriveHealth, DriveFileEntry, ListFilesParams, ListFilesResult,
    CreateFolderResult, FileMetadata, RapidUploadResult, DownloadUrlResult
} from './types';
import { Cloud189RapidUploadService } from '../services/Cloud189RapidUploadService';
import { Cloud189Service } from '../services/cloud189';

/**
 * 天翼云盘标准驱动：把既有的 Cloud189Service + Cloud189RapidUploadService
 * 包装为统一的 IDriveDriver 插件。
 */
export class Cloud189Driver extends BaseDriveDriver {
    readonly driveType: DriveType = 'cloud189';
    readonly displayName = '天翼云盘';

    private svc: Cloud189Service | null = null;
    private familyId?: string;

    async init(account: any): Promise<boolean> {
        await super.init(account);
        this.svc = new Cloud189Service(account);
        if (!this.svc) return false;
        this.familyId = account.familyId || (account as any).casFamilyId || undefined;
        return true;
    }

    async checkHealth(): Promise<DriveHealth> {
        try {
            const sizeInfo = await this.svc?.getUserSizeInfo?.();
            if (sizeInfo) {
                return { valid: true, message: '容量信息获取成功' };
            }
            return { valid: false, message: '未获取到账户信息' };
        } catch (err: any) {
            return { valid: false, message: err.message };
        }
    }

    async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
        const res: any = await this.svc!.listFiles(params.folderId);
        const fileArray = res?.fileListAO?.fileList || [];
        const folderArray = res?.fileListAO?.folderList || [];

        const folders: DriveFileEntry[] = folderArray.map((f: any) => ({
            fileId: String(f.id),
            fileName: f.name,
            isFolder: true,
            fileSize: 0,
            createdAt: f.createDate,
            updatedAt: f.lastUpdateDate
        }));

        const files: DriveFileEntry[] = fileArray.map((f: any) => ({
            fileId: String(f.id),
            fileName: f.name,
            isFolder: false,
            fileSize: f.size || 0,
            createdAt: f.createDate,
            updatedAt: f.lastUpdateDate
        }));

        return { entries: [...folders, ...files] };
    }

    async createFolder(parentFolderId: string, folderName: string): Promise<CreateFolderResult> {
        const res: any = await this.svc!.createFolder(folderName, parentFolderId);
        const folderId = res?.fileId || res?.id || res?.folderId;
        if (!folderId) throw new Error(`创建天翼云盘目录失败: ${JSON.stringify(res)}`);
        return { folderId: String(folderId), folderName };
    }

    async deleteFile(fileId: string): Promise<boolean> {
        // Cloud189Service 目前未直接暴露单文件删除，使用底层 request
        await (this.svc as any)?.request('/api/open/file/deleteFile.action', {
            method: 'POST',
            form: { fileId }
        });
        return true;
    }

    async rapidUpload(targetFolderId: string, meta: FileMetadata): Promise<RapidUploadResult> {
        const result = await Cloud189RapidUploadService.rapidUpload({
            target: {
                client: (this.svc as any)?.client,
                familyId: this.familyId
            },
            parentFolderId: targetFolderId,
            fileName: meta.fileName,
            fileSize: meta.fileSize,
            fileMd5: meta.hashes.md5 || '',
            sliceMd5: meta.hashes.sliceMd5 || ''
        });
        return {
            success: true,
            fileId: result.fileId,
            fileName: result.fileName,
            rapidHit: true
        };
    }

    async getDownloadUrl(fileId: string): Promise<DownloadUrlResult> {
        return this.getCachedDownloadUrl(`189:${fileId}`, async () => {
            const res: any = await (this.svc as any)?.request('/api/open/file/getFileDownloadUrl.action', {
                method: 'GET',
                searchParams: { fileId }
            });
            const url = res?.fileDownloadUrl || res?.res_code;
            if (!url || typeof url !== 'string' || !url.startsWith('http')) {
                throw new Error(`获取天翼云盘直链失败: ${JSON.stringify(res)}`);
            }
            return { url };
        });
    }
}
