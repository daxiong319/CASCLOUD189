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
