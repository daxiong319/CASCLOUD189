import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { AppDataSource } from '../database';
import { ProxyFile, Task } from '../entities';
import ConfigService from './ConfigService';
import { logTaskEvent } from '../utils/logUtils';

export interface CasManifest {
    fileName: string;
    fileSize: number;
    fileMd5: string;
    sliceMd5: string;
    uploadTime?: string;
    raw?: any;
}

/** CAS V2 多网盘多维特征清单 */
export interface CasManifestV2 {
    version: 2;
    fileName: string;
    fileSize: number;
    hashes: {
        md5?: string;
        sliceMd5?: string;
        sha1?: string;
        preHash?: string;
        gcid?: string;
        sha115?: string;
    };
    /** 来源网盘（可选，便于溯源） */
    sourceDrive?: string;
    createdAt?: string;
}

export class CasFileService {
    private static DEFAULT_CAS_BASE_DIR_NAME = 'data/cas';

    public static resolveCasBaseDir(): string {
        const envDir = process.env.CAS_BASE_DIR;
        if (envDir && envDir.trim()) {
            return path.isAbsolute(envDir) ? envDir : path.resolve(process.cwd(), envDir);
        }
        return path.resolve(process.cwd(), this.DEFAULT_CAS_BASE_DIR_NAME);
    }

    public static isCasFileName(name: string): boolean {
        return /\.cas$/i.test(name || '');
    }

    public static getVirtualFileName(casFileName: string): string {
        return (casFileName || '').replace(/\.cas$/i, '');
    }

    public static parseManifest(data: any): CasManifest {
        if (!data || typeof data !== 'object') {
            throw new Error('CAS 文件内容不完整，缺少 name/size/md5/sliceMd5');
        }
        const fileObj = data.file || data.data || data;
        const fileName = fileObj.fileName || fileObj.name || fileObj.filename;
        const fileSize = Number(fileObj.fileSize ?? fileObj.size ?? fileObj.length);
        const fileMd5 = (fileObj.fileMd5 || fileObj.md5 || fileObj.file_md5 || '').toUpperCase();
        const sliceMd5 = (fileObj.sliceMd5 || fileObj.slice_md5 || '').toUpperCase();

        if (!fileName || !Number.isFinite(fileSize) || !fileMd5 || !sliceMd5) {
            throw new Error('CAS 文件内容不完整，缺少 name/size/md5/sliceMd5');
        }

        return {
            fileName: String(fileName),
            fileSize,
            fileMd5,
            sliceMd5,
            uploadTime: fileObj.uploadTime || fileObj.lastOpTime || new Date().toISOString(),
            raw: data
        };
    }

    public static parseManifestJsonText(text: string): CasManifest {
        try {
            const parsed = JSON.parse(text);
            return this.parseManifest(parsed);
        } catch (err: any) {
            throw new Error(`解析 CAS JSON 失败: ${err.message}`);
        }
    }

    public static parseManifestText(text: string): CasManifest {
        const trimmed = (text || '').trim();
        if (trimmed.startsWith('{')) {
            return this.parseManifestJsonText(trimmed);
        }
        // Base64 encode check
        try {
            const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
            if (decoded.trim().startsWith('{')) {
                return this.parseManifestJsonText(decoded);
            }
        } catch (_) {}

        throw new Error('无法识别的 CAS 文件内容格式');
    }

    public static encodeManifestJsonText(manifest: CasManifest): string {
        return JSON.stringify({
            fileName: manifest.fileName,
            fileSize: manifest.fileSize,
            fileMd5: manifest.fileMd5,
            sliceMd5: manifest.sliceMd5,
            uploadTime: manifest.uploadTime || new Date().toISOString()
        }, null, 2);
    }

    // ==================== CAS V2（多网盘多维特征） ====================

    /**
     * V1 清单升级为 V2：补齐 version/hashes 结构，保留天翼双 MD5。
     */
    public static upgradeToV2(manifest: CasManifest): CasManifestV2 {
        return {
            version: 2,
            fileName: manifest.fileName,
            fileSize: manifest.fileSize,
            hashes: {
                md5: manifest.fileMd5,
                sliceMd5: manifest.sliceMd5
            },
            sourceDrive: 'cloud189',
            createdAt: manifest.uploadTime || new Date().toISOString()
        };
    }

