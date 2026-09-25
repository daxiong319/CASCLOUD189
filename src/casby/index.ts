import { Application } from 'express';
import { buildEmbyRouter } from './embyRouter';
import { buildAdminRouter } from './adminRouter';

export function mountCasby(app: Application) {
    // 挂载 Emby 兼容 API
    app.use('/emby', buildEmbyRouter());
    // 挂载 Casby 管理 API
    app.use(buildAdminRouter());
    console.log('[Casby] 虚拟 Emby 媒体服务已就绪 (/emby, /api/emby)');
}

export default mountCasby;
