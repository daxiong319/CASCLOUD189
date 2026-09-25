import got from 'got';
import ConfigService from './ConfigService';

export class PanSouService {
    public static async getTianyiLinks(keyword: string): Promise<any[]> {
        const config = await ConfigService.getConfig();
        const pansouUrl = (config as any)?.pansouUrl || process.env.PANSOU_URL;
        if (!pansouUrl) {
            return [];
        }

        try {
            const url = `${pansouUrl.replace(/\/+$/, '')}/api/search`;
            const res: any = await got.get(url, {
                searchParams: { kw: keyword },
                responseType: 'json',
                timeout: { request: 10000 }
            });
            const list = res.body?.data || res.body?.results || res.body || [];
            if (Array.isArray(list)) {
                return list.filter((item: any) => {
                    const link = String(item.url || item.link || '');
                    return link.includes('cloud.189.cn');
                });
            }
            return [];
        } catch (err: any) {
            console.error(`[PanSouService] 搜索异常: ${err.message}`);
            return [];
        }
    }
}

export default PanSouService;
