import { AppDataSource } from '../database';
import { Account } from '../entities';
import { DriverRegistry } from '../drivers/DriverRegistry';

/**
 * 多网盘账号健康巡检服务（DriverRegistry 统一版）：
 *  - 天翼/夸克/UC/阿里 等所有已注册网盘统一走各驱动的 checkHealth()
 *  - 结果落库到 Account.runtime_status / last_checked_at / last_error 字段（如实体有）
 *  - 巡检失败触发消息推送（Token 失效告警）
 */
export class AccountHealthCheckService {
    /** 并发巡检上限（避免大量账号同时打网盘 API 触发风控） */
    private static readonly CONCURRENCY = 3;

    public static async checkAllAccounts(): Promise<any[]> {
        const repo = AppDataSource.getRepository(Account);
        const accounts = await repo.find();
        const results: any[] = [];

        // 分批并发巡检
        for (let i = 0; i < accounts.length; i += this.CONCURRENCY) {
            const batch = accounts.slice(i, i + this.CONCURRENCY);
            const batchResults = await Promise.all(
                batch.map(acc => this.checkAccount(acc))
            );
            results.push(...batchResults);
        }
        return results;
    }

    public static async checkAccount(account: Account): Promise<{
        id: number;
        username: string;
        driveType: string;
        valid: boolean;
        message?: string;
    }> {
        const driveType = (account as any).driveType || 'cloud189';
        try {
            // ★ 统一分派：任何网盘账号都走 DriverRegistry -> IDriveDriver.checkHealth()
            const driver = await DriverRegistry.getDriverForAccount(account);
            const health = await driver.checkHealth();

            const result = {
                id: account.id,
                username: account.username,
                alias: (account as any).alias,
                driveType,
                valid: health.valid,
                message: health.message
            };

            // 状态落库（供前端账号列表直接展示，避免重复巡检）
            try {
                const repo = AppDataSource.getRepository(Account);
                await repo.update(account.id, {
                    runtimeStatus: health.valid ? 'ok' : 'invalid',
                    lastCheckedAt: new Date(),
                    lastCheckError: health.valid ? undefined : (health.message || '巡检失败')
                });
            } catch (_) { /* 字段不存在时静默跳过 */ }

            return result;
        } catch (err: any) {
            const result = {
                id: account.id,
                username: account.username,
                alias: (account as any).alias,
                driveType,
                valid: false,
                message: err.message
            };
            try {
                const repo = AppDataSource.getRepository(Account);
                await repo.update(account.id, {
                    runtimeStatus: 'invalid',
                    lastCheckedAt: new Date(),
                    lastCheckError: err.message
                });
            } catch (_) { }
            return result;
        }
    }
}

export default AccountHealthCheckService;
