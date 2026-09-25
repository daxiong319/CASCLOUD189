import crypto from 'crypto';
import got from 'got';
import { logTaskEvent } from '../utils/logUtils';
import ProxyUtil from '../utils/ProxyUtil';
import { CasManifest } from './CasFileService';

export interface RapidUploadTarget {
    client: any;
    familyId?: string;
    familyRootFolderId?: string;
}

export interface RapidUploadOptions {
    target: RapidUploadTarget;
    parentFolderId: string;
    fileName: string;
    fileSize: number;
    fileMd5: string;
    sliceMd5: string;
    taskId?: number;
}

export class Cloud189RapidUploadService {
    private static UPLOAD_BASE_URL = 'https://upload.cloud.189.cn';
    private static RSA_URL = 'https://cloud.189.cn/api/security/generateRsaKey.action';
    private static USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    private static rsaKeyCache = new Map<string, { pubKey: string; pkId: string; expireAt: number }>();

    public static async rapidUpload(options: RapidUploadOptions): Promise<{ fileId: string; fileName: string; raw: any }> {
        const { target, parentFolderId, fileName, fileSize, fileMd5, sliceMd5, taskId } = options;
        const normalizedFileMd5 = String(fileMd5 || '').trim().toUpperCase();
        const normalizedSliceMd5 = String(sliceMd5 || '').trim().toUpperCase();

        if (taskId) {
            (logTaskEvent as any)(`[任务#${taskId}][秒传] 开始快速秒传入库: ${fileName} (${fileSize} 字节)`);
        }

        // 步骤 1: 初始化上传任务 (initMultiUpload)
        const isFamily = !!target.familyId;
        const initParams: any = {
            parentFolderId: String(parentFolderId || ''),
            fileName: encodeURIComponent(fileName),
            fileSize: Number(fileSize),
            sliceSize: 10485760 // 10MB slice
        };
        if (isFamily) {
            initParams.familyId = String(target.familyId);
        }

        const initUri = isFamily ? '/family/initMultiUpload' : '/person/initMultiUpload';
        const initRes = await this.executeUploadRequest(target, initUri, initParams);

        const uploadFileId = initRes?.data?.uploadFileId || initRes?.uploadFileId;
        if (!uploadFileId) {
            throw new Error(`初始化秒传失败: uploadFileId 缺失 (响应: ${JSON.stringify(initRes)})`);
        }

        // 步骤 2: 校验秒传特征 (checkTransSecond)
        const checkParams: any = {
            fileMd5: normalizedFileMd5,
            sliceMd5: normalizedSliceMd5,
            uploadFileId
        };
        if (isFamily) {
            checkParams.familyId = String(target.familyId);
        }

        const checkUri = isFamily ? '/family/checkTransSecond' : '/person/checkTransSecond';
        const checkRes = await this.executeUploadRequest(target, checkUri, checkParams);

        const fileDataExists = checkRes?.data?.fileDataExists ?? checkRes?.fileDataExists;
        if (fileDataExists !== 1 && fileDataExists !== true) {
            throw new Error(`秒传失败: 云端未命中该文件特征或文件无法秒传 (checkTransSecond=${JSON.stringify(checkRes)})`);
        }

        // 步骤 3: 提交完成秒传 (commitMultiUploadFile)
        const commitParams: any = {
            uploadFileId,
            fileMd5: normalizedFileMd5,
            sliceMd5: normalizedSliceMd5
        };
        if (isFamily) {
            commitParams.familyId = String(target.familyId);
        }

        const commitUri = isFamily ? '/family/commitMultiUploadFile' : '/person/commitMultiUploadFile';
        const commitRes = await this.executeUploadRequest(target, commitUri, commitParams);

        const fileId = commitRes?.data?.file?.userFileId || commitRes?.data?.userFileId || commitRes?.fileId || uploadFileId;

        if (taskId) {
            (logTaskEvent as any)(`[任务#${taskId}][秒传] 秒传完成: ${fileName} -> fileId: ${fileId}`);
        }

        return {
            fileId: String(fileId),
            fileName,
            raw: commitRes
        };
    }

    public static async rapidUploadManifest(
        target: RapidUploadTarget,
        parentFolderId: string,
        manifest: CasManifest,
        taskId?: number
    ): Promise<{ fileId: string; fileName: string; raw: any }> {
        return this.rapidUpload({
            target,
            parentFolderId,
            fileName: manifest.fileName,
            fileSize: manifest.fileSize,
            fileMd5: manifest.fileMd5,
            sliceMd5: manifest.sliceMd5,
            taskId
        });
    }

    private static async executeUploadRequest(target: RapidUploadTarget, requestUri: string, params: any): Promise<any> {
        let attempt = 0;
        while (attempt < 2) {
            attempt++;
            try {
                return await this.executeUploadRequestOnce(target, requestUri, params);
            } catch (err: any) {
                if (attempt === 1 && this.isInvalidSessionKeyError(err)) {
                    // SessionKey 过期，清理缓存并重试一次
                    const cacheKey = target.familyId ? `family:${target.familyId}` : 'personal';
                    this.rsaKeyCache.delete(cacheKey);
                    continue;
                }
                throw err;
            }
        }
    }

