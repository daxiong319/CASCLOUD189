import got from 'got';
import { BaseDriveDriver } from './BaseDriveDriver';
import {
    DriveType, DriveHealth, DriveFileEntry, ListFilesParams, ListFilesResult,
    CreateFolderResult, FileMetadata, RapidUploadResult, DownloadUrlResult
} from './types';

/**
 * 夸克网盘驱动（原生 TypeScript 实现）。
 *
 * 协议要点（夸克 Web 端公开接口）：
 *  - 认证：Cookie（__pus / __puus / _UP_A4A_11_ 等会话字段）
 *  - 列目录：POST /list (dir/pdir_fid 分页)
 *  - 秒传（哈希上传）：POST /file  (get_token -> pre_id / finish 三步)
 *      预校验特征 = [分块 MD5...] 拼接，分块大小 4MB（前 4 块）
 *  - 直链：POST /file/download (fid)
 *
 * UC 网盘（uc.cn 网盘）与夸克同属阿里 UC 体系，接口结构同源，
 * 通过 QUARK_API_BASE 切换域名即可复用全部逻辑。
 */
export class QuarkUcDriver extends BaseDriveDriver {
    readonly driveType: DriveType;
    readonly displayName: string;

    /** 夸克/UC 切换：默认夸克 */
    private readonly apiBase: string;
    private readonly isUc: boolean;

    /** 夸克分块 MD5 预校验：取前 4 块 x 4MB */
    private static readonly PRE_SLICE_SIZE = 4 * 1024 * 1024;
    private static readonly PRE_SLICE_COUNT = 4;

    private cookie: string = '';

    constructor(isUc: boolean = false) {
        super();
        this.isUc = isUc;
        this.driveType = isUc ? 'uc' : 'quark';
        this.displayName = isUc ? 'UC 网盘' : '夸克网盘';
        this.apiBase = isUc ? 'https://pc-api.uc.cn/1/clouddrive' : 'https://drive.quark.cn/1/clouddrive';
    }

    private static readonly UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    private buildHeaders(): Record<string, string> {
        return {
            'User-Agent': QuarkUcDriver.UA,
            Cookie: this.cookie,
            Referer: this.isUc ? 'https://drive.uc.cn/' : 'https://pan.quark.cn/',
            'Content-Type': 'application/json'
        };
    }

    private async request(uri: string, method: 'GET' | 'POST' = 'GET', body?: any, searchParams?: any): Promise<any> {
        try {
            const res = await got(`${this.apiBase}${uri}`, {
                method,
                headers: this.buildHeaders(),
                json: method === 'POST' ? body : undefined,
                searchParams: { ...(searchParams || {}), pr: 'ucpro', fr: 'pc' },
                responseType: 'json',
                timeout: { request: 15000 }
            });
            const data: any = res.body;
            if (data?.status && data.status >= 400) {
                throw new Error(`${this.displayName} 接口错误 [${data.status}]: ${data.message || '未知错误'}`);
            }
            return data?.data ?? data;
        } catch (err: any) {
            const code = err.code || err.response?.statusCode || '';
            const detail = err.message || err.response?.body || '网络请求失败';
            throw new Error(`${this.displayName} 请求 ${uri} 失败${code ? ` [${code}]` : ''}: ${detail}`);
        }
    }

    async init(account: any): Promise<boolean> {
        await super.init(account);
        const cookie = account?.cookies || account?.cookie || account?.password;
        if (!cookie || !String(cookie).includes('__pu')) {
            return false;
        }
        this.cookie = String(cookie);
        return true;
    }

    async checkHealth(): Promise<DriveHealth> {
        try {
            const member = await this.request('/member', 'GET');
            if (member?.member_id || member?.nick_name) {
                return { valid: true, message: member.nick_name || String(member.member_id) };
            }
            return { valid: false, message: 'Cookie 已失效' };
        } catch (err: any) {
            return { valid: false, message: err.message };
        }
    }

