import got from 'got';
import crypto from 'crypto';
import {
    IDriveDriver,
    DriveType,
    DriveHealth,
    ListFilesParams,
    ListFilesResult,
    CreateFolderResult,
    RapidUploadResult,
    DownloadUrlResult,
    FileMetadata
} from './types';

/**
 * 中国移动云盘（139 云盘）驱动
 *
 * 协议参考：
 *  - diy-strm / pan139 逆向协议
 *  - 移动云盘 Web 端 REST API (/file/list, /file/getDownloadUrl, /file/create)
 *  - 凭据认证方式：Authorization (Base64 编码的 Basic 凭据)
 *    格式：Basic base64(accountId:account:token|...|expiration)
 */
export class Cloud139Driver implements IDriveDriver {
    readonly driveType: DriveType = 'cloud139';
    readonly displayName = '中国移动云盘';

    private account: any = null;
    private authorization = '';
    private accountName = '';
    private personalHost = '';
    private hostExpireAt = 0;

    private static readonly ROUTE_URL = 'https://user-njs.yun.139.com/user/route/qryRoutePolicy';
    private static readonly REFRESH_TOKEN_URL = 'https://aas.caiyun.feixin.10086.cn:443/tellin/authTokenRefresh.do';

    async init(account: any): Promise<boolean> {
        this.account = account;
        const auth = account.authorization || account.password || account.token || account.cookie || '';
        this.authorization = String(auth).trim();
        if (this.authorization.startsWith('Basic ')) {
            this.authorization = this.authorization.substring(6).trim();
        }
        this.extractAccountInfo();
        return !!this.authorization;
    }

    private extractAccountInfo(): void {
        try {
            if (!this.authorization) return;
            const decoded = Buffer.from(this.authorization, 'base64').toString('utf-8');
            const parts = decoded.split(':');
            if (parts.length >= 2) {
                this.accountName = parts[1];
            }
        } catch {
            // ignore
        }
    }

    /**
     * 获取移动云盘个人云 API 路由域名 (personalHost)
     */
    private async ensurePersonalHost(): Promise<string> {
        if (this.personalHost && Date.now() < this.hostExpireAt) {
            return this.personalHost;
        }

        const account = this.accountName || this.account?.username || '';
        try {
            const res = await got.post(Cloud139Driver.ROUTE_URL, {
                json: {
                    userInfo: {
                        userType: 1,
                        accountType: 1,
                        accountName: account
                    },
                    modAddrType: 1
                },
                responseType: 'json',
                timeout: { request: 15000 },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });

            const data: any = res.body;
            const list = data?.data?.routePolicyList || [];
            for (const item of list) {
                if (item.modName === 'personal' && item.httpsUrl) {
                    this.personalHost = String(item.httpsUrl).replace(/\/+$/, '');
                    this.hostExpireAt = Date.now() + 3600 * 1000 * 12; // 缓存 12 小时
                    return this.personalHost;
                }
            }
        } catch (e: any) {
            console.warn(`[Cloud139] 路由查询失败，使用默认网关: ${e.message}`);
        }

        this.personalHost = 'https://personal-njs.yun.139.com';
        return this.personalHost;
    }

