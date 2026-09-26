import { IDriveDriver, DriveType, DriveRegistration } from './types';
import { Cloud189Driver } from './Cloud189Driver';
import { QuarkDriver, UcDriver } from './QuarkUcDriver';
import { AliyunDriver } from './AliyunDriver';
import { Cloud139Driver } from './Cloud139Driver';

/**
 * 驱动注册中心：
 *  - 管理所有已注册网盘驱动的元信息（能力/配置字段）
 *  - 按需实例化驱动（每个账号一个实例），统一缓存复用
 */
export class DriverRegistry {
    /** 驱动类型 -> 构造器 */
    private static driverCtors = new Map<DriveType, () => IDriveDriver>();

    /** 已实例化的驱动：cacheKey(driveType:accountId) -> 实例 */
    private static instances = new Map<string, IDriveDriver>();

    /** 驱动注册元信息 */
    private static registrations: DriveRegistration[] = [];

    public static bootstrap(): void {
        if (this.driverCtors.size > 0) return;

        this.register({
            driveType: 'cloud189',
            displayName: '天翼云盘',
            capabilities: { rapidUpload: true, shareSave: true, directLink: true, familyCloud: true },
            configFields: [
                { key: 'username', label: '账号（手机号）', type: 'text', required: true },
                { key: 'password', label: '密码 或 Cookie', type: 'password', required: true }
            ]
        }, () => new Cloud189Driver());

        this.register({
            driveType: 'cloud139',
            displayName: '中国移动云盘',
            capabilities: { rapidUpload: true, shareSave: true, directLink: true, familyCloud: true },
            configFields: [
                { key: 'authorization', label: 'Authorization (Basic凭据 或 Token)', type: 'textarea', required: true },
                { key: 'username', label: '手机号 / 账号名（可选）', type: 'text', required: false }
            ]
        }, () => new Cloud139Driver());

        this.register({
            driveType: 'quark',
            displayName: '夸克网盘',
            capabilities: { rapidUpload: true, shareSave: true, directLink: true, familyCloud: false },
            configFields: [
                { key: 'cookies', label: 'Cookie（__pus/__puus）', type: 'textarea', required: true }
            ]
        }, () => new QuarkDriver());

        this.register({
            driveType: 'uc',
            displayName: 'UC 网盘',
            capabilities: { rapidUpload: true, shareSave: true, directLink: true, familyCloud: false },
            configFields: [
                { key: 'cookies', label: 'Cookie（__pus/__puus）', type: 'textarea', required: true }
            ]
        }, () => new UcDriver());

        this.register({
            driveType: 'aliyun',
            displayName: '阿里云盘',
            capabilities: { rapidUpload: true, shareSave: true, directLink: true, familyCloud: false },
            configFields: [
                { key: 'accessToken', label: 'Access Token', type: 'password', required: true },
                { key: 'driveId', label: 'Drive ID（可选）', type: 'text', required: false }
            ]
        }, () => new AliyunDriver());
    }

    /** 注册驱动 */
    public static register(meta: DriveRegistration, ctor: () => IDriveDriver): void {
        this.driverCtors.set(meta.driveType, ctor);
        // 覆盖同名注册
        this.registrations = this.registrations.filter(r => r.driveType !== meta.driveType);
        this.registrations.push(meta);
    }

    /** 全部已注册驱动的元信息（供前端渲染） */
    public static listDrivers(): DriveRegistration[] {
        this.bootstrap();
        return [...this.registrations];
    }

    /** 获取指定驱动元信息 */
    public static getRegistration(driveType: DriveType): DriveRegistration | undefined {
        this.bootstrap();
        return this.registrations.find(r => r.driveType === driveType);
    }

    /** 是否已支持该驱动 */
    public static isSupported(driveType: string): boolean {
        this.bootstrap();
        return this.driverCtors.has(driveType as DriveType);
    }

    /**
     * 获取（或创建并初始化）一个账号绑定的驱动实例。
     * init 失败抛出异常由调用方处理。
     */
    public static async getDriverForAccount(account: any): Promise<IDriveDriver> {
        this.bootstrap();
        const driveType = (account?.driveType || 'cloud189') as DriveType;
        const ctor = this.driverCtors.get(driveType);
        if (!ctor) {
            throw new Error(`不支持的网盘类型: ${driveType}（已支持: ${[...this.driverCtors.keys()].join(', ')}）`);
        }

        const cacheKey = `${driveType}:${account.id ?? account.username ?? 'default'}`;
        const cached = this.instances.get(cacheKey);
        if (cached) return cached;

        const driver = ctor();
        const ok = await driver.init(account);
        if (!ok) {
            throw new Error(`${driver.displayName} 账号初始化失败，请检查 Cookie/Token 是否有效`);
        }
        this.instances.set(cacheKey, driver);
        return driver;
    }

    /** 账号凭据更新后清除缓存实例（下次重新 init） */
    public static invalidateAccount(driveType: string, accountId: number | string): void {
        this.instances.delete(`${driveType}:${accountId}`);
    }
}
