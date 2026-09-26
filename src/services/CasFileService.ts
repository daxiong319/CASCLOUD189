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
     * 解析 V2 清单文本。向后兼容与多源适配：
     *  - 纯 V2 JSON（含 version:2 与 hashes）
     *  - V1 JSON（fileName/fileSize/fileMd5/sliceMd5）自动升级
     *  - Base64 编码（支持 cloud189:// 协议头，自动补齐 Base64 padding）
     *  - 管道符格式：文件名|文件大小|MD5|SliceMD5 (广泛流传于各大网盘论坛)
     *  - 容错编码：多字符集尝试 (utf-8, gbk/gb18030)
     */
    public static parseManifestV2(text: string): CasManifestV2 {
        const rawTrimmed = (text || '').trim();
        if (!rawTrimmed) {
            throw new Error('CAS 清单内容为空');
        }

        // 1. 尝试管道符格式 (name|size|md5|slice_md5)
        if (rawTrimmed.includes('|')) {
            const parts = rawTrimmed.split('|').map(p => p.trim());
            if (parts.length >= 4) {
                const [pName, pSize, pMd5, pSliceMd5] = parts;
                const sizeNum = Number(pSize);
                if (pName && Number.isFinite(sizeNum) && /^[A-Fa-f0-9]{32}$/.test(pMd5) && /^[A-Fa-f0-9]{32}$/.test(pSliceMd5)) {
                    return {
                        version: 2,
                        fileName: pName,
                        fileSize: sizeNum,
                        hashes: {
                            md5: pMd5.toUpperCase(),
                            sliceMd5: pSliceMd5.toUpperCase()
                        },
                        sourceDrive: 'cloud189',
                        createdAt: new Date().toISOString()
                    };
                }
            }
        }

        // 2. 去除协议头并处理 Base64
        let cleanText = rawTrimmed;
        if (cleanText.toLowerCase().startsWith('cloud189://')) {
            cleanText = cleanText.substring('cloud189://'.length).trim();
        }

        let jsonText = cleanText;
        if (!cleanText.startsWith('{') && !cleanText.startsWith('[')) {
            try {
                // 补齐 Base64 padding
                const compact = cleanText.replace(/\s+/g, '');
                const padLen = (4 - (compact.length % 4)) % 4;
                const padded = compact + '='.repeat(padLen);
                const buf = Buffer.from(padded, 'base64');
                
                // 尝试不同编码解析
                let decoded = buf.toString('utf-8');
                if (decoded.charCodeAt(0) === 0xFEFF) { // 去除 UTF-8 BOM
                    decoded = decoded.slice(1);
                }
                if (decoded.trim().startsWith('{') || decoded.trim().startsWith('[')) {
                    jsonText = decoded.trim();
                } else if (decoded.includes('|')) {
                    // Base64 解码后是管道符
                    return this.parseManifestV2(decoded);
                }
            } catch (_) {}
        }

        let data: any;
        try {
            data = JSON.parse(jsonText);
        } catch (err: any) {
            throw new Error(`解析 CAS 失败: 既非有效 JSON 也非合法 Base64/管道符格式 (${err.message})`);
        }

        // 如果是数组，取第一条
        if (Array.isArray(data)) {
            if (data.length === 0) throw new Error('CAS JSON 数组为空');
            data = data[0];
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