    /**
     * 解析 V2 清单文本。向后兼容：
     *  - 纯 V2 JSON（含 version:2 与 hashes）
     *  - V1 JSON（fileName/fileSize/fileMd5/sliceMd5）自动升级
     *  - Base64 编码的上述两种 JSON
     */
    public static parseManifestV2(text: string): CasManifestV2 {
        const trimmed = (text || '').trim();
        let jsonText = trimmed;
        if (!trimmed.startsWith('{')) {
            const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
            if (!decoded.trim().startsWith('{')) {
                throw new Error('无法识别的 CAS 文件内容格式');
            }
            jsonText = decoded;
        }

        let data: any;
        try {
            data = JSON.parse(jsonText);
        } catch (err: any) {
            throw new Error(`解析 CAS JSON 失败: ${err.message}`);
        }

        // 已经是 V2 结构
        if (data?.version === 2 && data?.hashes) {
            const fileName = data.fileName || data.name;
            const fileSize = Number(data.fileSize ?? data.size);
            if (!fileName || !Number.isFinite(fileSize)) {
                throw new Error('CAS V2 清单缺少 fileName/fileSize');
            }
            return {
                version: 2,
                fileName: String(fileName),
                fileSize,
                hashes: {
                    md5: (data.hashes.md5 || '').toUpperCase() || undefined,
                    sliceMd5: (data.hashes.sliceMd5 || '').toUpperCase() || undefined,
                    sha1: (data.hashes.sha1 || '').toUpperCase() || undefined,
                    preHash: (data.hashes.preHash || '').toUpperCase() || undefined,
                    gcid: data.hashes.gcid || undefined,
                    sha115: (data.hashes.sha115 || data.hashes.sha1_115 || '').toUpperCase() || undefined
                },
                sourceDrive: data.sourceDrive,
                createdAt: data.createdAt || new Date().toISOString()
            };
        }

        // V1 结构自动升级
        return this.upgradeToV2(this.parseManifest(data));
    }

    /** V2 清单序列化 */
    public static encodeManifestV2JsonText(manifest: CasManifestV2): string {
        return JSON.stringify(manifest, null, 2);
    }

    /**
     * V2 清单转换为统一驱动 FileMetadata（供任意网盘驱动秒传使用）。
     */
    public static toFileMetadata(manifest: CasManifestV2): import('../drivers/types').FileMetadata {
        return {
            fileName: manifest.fileName,
            fileSize: manifest.fileSize,
            hashes: manifest.hashes
        };
    }

    public static async getLocalManifestPath(taskId: number, fileName: string): Promise<string> {
        const baseDir = this.resolveCasBaseDir();
        const taskDir = path.join(baseDir, String(taskId));
        await fs.promises.mkdir(taskDir, { recursive: true });
        const safeName = fileName.endsWith('.cas') ? fileName : `${fileName}.cas`;
        return path.join(taskDir, safeName);
    }

    public static async writeLocalManifest(taskId: number, fileName: string, manifest: CasManifest): Promise<string> {
        const filePath = await this.getLocalManifestPath(taskId, fileName);
        const json = this.encodeManifestJsonText(manifest);
        await fs.promises.writeFile(filePath, json, 'utf-8');
        return filePath;
    }

    public static async readLocalManifestText(taskId: number, fileName: string): Promise<string | null> {
        try {
            const filePath = await this.getLocalManifestPath(taskId, fileName);
            if (fs.existsSync(filePath)) {
                return await fs.promises.readFile(filePath, 'utf-8');
            }
        } catch (_) {}
        return null;
    }

    public static async updateProxyFileCasContent(taskId: number, proxyFileId: number, casContent: string): Promise<void> {
        const repo = AppDataSource.getRepository(ProxyFile);
        await repo.update({ id: proxyFileId, taskId }, {
            isCas: true,
            casContent: casContent || undefined
        });
    }

    public static async readDbManifestText(taskId: number, proxyFileId: number): Promise<string | null> {
        const repo = AppDataSource.getRepository(ProxyFile);
        const file = await repo.findOne({ where: { id: proxyFileId, taskId } });
        return file?.casContent || null;
    }
}

export default CasFileService;