    async listFiles(params: ListFilesParams): Promise<ListFilesResult> {
        const res = await this.request('/file', 'GET', undefined, {
            pdir_fid: params.folderId || '0',
            _page: 1,
            _size: params.limit || 100,
            _fetch_total: 1
        });
        const list = res?.list || [];
        const entries: DriveFileEntry[] = list.map((f: any) => ({
            fileId: String(f.fid),
            fileName: f.file_name,
            isFolder: !!f.dir,
            fileSize: f.size || 0,
            createdAt: f.created_at,
            updatedAt: f.updated_at,
            hashes: f.md5 ? { md5: String(f.md5).toLowerCase() } : undefined
        }));
        return { entries };
    }

    async createFolder(parentFolderId: string, folderName: string): Promise<CreateFolderResult> {
        const res = await this.request('/file', 'POST', {
            pdir_fid: parentFolderId || '0',
            file_name: folderName,
            dir_path: '',
            dir_init_lock: false
        });
        const fid = res?.fid || res?.data?.fid;
        if (!fid) throw new Error(`创建${this.displayName}目录失败: ${JSON.stringify(res)}`);
        return { folderId: String(fid), folderName };
    }

    async deleteFile(fileId: string): Promise<boolean> {
        await this.request('/file/delete', 'POST', {
            action: 2,
            filelist: [fileId],
            exclude_fids: []
        });
        return true;
    }

    /**
     * 夸克秒传：
     * 1) 若提供了完整分块 MD5 预校验串（preHash 字段，格式 "md5,md5,..."），
     *    走 get_token(1) 预检 -> 命中即 finish 完成秒传。
     * 2) 仅提供全量 md5 时无法构造夸克预校验，返回 not supported。
     */
    async rapidUpload(targetFolderId: string, meta: FileMetadata): Promise<RapidUploadResult> {
        const preIds = meta.hashes.preHash || meta.hashes.sliceMd5;
        if (!preIds || !String(preIds).includes(',')) {
            return {
                success: false,
                fileName: meta.fileName,
                rapidHit: false,
                message: `${this.displayName} 秒传需要 4x4MB 分块 MD5 预校验特征（preHash，逗号分隔），请在 V2 CAS 清单中提供`
            };
        }

        // 步骤 1: 请求上传令牌并做哈希预检
        const tokenRes = await this.request('/file', 'POST', {
            pdir_fid: targetFolderId || '0',
            file_name: meta.fileName,
            file_size: meta.fileSize,
            get_token: true,
            // 0: 初始化; 1: 预检
            pre_id: String(preIds),
            hash_source: 'block_md5',
            block_size: QuarkUcDriver.PRE_SLICE_SIZE,
            blocks: QuarkUcDriver.PRE_SLICE_COUNT
        });

        const taskId = tokenRes?.task_id;
        const finishInfo = tokenRes?.finish || tokenRes;
        if (finishInfo?.fid) {
            return { success: true, fileId: String(finishInfo.fid), fileName: meta.fileName, rapidHit: true };
        }
        if (!taskId) {
            throw new Error(`${this.displayName} 秒传预检失败: ${JSON.stringify(tokenRes)}`);
        }

        // 步骤 2: 完成秒传（哈希全部命中时 finish=true）
        const finishRes = await this.request('/file', 'POST', {
            task_id: taskId,
            finish: true,
            file_name: meta.fileName
        });
        const fid = finishRes?.fid || finishRes?.data?.fid;
        if (!fid) {
            throw new Error(`${this.displayName} 秒传完成阶段失败: ${JSON.stringify(finishRes)}`);
        }
        return { success: true, fileId: String(fid), fileName: meta.fileName, rapidHit: true };
    }

