/**
 * CASCLOUD189 多网盘驱动统一类型规范
 *
 * 所有网盘驱动（Cloud189 / Quark / UC / Aliyun / Cloud139 / ...）均实现
 * IDriveDriver 接口，账号、任务、CAS 秒传等上层业务只依赖本文件定义的
 * 抽象类型，与具体网盘协议完全解耦。
 */

/** 网盘驱动类型代码（与数据库 Account.driveType 对应） */
export type DriveType =
    | 'cloud189'
    | 'quark'
    | 'uc'
    | 'aliyun'
    | 'cloud139'
    | 'xunlei'
    | '115'
    | 'pikpak';

/** 统一的文件哈希特征（CAS V2 多维特征结构） */
export interface FileHashes {
    /** 全量文件 MD5（天翼/移动/夸克预校验用） */
    md5?: string;
    /** 天翼云盘首分片(128KB) MD5 */
    sliceMd5?: string;
    /** 阿里云盘 content_hash（全量 SHA1） */
    sha1?: string;
    /** 阿里云盘预校验哈希（前 1KB 的 SHA1） */
    preHash?: string;
    /** 迅雷/115 GCID 特征 */
    gcid?: string;
    /** 115 SHA1 特征 */
    sha115?: string;
}

/** 统一的文件元数据描述 */
export interface FileMetadata {
    fileName: string;
    fileSize: number;
    hashes: FileHashes;
    /** 文件所属网盘原始 ID（各网盘格式不同，字符串统一承载） */
    nativeId?: string;
    parentId?: string;
}

/** 账号运行健康状态 */
export interface DriveHealth {
    valid: boolean;
    message?: string;
    /** 预计失效时间（Token 过期等） */
    expireAt?: Date;
}

/** 目录条目 */
export interface DriveFileEntry {
    fileId: string;
    fileName: string;
    isFolder: boolean;
    fileSize: number;
    createdAt?: string;
    updatedAt?: string;
    hashes?: FileHashes;
}

/** 秒传入库结果 */
export interface RapidUploadResult {
    success: boolean;
    fileId?: string;
    fileName: string;
    /** 秒传是否命中（false 表示需要走完整上传） */
    rapidHit: boolean;
    message?: string;
}

/** 直链解析结果 */
export interface DownloadUrlResult {
    url: string;
    /** 直链过期时间戳（毫秒），部分网盘直链有时效 */
    expireAt?: number;
    headers?: Record<string, string>;
}

/** 分页列目录参数 */
export interface ListFilesParams {
    folderId: string;
    limit?: number;
    marker?: string;
    keyword?: string;
}

/** 分页列目录结果 */
export interface ListFilesResult {
    entries: DriveFileEntry[];
    nextMarker?: string;
}

/** 创建目录结果 */
export interface CreateFolderResult {
    folderId: string;
    folderName: string;
}

/**
 * 网盘驱动统一接口。
 * 上层（任务调度、CAS 秒传、Emby 直链解析）只通过该接口操作网盘。
 */
export interface IDriveDriver {
    /** 驱动类型代码 */
    readonly driveType: DriveType;
    /** 人类可读名称，如 "天翼云盘" */
    readonly displayName: string;

    /** 使用账号凭据初始化驱动（Cookie/Token），成功返回 true */
    init(account: any): Promise<boolean>;
    /** 校验账号有效性（可顺带刷新 Token） */
    checkHealth(): Promise<DriveHealth>;

    /** 列目录 */
    listFiles(params: ListFilesParams): Promise<ListFilesResult>;
    /** 创建目录（支持递归路径，返回最终目录 ID） */
    createFolder(parentFolderId: string, folderName: string): Promise<CreateFolderResult>;
    /** 删除文件/目录 */
    deleteFile(fileId: string): Promise<boolean>;

    /**
     * ★ 秒传入库：基于哈希特征直接在目标目录生成文件。
     * 各驱动实现各自的 RapidUpload 协议；不支持秒传的网盘返回
     * { success:false, rapidHit:false, message:'not supported' }。
     */
    rapidUpload(targetFolderId: string, meta: FileMetadata): Promise<RapidUploadResult>;

    /** 获取下载直链 */
    getDownloadUrl(fileId: string): Promise<DownloadUrlResult>;

    /**
     * 保存分享链接到指定目录（转存）。
     * 分享码格式因网盘而异，由驱动自行解析。
     */
    saveShare?(shareUrl: string, targetFolderId: string): Promise<{ fileId: string; fileName: string }>;
}

/** 驱动能力描述（用于前端展示与功能开关） */
export interface DriveCapabilities {
    rapidUpload: boolean;
    shareSave: boolean;
    directLink: boolean;
    familyCloud: boolean;
}

/** 驱动注册信息 */
export interface DriveRegistration {
    driveType: DriveType;
    displayName: string;
    capabilities: DriveCapabilities;
    /** 账号配置字段说明（前端动态渲染登录表单用） */
    configFields: { key: string; label: string; type: 'text' | 'password' | 'textarea'; required: boolean }[];
}
