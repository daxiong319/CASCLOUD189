// CAS 秒传与扩展路由模块
const { CasFileService } = require('./services/CasFileService');
const { Cloud189RapidUploadService } = require('./services/Cloud189RapidUploadService');
const { PanSouService } = require('./services/pansouService');
const { ResourceSearchService } = require('./services/resourceSearchService');
const { AccountHealthCheckService } = require('./services/AccountHealthCheckService');
const { TaskGroupService } = require('./services/taskGroup');
const { mountCasby } = require('./casby');

function setupProExtensions(app, AppDataSource, Cloud189Service) {
    const { Account } = require('./entities');

    // 1. 挂载 Casby 虚拟 Emby 服务
    mountCasby(app);

    // 2. CAS 秒传导入/恢复接口
    app.post('/api/cas-restore/restore', async (req, res) => {
        try {
            const { accountId, targetFolderId, casContent, familyId } = req.body;
            if (!accountId) return res.status(400).json({ success: false, error: '请选择目标账号' });
            if (!casContent) return res.status(400).json({ success: false, error: 'CAS 内容不能为空' });

            const manifest = CasFileService.parseManifestText(casContent);
            const accountRepo = AppDataSource.getRepository(Account);
            const account = await accountRepo.findOne({ where: { id: parseInt(accountId, 10) } });
            if (!account) return res.status(404).json({ success: false, error: '账号不存在' });

            const cloud189 = new Cloud189Service();
            await cloud189.init(account.id);

            const target = {
                client: cloud189.client,
                familyId: familyId || account.casFamilyId || account.familyId || undefined
            };
            const finalFolderId = targetFolderId || (target.familyId ? account.familyRootFolderId : '-11');

            const result = await Cloud189RapidUploadService.rapidUploadManifest(
                target,
                finalFolderId,
                manifest
            );

            res.json({
                success: true,
                message: '秒传成功',
                data: {
                    fileId: result.fileId,
                    fileName: result.fileName
                }
            });
        } catch (err) {
            console.error('[CAS-Restore] 恢复失败:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 3. 盘搜与全网云盘搜索
    app.get('/api/resource/search', async (req, res) => {
        try {
            const keyword = String(req.query.kw || req.query.keyword || '');
            const data = await ResourceSearchService.searchCloudResources(keyword);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 4. 多账号健康巡检
    app.get('/api/accounts/health', async (req, res) => {
        try {
            const results = await AccountHealthCheckService.checkAllAccounts();
            res.json({ success: true, data: results });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // 5. 任务分组管理 API
    app.get('/api/task-groups', async (req, res) => {
        try {
            const groups = await TaskGroupService.getTaskGroups();
            res.json({ success: true, data: groups });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.post('/api/task-groups', async (req, res) => {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ success: false, error: '名称不能为空' });
            const group = await TaskGroupService.createTaskGroup(name);
            res.json({ success: true, data: group });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    app.delete('/api/task-groups/:id', async (req, res) => {
        try {
            const id = parseInt(req.params.id, 10);
            await TaskGroupService.deleteTaskGroup(id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });
}

module.exports = { setupProExtensions };