    async getDownloadUrl(fileId: string): Promise<DownloadUrlResult> {
        return this.getCachedDownloadUrl(`${this.driveType}:${fileId}`, async () => {
            const res = await this.request('/file/download', 'POST', {
                fids: [fileId]
            });
            const url = res?.download_url || res?.[0]?.download_url;
            if (!url) throw new Error(`获取${this.displayName}直链失败: ${JSON.stringify(res)}`);
            return { url: String(url), headers: { 'User-Agent': QuarkUcDriver.UA } };
        });
    }

    /**
     * 夸克/UC 分享转存（Web 公开协议三步）：
     *  1) token/get  → 获取 stoken（传 extracted 的 passcode）
     *  2) detail     → 分享详情，展开目录树拿到全部 fid/fid_token
     *  3) task/save  → 保存到目标目录（fid_list + fid_token_list）
     */
    async saveShare(shareUrl: string, targetFolderId: string): Promise<{ fileId: string; fileName: string }> {
        const urlObj = new URL(shareUrl);
        const passcode = urlObj.searchParams.get('passcode')
            || urlObj.searchParams.get('pwd')
            || shareUrl.match(/提取码[::]\s*([a-z0-9]{4})/i)?.[1]
            || '';
        const pwdId = urlObj.searchParams.get('pwd_id')
            || shareUrl.match(/s\/([a-z0-9]+)/i)?.[1]
            || '';
        if (!pwdId) throw new Error(`无法从分享链接解析 pwd_id: ${shareUrl}`);

        // 步骤 1: 获取 stoken
        const tokenRes = await this.request('/share/token', 'POST', {
            pwd_id: pwdId,
            passcode
        });
        const stoken = tokenRes?.stoken;
        if (!stoken) throw new Error(`获取${this.displayName}分享 stoken 失败: ${JSON.stringify(tokenRes)}`);

        // 步骤 2: 分享详情（展开根目录，分页拉全）
        const entries: { fid: string; fidToken: string; fileName: string; isFolder: boolean }[] = [];
        let page = 1;
        while (true) {
            const detailRes = await this.request('/share/detail', 'GET', undefined, {
                pwd_id: pwdId,
                stoken,
                pdir_fid: '0',
                _page: page,
                _size: 200,
                _fetch_banner: 0,
                _fetch_share: 0,
                _fetch_total: 1,
                _sort: 'file_name:asc'
            });
            const list = detailRes?.list || [];
            for (const f of list) {
                entries.push({
                    fid: String(f.fid),
                    fidToken: String(f.fid_token || ''),
                    fileName: f.file_name,
                    isFolder: !!f.dir
                });
            }
            const total = Number(detailRes?._total || detailRes?.total || entries.length);
            if (entries.length >= total || list.length === 0 || page > 50) break;
            page++;
        }
        if (entries.length === 0) throw new Error(`分享目录为空或已失效: ${shareUrl}`);

        // 步骤 3: 保存（文件直接转存；若为根目录混合结构，保存全部顶层条目）
        const saveRes = await this.request('/share/save', 'POST', {
            pwd_id: pwdId,
            stoken,
            pdir_fid: targetFolderId || '0',
            fid_list: entries.map(e => e.fid),
            fid_token_list: entries.map(e => e.fidToken),
        });
        const savedList = saveRes?.save_as_top_save_as?.save_as || saveRes?.data?.save_as || saveRes?.save_as;
        const firstSaved = Array.isArray(savedList) ? savedList[0] : savedList;
        const fileId = firstSaved?.fid || firstSaved?.file_id;
        const fileName = firstSaved?.file_name || entries[0]?.fileName;
        if (!fileId) throw new Error(`${this.displayName} 分享转存失败: ${JSON.stringify(saveRes)}`);
        return { fileId: String(fileId), fileName: String(fileName) };
    }
}

/** 夸克驱动 */
export class QuarkDriver extends QuarkUcDriver {
    constructor() {
        super(false);
    }
}

/** UC 驱动（接口同源，切换域名） */
export class UcDriver extends QuarkUcDriver {
    constructor() {
        super(true);
    }
}