    private getHeaders(): Record<string, string> {
        return {
            'Authorization': `Basic ${this.authorization}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://yun.139.com/',
            'Origin': 'https://yun.139.com',
            'Accept': 'application/json, text/plain, */*',
            'Content-Type': 'application/json'
        };
    }

    async checkHealth(): Promise<DriveHealth> {
        try {
            if (!this.authorization) {
                return { valid: false, message: '未配置移动云盘 Authorization 凭据' };
            }
            const host = await this.ensurePersonalHost();
            const res = await got.post(`${host}/file/list`, {
                headers: this.getHeaders(),
                json: {
                    parentFileId: 'root',
                    pageInfo: { pageCursor: '', pageSize: 1 }
                },
                responseType: 'json',
                timeout: { request: 15000 }
            });
            const body: any = res.body;
            if (body && (body.success === true || body.code === '0')) {
                return { valid: true, message: `正常 (账号: ${this.accountName || '已授权'})` };
            }
            return { valid: false, message: body?.message || 'Token 已失效' };
        } catch (err: any) {
            return { valid: false, message: err.message };
        }
    }

    async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
        const host = await this.ensurePersonalHost();
        let parentId = params.folderId || 'root';
        if (parentId === '/' || parentId === '0') parentId = 'root';

        const res = await got.post(`${host}/file/list`, {
            headers: this.getHeaders(),
            json: {
                orderBy: 'updated_at',
                orderDirection: 'DESC',
                parentFileId: parentId,
                pageInfo: {
                    pageCursor: '',
                    pageSize: params.limit || 100
                }
            },
            responseType: 'json',
            timeout: { request: 20000 }
        });

        const body: any = res.body;
        if (!body || (!body.success && body.code !== '0')) {
            throw new Error(`移动云盘列目录失败: ${body?.message || '未知错误'}`);
        }

        const rawItems = body?.data?.items || [];
        const entries = rawItems.map((item: any) => ({
            fileId: String(item.fileId),
            fileName: String(item.name || ''),
            isFolder: item.type === 'folder',
            fileSize: parseInt(item.size || '0', 10),
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
            hashes: {
                md5: item.contentHash,
                sha256: item.sha256
            }
        }));

        return {
            entries,
            nextMarker: body?.data?.nextPageCursor || undefined
        };
    }

    async createFolder(parentFolderId: string, folderName: string): Promise<CreateFolderResult> {
        const host = await this.ensurePersonalHost();
        let pId = parentFolderId || 'root';
        if (pId === '/' || pId === '0') pId = 'root';

        const res = await got.post(`${host}/file/create`, {
            headers: this.getHeaders(),
            json: {
                parentFileId: pId,
                name: folderName,
                type: 'folder'
            },
            responseType: 'json',
            timeout: { request: 15000 }
        });

        const body: any = res.body;
        if (!body || (!body.success && body.code !== '0')) {
            throw new Error(`移动云盘创建目录失败: ${body?.message || '未知错误'}`);
        }

        return {
            folderId: String(body?.data?.fileId || ''),
            folderName
        };
    }

    async deleteFile(fileId: string): Promise<boolean> {
        const host = await this.ensurePersonalHost();
        const res = await got.post(`${host}/recyclebin/batchTrash`, {
            headers: this.getHeaders(),
            json: {
                fileIds: [fileId]
            },
            responseType: 'json',
            timeout: { request: 15000 }
        });
        const body: any = res.body;
        return !!(body && (body.success || body.code === '0'));
    }

    /**
     * 移动云盘秒传 (基于 MD5 / SHA256 快速入库预检)
     */
    async rapidUpload(targetFolderId: string, meta: FileMetadata): Promise<RapidUploadResult> {
        const hashes = meta?.hashes || {};
        const md5Val = hashes.md5;
        if (!md5Val) {
            return {
                success: false,
                fileName: meta.fileName,
                rapidHit: false,
                message: '移动云盘秒传需要全量 MD5 特征，请在 V2 CAS 清单中提供'
            };
        }

        const host = await this.ensurePersonalHost();
        let pId = targetFolderId || 'root';
        if (pId === '/' || pId === '0') pId = 'root';

        try {
            // 尝试申请上传/秒传预检
            const res = await got.post(`${host}/file/getUploadUrl`, {
                headers: this.getHeaders(),
                json: {
                    parentFileId: pId,
                    name: meta.fileName,
                    size: meta.fileSize,
                    contentHash: md5Val.toLowerCase(),
                    contentHashType: 'MD5'
                },
                responseType: 'json',
                timeout: { request: 20000 }
            });

            const body: any = res.body;
            // 若服务端直接返回已完成或 rapidUpload 命中
            if (body && (body.success || body.code === '0') && (body.data?.fileId || body.data?.exist)) {
                return {
                    success: true,
                    fileId: String(body.data?.fileId || ''),
                    fileName: meta.fileName,
                    rapidHit: true
                };
            }

            return {
                success: false,
                fileName: meta.fileName,
                rapidHit: false,
                message: '移动云盘未命中秒传指纹'
            };
        } catch (e: any) {
            return {
                success: false,
                fileName: meta.fileName,
                rapidHit: false,
                message: e.message
            };
        }
    }

    async getDownloadUrl(fileId: string): Promise<DownloadUrlResult> {
        const host = await this.ensurePersonalHost();
        const res = await got.post(`${host}/file/getDownloadUrl`, {
            headers: this.getHeaders(),
            json: {
                fileId
            },
            responseType: 'json',
            timeout: { request: 15000 }
        });

        const body: any = res.body;
        if (!body || (!body.success && body.code !== '0')) {
            throw new Error(`移动云盘获取下载链接失败: ${body?.message || '未知错误'}`);
        }

        const directUrl = body?.data?.url || body?.data?.cdnUrl;
        if (!directUrl) {
            throw new Error('移动云盘未能返回下载链接');
        }

        return {
            url: directUrl,
            expireAt: Date.now() + 1800 * 1000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        };
    }

    /**
     * 保存移动云盘分享链接
     * 支持 https://yun.139.com/w/#/detail/{linkID}
     */
    async saveShare(shareUrl: string, targetFolderId: string): Promise<{ fileId: string; fileName: string }> {
        // 从链接中提取 linkID
        const match = shareUrl.match(/detail\/([a-zA-Z0-9_-]+)/) || shareUrl.match(/linkID=([a-zA-Z0-9_-]+)/);
        const linkID = match ? match[1] : '';
        if (!linkID) {
            throw new Error('未识别到有效的移动云盘分享 linkID');
        }

        // 提取访问码
        const codeMatch = shareUrl.match(/(?:code|pwd|passwd|提取码)[:= ]*([a-zA-Z0-9]{4,6})/i);
        const passwd = codeMatch ? codeMatch[1] : '';

        // 请求分享转存
        const res = await got.post('https://yun.139.com/yun-share/richlifeApp/devapp/IOutLink/getOutLinkInfoV6', {
            headers: this.getHeaders(),
            json: {
                getOutLinkInfoReq: {
                    account: this.accountName,
                    linkID,
                    passwd,
                    pCaID: 'root',
                    bNum: 1,
                    eNum: 50
                }
            },
            responseType: 'json',
            timeout: { request: 20000 }
        });

        const body: any = res.body;
        const data = body?.data || body;
        const fileList = data?.coLst || [];
        const folderList = data?.caLst || [];

        const coPathLst = fileList.map((f: any) => f.coID || f.fileId).filter(Boolean);
        const caPathLst = folderList.map((f: any) => f.caID || f.folderId).filter(Boolean);

        if (coPathLst.length === 0 && caPathLst.length === 0) {
            throw new Error('移动云盘分享内容为空或访问密码错误');
        }

        let pId = targetFolderId || 'root';
        if (pId === '/' || pId === '0') pId = 'root';

        const saveRes = await got.post('https://yun.139.com/yun-share/richlifeApp/devapp/IOutLink/saveOutLinkV3', {
            headers: this.getHeaders(),
            json: {
                saveOutLinkReq: {
                    account: this.accountName,
                    linkID,
                    passwd,
                    caID: pId,
                    coPathLst,
                    caPathLst
                }
            },
            responseType: 'json',
            timeout: { request: 30000 }
        });

        const saveBody: any = saveRes.body;
        if (saveBody?.code && saveBody.code !== '0') {
            throw new Error(`移动云盘转存失败: ${saveBody.desc || saveBody.message || '未知错误'}`);
        }

        const firstName = fileList[0]?.coName || folderList[0]?.caName || '已转存文件';
        return {
            fileId: coPathLst[0] || caPathLst[0] || 'saved',
            fileName: firstName
        };
    }
}
