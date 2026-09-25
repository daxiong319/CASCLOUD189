import { AppDataSource } from '../database';
import { Account } from '../entities';
const { Cloud189Service } = require('./cloud189');
import MessageService from './message';

export class AccountHealthCheckService {
    public static async checkAllAccounts(): Promise<any[]> {
        const repo = AppDataSource.getRepository(Account);
        const accounts = await repo.find();
        const results = [];

        for (const acc of accounts) {
            const status = await this.checkAccount(acc);
            results.push(status);
        }
        return results;
    }

    public static async checkAccount(account: Account): Promise<{ id: number; username: string; valid: boolean; error?: string }> {
        try {
            const cloud189 = new Cloud189Service();
            await cloud189.init(account.id);
            const user = await cloud189.client?.getUserInfo?.();
            if (user) {
                return { id: account.id, username: account.username, valid: true };
            }
            return { id: account.id, username: account.username, valid: false, error: 'Token失效或未返回用户信息' };
        } catch (err: any) {
            return { id: account.id, username: account.username, valid: false, error: err.message };
        }
    }
}

export default AccountHealthCheckService;
