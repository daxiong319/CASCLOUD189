/* ============================================================
   API 层：统一请求封装 + 全部后端接口映射
   ============================================================ */
const API = {
    _base: '',

    async _req(path, opts = {}) {
        const res = await fetch(this._base + path, {
            credentials: 'include',
            headers: opts.body ? { 'Content-Type': 'application/json' } : {},
            ...opts
        });
        if (res.status === 401) {
            const onLogin = window.dispatchEvent(new CustomEvent('app:unauthorized'));
            throw Object.assign(new Error('未登录'), { unauthorized: true });
        }
        return res;
    },

    async _json(path, opts = {}) {
        const res = await this._req(path, opts);
        return res.json();
    },

    // ---- 认证 ----
    login: (username, password) => API._json('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    version: () => API._json('/api/version'),

    // ---- 账号 ----
    accounts: () => API._json('/api/accounts'),
    createAccount: (data) => API._json('/api/accounts', { method: 'POST', body: JSON.stringify(data) }),
    deleteAccount: (id) => API._json(`/api/accounts/${id}`, { method: 'DELETE' }),
    clearRecycle: () => API._json('/api/accounts/recycle', { method: 'DELETE' }),
    updateAlias: (id, alias) => API._json(`/api/accounts/${id}/alias`, { method: 'PUT', body: JSON.stringify({ alias }) }),
    setDefaultAccount: (id) => API._json(`/api/accounts/${id}/default`, { method: 'PUT' }),
    updateStrmPrefix: (id, strmPrefix, type) => API._json(`/api/accounts/${id}/strm-prefix`, { method: 'PUT', body: JSON.stringify({ strmPrefix, type }) }),
    favorites: (accountId) => API._json(`/api/favorites/${accountId}`),
    saveFavorites: (accountId, favorites) => API._json('/api/saveFavorites', { method: 'POST', body: JSON.stringify({ accountId, favorites }) }),
    folders: (accountId, folderId = '-11', refresh = false) => API._json(`/api/folders/${accountId}?folderId=${encodeURIComponent(folderId)}&refresh=${refresh}`),
    accountsHealth: () => API._json('/api/accounts/health'),

    // ---- 任务 ----
    tasks: (status = 'all', search = '') => API._json(`/api/tasks?status=${encodeURIComponent(status)}&search=${encodeURIComponent(search)}`),
    createTask: (data) => API._json('/api/tasks', { method: 'POST', body: JSON.stringify(data) }),
    updateTask: (id, data) => API._json(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    deleteTask: (id, deleteCloud = false) => API._json(`/api/tasks/${id}`, { method: 'DELETE', body: JSON.stringify({ deleteCloud }) }),
    batchDeleteTasks: (taskIds, deleteCloud = false) => API._json('/api/tasks/batch', { method: 'DELETE', body: JSON.stringify({ taskIds, deleteCloud }) }),
    deleteTaskFiles: (taskId, files) => API._json('/api/tasks/files', { method: 'DELETE', body: JSON.stringify({ taskId, files }) }),
    executeTask: (id) => API._json(`/api/tasks/${id}/execute`, { method: 'POST' }),
    executeAllTasks: () => API._json('/api/tasks/executeAll', { method: 'POST' }),
    genStrmByTask: (taskIds, overwrite = false) => API._json('/api/tasks/strm', { method: 'POST', body: JSON.stringify({ taskIds, overwrite }) }),
    parseShare: (shareLink, accountId, accessCode) => API._json('/api/share/parse', { method: 'POST', body: JSON.stringify({ shareLink, accountId, accessCode }) }),
    shareFolders: (accountId, taskId, folderId = '-11') => API._json(`/api/share/folders/${accountId}?taskId=${taskId}&folderId=${encodeURIComponent(folderId)}`),
    folderFiles: (accountId, taskId) => API._json(`/api/folder/files?accountId=${accountId}&taskId=${taskId}`),
    renameFiles: (data) => API._json('/api/files/rename', { method: 'POST', body: JSON.stringify(data) }),
    aiRename: (taskId, files) => API._json('/api/files/ai-rename', { method: 'POST', body: JSON.stringify({ taskId, files }) }),
    taskGroups: () => API._json('/api/task-groups'),
    createTaskGroup: (name) => API._json('/api/task-groups', { method: 'POST', body: JSON.stringify({ name }) }),
    deleteTaskGroup: (id) => API._json(`/api/task-groups/${id}`, { method: 'DELETE' }),

    // ---- 媒体 ----
    strmGenerateAll: (accountIds, overwrite = false) => API._json('/api/strm/generate-all', { method: 'POST', body: JSON.stringify({ accountIds, overwrite }) }),
    strmList: (path = '') => API._json(`/api/strm/list?path=${encodeURIComponent(path)}`),
    getSettings: () => API._json('/api/settings'),
    saveSettings: (settings) => API._json('/api/settings', { method: 'POST', body: JSON.stringify(settings) }),
    saveMediaSettings: (settings) => API._json('/api/settings/media', { method: 'POST', body: JSON.stringify(settings) }),

    // ---- 资源搜索 ----
    resourceSearch: (kw) => API._json(`/api/resource/search?kw=${encodeURIComponent(kw)}`),
    cloudsaverSearch: (keyword) => API._json(`/api/cloudsaver/search?keyword=${encodeURIComponent(keyword)}`),

    // ---- CAS / 驱动 ----
    drives: () => API._json('/api/drives'),
    driveHealth: (driveType, accountId) => API._json(`/api/drives/${driveType}/health?accountId=${accountId}`),
    driveFiles: (accountId, folderId = 'root', limit = 100) => API._json(`/api/drives/account/${accountId}/files?folderId=${encodeURIComponent(folderId)}&limit=${limit}`),
    createFolder: (accountId, parentFolderId, folderName) => API._json(`/api/drives/account/${accountId}/folder`, { method: 'POST', body: JSON.stringify({ parentFolderId, folderName }) }),
    rapidUpload: (accountId, targetFolderId, casContent) => API._json(`/api/drives/account/${accountId}/rapid`, { method: 'POST', body: JSON.stringify({ targetFolderId, casContent }) }),
    getDownloadUrl: (accountId, fileId) => API._json(`/api/drives/account/${accountId}/download?fileId=${encodeURIComponent(fileId)}`),
    saveShare: (accountId, shareUrl, targetFolderId) => API._json(`/api/drives/account/${accountId}/save-share`, { method: 'POST', body: JSON.stringify({ shareUrl, targetFolderId }) }),
    casRestore: (data) => API._json('/api/cas-restore/restore', { method: 'POST', body: JSON.stringify(data) }),
    startCasMirror: (accountId, data) => API._json(`/api/drives/account/${accountId}/cas-mirror`, { method: 'POST', body: JSON.stringify(data) }),
    casMirrorTasks: () => API._json('/api/drives/cas-mirror/tasks'),
    playInfo: (accountId, params) => API._json(`/api/play/${accountId}/info?${new URLSearchParams(params)}`),

    // ---- Casby Emby ----
    embyLibraries: () => API._json('/api/emby/libraries'),
    createEmbyLibrary: (data) => API._json('/api/emby/libraries', { method: 'POST', body: JSON.stringify(data) }),
    updateEmbyLibrary: (id, data) => API._json(`/api/emby/libraries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    embyUsers: () => API._json('/api/emby/users'),
    createEmbyUser: (username, password) => API._json('/api/emby/users', { method: 'POST', body: JSON.stringify({ username, password }) }),
    embyBootstrap: () => API._json('/api/emby/bootstrap', { method: 'POST' }),

    // ---- 其他 ----
    chat: (message) => API._json('/api/chat', { method: 'POST', body: JSON.stringify({ message }) }),
    testCustomPush: (config) => API._json('/api/custom-push/test', { method: 'POST', body: JSON.stringify(config) }),
};

/* 分享链接解析（天翼链接内嵌提取码） */
function parseCloudShare(shareText) {
    shareText = (shareText || '').replace(/\s/g, '');
    let url = '', accessCode = '';
    const codePatterns = [
        /[（(]访问码[：:]\s*([a-zA-Z0-9]{4})[)）]/, /[（(]提取码[：:]\s*([a-zA-Z0-9]{4})[)）]/,
        /访问码[：:]\s*([a-zA-Z0-9]{4})/, /提取码[：:]\s*([a-zA-Z0-9]{4})/, /[（(]([a-zA-Z0-9]{4})[)）]/
    ];
    for (const p of codePatterns) {
        const m = shareText.match(p);
        if (m) { accessCode = m[1]; shareText = shareText.replace(m[0], ''); break; }
    }
    const urlPatterns = [
        /(https?:\/\/cloud\.189\.cn\/web\/share\?[^\s]+)/, /(https?:\/\/cloud\.189\.cn\/t\/[a-zA-Z0-9]+)/,
        /(https?:\/\/h5\.cloud\.189\.cn\/share\.html#\/t\/[a-zA-Z0-9]+)/,
        /(https?:\/\/[^/]+\/web\/share\?[^\s]+)/, /(https?:\/\/[^/]+\/t\/[a-zA-Z0-9]+)/,
        /(https?:\/\/[^/]+\/share\.html[^\s]*)/, /(https?:\/\/content\.21cn\.com[^\s]+)/,
        /(https?:\/\/yun\.139\.com\/[^\s]+)/
    ];
    for (const p of urlPatterns) {
        const m = shareText.match(p);
        if (m) { url = m[1]; break; }
    }
    return { url, accessCode };
}

/* 网盘类型识别 */
function detectDriveType(url) {
    const u = (url || '').toLowerCase();
    if (u.includes('cloud.189.cn')) return 'cloud189';
    if (u.includes('yun.139.com')) return 'cloud139';
    if (u.includes('pan.quark.cn')) return 'quark';
    if (u.includes('drive.uc.cn')) return 'uc';
    if (u.includes('alipan.com') || u.includes('aliyundrive.com')) return 'aliyun';
    return null;
}
const DRIVE_META = {
    cloud189: { name: '天翼云盘', icon: '☁️', color: '#e8590c' },
    cloud139: { name: '中国移动云盘', icon: '📱', color: '#1098ad' },
    quark: { name: '夸克网盘', icon: '🔷', color: '#3b5bdb' },
    uc: { name: 'UC 网盘', icon: '🟠', color: '#f76707' },
    aliyun: { name: '阿里云盘', icon: '📁', color: '#2f9e44' },
};
function driveName(t) { return DRIVE_META[t]?.name || t || '天翼云盘'; }
function driveIcon(t) { return DRIVE_META[t]?.icon || '☁️'; }
function driveColor(t) { return DRIVE_META[t]?.color || '#5a5d80'; }

function formatBytes(bytes) {
    if (!bytes || isNaN(bytes)) return '0 B';
    if (bytes < 0) return '-' + formatBytes(-bytes);
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const e = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return (bytes / Math.pow(1024, e)).toFixed(e > 0 ? 2 : 0) + ' ' + units[e];
}
function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