    private static async executeUploadRequestOnce(target: RapidUploadTarget, requestUri: string, params: any): Promise<any> {
        const req = await this.buildUploadRequest(target, requestUri, params, 'GET');
        const url = `${this.UPLOAD_BASE_URL}${requestUri}`;

        const client = target.client?.agent ? got.extend({ agent: target.client.agent }) : got;

        const response: any = await client.get(url, {
            searchParams: req.queryParams,
            headers: req.headers,
            responseType: 'json',
            timeout: { request: 30000 }
        });

        const body = response.body;
        if (body && (body.code === 'SUCCESS' || body.res_code === 0 || body.resultCode === 0 || body.data || body.fileId || body.uploadFileId)) {
            return body;
        }

        if (body && body.res_message) {
            throw new Error(`天翼云秒传接口错误: ${body.res_message} (${body.res_code || body.code})`);
        }

        return body;
    }

    private static isInvalidSessionKeyError(err: any): boolean {
        const msg = String(err?.message || '');
        return msg.includes('SessionKey') || msg.includes('KeyInvalid') || msg.includes('INVALID_SESSION');
    }

    private static async buildUploadRequest(target: RapidUploadTarget, requestUri: string, params: any, method: string = 'GET') {
        const sessionKey = target.client?.sessionKey || (typeof target.client?.getSessionKey === 'function' ? await target.client.getSessionKey() : '');
        const rsaKey = await this.generateRsaKey(target);

        const requestId = crypto.randomUUID();
        const requestDate = String(Date.now());
        const randomAesKey = crypto.randomBytes(8).toString('hex'); // 16-hex characters

        const encryptedParams = this.aesEncrypt(params, randomAesKey);
        const rsaEncryptedKey = this.rsaEncryptBase64(rsaKey.pubKey, randomAesKey);

        const hmacData = {
            SessionKey: sessionKey,
            Operate: method,
            RequestURI: requestUri,
            Date: requestDate,
            params: encryptedParams
        };
        const signature = this.hmacSha1(hmacData, randomAesKey);

        const headers: Record<string, string> = {
            'X-Request-Date': requestDate,
            'X-Request-ID': requestId,
            'EncryptionTextLength': String(encryptedParams.length),
            'EncryptionTextSha256': crypto.createHash('sha256').update(encryptedParams).digest('hex'),
            'PkId': rsaKey.pkId,
            'Signature': signature,
            'User-Agent': this.USER_AGENT
        };

        const queryParams = {
            params: encryptedParams,
            EncryptionText: rsaEncryptedKey
        };

        return { headers, queryParams };
    }

    private static async generateRsaKey(target: RapidUploadTarget): Promise<{ pubKey: string; pkId: string }> {
        const cacheKey = target.familyId ? `family:${target.familyId}` : 'personal';
        const cached = this.rsaKeyCache.get(cacheKey);
        if (cached && cached.expireAt > Date.now()) {
            return cached;
        }

        const client = target.client?.agent ? got.extend({ agent: target.client.agent }) : got;
        const res: any = await client.get(this.RSA_URL, {
            responseType: 'text',
            headers: { 'User-Agent': this.USER_AGENT },
            timeout: { request: 15000 }
        });

        const parsed = this.parseRsaKeyResponse(res.body);
        const pubKey = this.formatPublicKey(parsed.pubKey);
        const pkId = String(parsed.pkId || '');
        const expireAt = Date.now() + 1000 * 60 * 30; // 30 min cache

        const record = { pubKey, pkId, expireAt };
        this.rsaKeyCache.set(cacheKey, record);
        return record;
    }

    private static parseRsaKeyResponse(bodyStr: string): { pubKey: string; pkId: string } {
        const str = String(bodyStr || '').trim();
        if (str.startsWith('{')) {
            const json = JSON.parse(str);
            return {
                pubKey: json.pubKey || json.publicKey || '',
                pkId: json.pkId || ''
            };
        }
        // XML Response format
        const pubKeyMatch = str.match(/<pubKey>([\s\S]*?)<\/pubKey>/i);
        const pkIdMatch = str.match(/<pkId>([\s\S]*?)<\/pkId>/i);
        if (pubKeyMatch && pkIdMatch) {
            return {
                pubKey: pubKeyMatch[1].trim(),
                pkId: pkIdMatch[1].trim()
            };
        }
        throw new Error(`获取天翼云 RSA 密钥失败: 未知响应格式: ${str.slice(0, 100)}`);
    }

    private static formatPublicKey(rawKey: string): string {
        const cleaned = rawKey.replace(/-----[^\-]+-----/g, '').replace(/[\r\n\s]/g, '');
        return `-----BEGIN PUBLIC KEY-----\n${cleaned}\n-----END PUBLIC KEY-----`;
    }

    private static aesEncrypt(data: any, keyHex: string): string {
        const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from(keyHex, 'utf8'), null);
        const text = typeof data === 'string' ? data : JSON.stringify(data);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted.toUpperCase();
    }

    private static rsaEncryptBase64(pubKeyPem: string, text: string): string {
        const encrypted = crypto.publicEncrypt({
            key: pubKeyPem,
            padding: crypto.constants.RSA_PKCS1_PADDING
        }, Buffer.from(text, 'utf8'));
        return encrypted.toString('base64');
    }

    private static hmacSha1(obj: Record<string, string>, key: string): string {
        const hmac = crypto.createHmac('sha1', Buffer.from(key, 'utf8'));
        const str = Object.keys(obj).sort().map(k => `${k}=${obj[k]}`).join('&');
        return hmac.update(str).digest('hex');
    }
}

export default Cloud189RapidUploadService;
