/* ============================================================
   CASCLOUD189 新前端主应用（Symedia 风格 SPA）
   ============================================================ */

const App = {
    version: '',
    route: 'dashboard',
    accountsCache: [],
    settingsCache: null,

    async boot() {
        // 检查登录态
        try {
            const v = await API.version();
            this.version = v.version || '';
        } catch (e) {
            if (e.unauthorized) return this.renderLogin();
        }
        this.render();
        window.addEventListener('app:unauthorized', () => location.reload());
    },

    /* ==================== 登录页 ==================== */
    renderLogin() {
        document.getElementById('app').innerHTML = `
        <div class="login-wrap">
            <div class="login-card">
                <div class="login-logo">🎬</div>
                <h1>CASCLOUD189</h1>
                <div class="sub">多网盘媒体中枢 · 天翼 / 移动 / 夸克 / UC / 阿里</div>
                <form id="loginForm">
                    <div class="field" style="margin-bottom:14px">
                        <label>用户名</label>
                        <input class="input" id="lgUser" autocomplete="username" required>
                    </div>
                    <div class="field" style="margin-bottom:22px">
                        <label>密码</label>
                        <input class="input" type="password" id="lgPass" autocomplete="current-password" required>
                    </div>
                    <button class="btn btn-primary btn-lg" style="width:100%;justify-content:center" type="submit">登 录</button>
                </form>
            </div>
        </div>`;
        document.getElementById('loginForm').onsubmit = async (e) => {
            e.preventDefault();
            const r = await API.login(
                document.getElementById('lgUser').value.trim(),
                document.getElementById('lgPass').value
            );
            if (r.success) location.reload();
            else UI.err(r.error || '登录失败');
        };
    },

    /* ==================== 主框架 ==================== */
    render() {
        const NAV = [
            { group: '总览' },
            { id: 'dashboard', ico: '📊', name: '仪表盘' },
            { group: '资源入库' },
            { id: 'tasks', ico: '📥', name: '转存任务' },
            { id: 'search', ico: '🔍', name: '资源搜索' },
            { group: '网盘管理' },
            { id: 'accounts', ico: '👤', name: '账号管理' },
            { id: 'browser', ico: '🗂️', name: '网盘浏览' },
            { group: '媒体中心' },
            { id: 'media', ico: '🎬', name: '媒体库' },
            { id: 'cas', ico: '⚡', name: 'CAS 实验室' },
            { group: '系统' },
            { id: 'settings', ico: '⚙️', name: '系统设置' },
            { id: 'logs', ico: '📜', name: '实时日志' },
        ];
        document.getElementById('app').innerHTML = `
        <div class="layout">
            <div class="sidebar" id="sidebar">
                <div class="sidebar-logo"><span class="logo-ico">🎬</span> CASCLOUD189 <span class="ver">v${esc(this.version)}</span></div>
                <div class="nav" id="navBox">
                    ${NAV.map(n => n.group
                        ? `<div class="nav-group-title">${n.group}</div>`
                        : `<div class="nav-item" data-route="${n.id}"><span class="ico">${n.ico}</span>${n.name}<span class="badge" id="badge-${n.id}" style="display:none"></span></div>`
                    ).join('')}
                </div>
                <div class="sidebar-foot">
                    <button class="btn btn-ghost btn-sm" style="width:100%;justify-content:center" onclick="App.logout()">退出登录</button>
                </div>
            </div>
            <div class="main">
                <div class="topbar">
                    <button class="menu-btn" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
                    <h2 id="pageTitle">仪表盘</h2>
                    <div class="spacer"></div>
                    <button class="btn btn-ghost btn-sm" onclick="App.go('logs')">📜 日志</button>
                    <button class="btn btn-ghost btn-sm" onclick="App.aiChat()">🤖 AI 助手</button>
                </div>
                <div class="content" id="content"></div>
            </div>
        </div>`;

        document.querySelectorAll('.nav-item').forEach(el => {
            el.onclick = () => this.go(el.dataset.route);
        });
        this.go('dashboard');
    },

    go(route) {
        this.route = route;
        document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.route === route));
        document.getElementById('sidebar').classList.remove('open');
        const titles = { dashboard: '仪表盘', tasks: '转存任务', search: '资源搜索', accounts: '账号管理', browser: '网盘浏览', media: '媒体库', cas: 'CAS 实验室', settings: '系统设置', logs: '实时日志' };
        document.getElementById('pageTitle').textContent = titles[route] || route;
        const c = document.getElementById('content');
        c.innerHTML = '<div class="page"><div class="loading-center"><span class="spin"></span> 加载中...</div></div>';
        this['page_' + route]?.(c.querySelector('.page'));
    },

    async logout() {
        if (!await UI.confirm('退出登录', '确定要退出当前会话吗？')) return;
        // 后端无 logout 接口，直接刷新触发 401 → 登录页
        fetch('/api/version', { headers: { 'x-api-key': '__invalid__' } });
        location.href = '/login';
    },

    /* ==================== 仪表盘 ==================== */
    async page_dashboard(box) {
        const [accRes, taskRes, driveRes] = await Promise.all([
            API.accounts().catch(() => ({ data: [] })),
            API.tasks().catch(() => ({ data: [] })),
            API.drives().catch(() => ({ data: [] })),
        ]);
        const accounts = accRes.data || [];
        const tasks = taskRes.data || [];
        const drives = driveRes.data || [];
        this.accountsCache = accounts;

        const ok = accounts.filter(a => a.runtimeStatus === 'ok').length;
        const bad = accounts.filter(a => a.runtimeStatus === 'invalid').length;
        const pending = tasks.filter(t => t.status === 'pending').length;
        const processing = tasks.filter(t => t.status === 'processing').length;
        const done = tasks.filter(t => t.status === 'completed').length;
        const totalCap = accounts.reduce((s, a) => s + (a.capacity?.cloudCapacityInfo?.totalSize || 0), 0);
        const usedCap = accounts.reduce((s, a) => s + (a.capacity?.cloudCapacityInfo?.usedSize || 0), 0);

        box.innerHTML = `
            <div class="stat-grid">
                <div class="stat"><div class="s-ico" style="background:rgba(32,107,249,.15)">👤</div><div><div class="s-num">${accounts.length}</div><div class="s-label">网盘账号 · ${drives.length} 种驱动</div></div></div>
                <div class="stat"><div class="s-ico" style="background:rgba(84,206,0,.13)">${ok}</div><div><div class="s-num" style="color:var(--c-green)">${ok} / ${accounts.length}</div><div class="s-label">健康账号${bad ? ` · ${bad} 异常` : ''}</div></div></div>
                <div class="stat"><div class="s-ico" style="background:rgba(240,180,41,.13)">📥</div><div><div class="s-num">${tasks.length}</div><div class="s-label">转存任务 · 待处理 ${pending} · 进行中 ${processing}</div></div></div>
                <div class="stat"><div class="s-ico" style="background:rgba(143,123,245,.15)">💾</div><div><div class="s-num" style="font-size:17px">${formatBytes(usedCap)}</div><div class="s-label">已用 / 总容量 ${formatBytes(totalCap)}</div></div></div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dash-grid">
                <div class="card">
                    <div class="card-title"><span class="ico">⚡</span>快捷操作</div>
                    <div class="card-desc">常用功能一键直达</div>
                    <div style="display:flex;flex-wrap:wrap;gap:10px">
                        <button class="btn btn-primary" onclick="App.go('tasks');setTimeout(()=>openCreateTask(),100)">＋ 新建转存任务</button>
                        <button class="btn" onclick="App.go('search')">🔍 资源搜索</button>
                        <button class="btn" onclick="App.go('cas')">⚡ CAS 秒传</button>
                        <button class="btn" onclick="App.runHealthCheck()">🩺 全账号巡检</button>
                        <button class="btn" onclick="App.runExecuteAll()">▶️ 执行全部任务</button>
                        <button class="btn btn-danger" onclick="App.clearRecycle()">🗑️ 清空回收站</button>
                    </div>
                </div>
                <div class="card">
                    <div class="card-title"><span class="ico">👤</span>账号概况</div>
                    <div class="card-desc">各网盘账号容量与健康状态</div>
                    ${accounts.length === 0 ? '<div class="empty"><div class="ico">👤</div><div class="txt">暂无账号，去 <a href="javascript:App.go(\'accounts\')">账号管理</a> 添加</div></div>' : `
                    <div style="display:grid;gap:10px">
                        ${accounts.slice(0, 5).map(a => {
                            const cap = a.capacity?.cloudCapacityInfo || {};
                            const pct = cap.totalSize ? Math.min(100, (cap.usedSize / cap.totalSize) * 100) : 0;
                            return `<div>
                                <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
                                    <span>${driveIcon(a.driveType)} ${esc(a.alias || a.username)}</span>
                                    <span style="color:var(--t-sub)">${formatBytes(cap.usedSize)} / ${formatBytes(cap.totalSize)}</span>
                                </div>
                                <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
                            </div>`;
                        }).join('')}
                        ${accounts.length > 5 ? `<div class="hint">还有 ${accounts.length - 5} 个账号，<a href="javascript:App.go('accounts')">查看全部</a></div>` : ''}
                    </div>`}
                </div>
            </div>

            <div class="card">
                <div class="card-title"><span class="ico">📋</span>最近任务</div>
                <div class="card-desc">最新的 8 条转存任务</div>
                ${tasks.length === 0 ? '<div class="empty"><div class="ico">📥</div><div class="txt">暂无任务</div></div>' : `
                <div class="table-wrap"><table class="tbl">
                    <thead><tr><th>资源名</th><th>账号</th><th>进度</th><th>状态</th><th>更新时间</th></tr></thead>
                    <tbody>${tasks.slice(0, 8).map(t => `
                        <tr>
                            <td>${esc(t.resourceName || '-' )}</td>
                            <td><span class="tag tag-blue">${driveName(t.account?.driveType || 'cloud189')}</span></td>
                            <td>${t.currentEpisodes || 0} / ${t.totalEpisodes || '?'}</td>
                            <td>${UI.taskStatusTag(t.status)}</td>
                            <td style="color:var(--t-sub);font-size:12px">${esc((t.updatedAt || '').replace('T',' ').slice(0, 19))}</td>
                        </tr>`).join('')}
                    </tbody>
                </table></div>`}
            </div>

            <div class="card">
                <div class="card-title"><span class="ico">📜</span>实时日志</div>
                <div class="card-desc">任务执行与系统事件实时流</div>
                <div class="log-panel" id="dashLog"></div>
            </div>
        `;

        // 实时日志
        const logBox = box.querySelector('#dashLog');
        let lines = [];
        new LogStream(
            msg => { lines.push(msg); if (lines.length > 120) lines.shift(); renderLogs(); },
            logs => { lines = logs.slice(-120); renderLogs(); }
        );
        function renderLogs() {
            logBox.innerHTML = lines.map(l => `<div class="log-line lv-${UI.logLevel(l)}"><span class="t">${esc(l.slice(0, 22))}</span> <span class="msg">${esc(l.slice(22))}</span></div>`).join('');
            logBox.scrollTop = logBox.scrollHeight;
        }
    },

    async runHealthCheck() {
        UI.toast('正在巡检全部账号...');
        const r = await API.accountsHealth().catch(e => ({ error: e.message }));
        if (r.success) {
            const ok = (r.data || []).filter(x => x.valid).length;
            UI.ok(`巡检完成：${ok}/${r.data.length} 个账号正常`);
            if (this.route === 'dashboard' || this.route === 'accounts') this.go(this.route);
        } else UI.err(r.error || '巡检失败');
    },

    async runExecuteAll() {
        if (!await UI.confirm('执行全部任务', '将立即执行所有待处理任务，可能产生大量网盘请求。继续？')) return;
        const r = await API.executeAllTasks().catch(e => ({ error: e.message }));
        if (r.success) UI.ok('已开始执行，请查看实时日志');
        else UI.err(r.error);
    },

    async clearRecycle() {
        if (!await UI.confirm('清空回收站', '将清空所有账号的回收站（含家庭云回收站）。此操作不可恢复！')) return;
        const r = await API.clearRecycle().catch(e => ({ error: e.message }));
        if (r.success) UI.ok('后台执行中，请稍后查看日志');
        else UI.err(r.error);
    },

    /* ==================== 转存任务页 ==================== */
    async page_tasks(box) {
        const accRes = await API.accounts().catch(() => ({ data: [] }));
        this.accountsCache = accRes.data || [];
        window.openCreateTask = () => this.openCreateTask();

        box.innerHTML = `
            <div class="toolbar">
                <input class="input" id="taskSearch" placeholder="🔍 搜索任务名/备注/账号">
                <select class="select" id="taskStatus">
                    <option value="all">全部状态</option>
                    <option value="pending">等待中</option>
                    <option value="processing">转存中</option>
                    <option value="completed">已完结</option>
                    <option value="error">失败</option>
                </select>
                <div class="spacer"></div>
                <button class="btn btn-primary" onclick="openCreateTask()">＋ 新建任务</button>
                <button class="btn" onclick="App.runExecuteAll()">▶️ 执行全部</button>
                <button class="btn btn-ghost" onclick="App.refreshTasks()">🔄 刷新</button>
            </div>
            <div id="taskListWrap"><div class="loading-center"><span class="spin"></span></div></div>
        `;

        let debounce;
        box.querySelector('#taskSearch').oninput = e => {
            clearTimeout(debounce);
            debounce = setTimeout(() => this.refreshTasks(), 350);
        };
        box.querySelector('#taskStatus').onchange = () => this.refreshTasks();
        this.refreshTasks();
    },

    async refreshTasks() {
        const wrap = document.querySelector('#taskListWrap');
        if (!wrap) return;
        const status = document.querySelector('#taskStatus')?.value || 'all';
        const search = document.querySelector('#taskSearch')?.value?.trim() || '';
        const r = await API.tasks(status, search).catch(e => ({ error: e.message }));
        if (!r.success) { wrap.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${esc(r.error)}</div></div>`; return; }
        const tasks = r.data || [];
        window.__tasks = tasks;
        if (!tasks.length) { wrap.innerHTML = '<div class="empty"><div class="ico">📥</div><div class="txt">暂无任务，点击右上角「新建任务」创建</div></div>'; return; }

        wrap.innerHTML = `
        <div class="table-wrap"><table class="tbl">
            <thead><tr>
                <th style="width:30px"><input type="checkbox" id="tskAll" class="file-checkbox"></th>
                <th>资源名 / 备注</th><th>账号</th><th>进度</th><th>状态</th><th>定时</th><th>更新时间</th><th style="width:250px">操作</th>
            </tr></thead>
            <tbody>${tasks.map(t => `
                <tr data-id="${t.id}">
                    <td><input type="checkbox" class="tsk-cb" value="${t.id}"></td>
                    <td>
                        <div style="font-weight:600">${esc(t.resourceName || '-')}</div>
                        ${t.remark ? `<div style="font-size:11px;color:var(--t-sub)">${esc(t.remark)}</div>` : ''}
                    </td>
                    <td><span class="tag tag-blue">${driveName(t.account?.driveType || 'cloud189')}</span></td>
                    <td>
                        ${t.totalEpisodes ? `
                        <div style="display:flex;align-items:center;gap:8px">
                            <div class="bar" style="width:60px"><div class="bar-fill" style="width:${Math.min(100, (t.currentEpisodes / t.totalEpisodes) * 100)}%"></div></div>
                            <span style="font-size:12px;color:var(--t-sub)">${t.currentEpisodes}/${t.totalEpisodes}</span>
                        </div>` : `<span style="color:var(--t-sub)">${t.currentEpisodes || 0} 集</span>`}
                    </td>
                    <td>${UI.taskStatusTag(t.status)}</td>
                    <td>${t.enableCron ? `<span class="tag tag-purple">⏰</span>` : '<span style="color:var(--t-dim)">—</span>'}</td>
                    <td style="color:var(--t-sub);font-size:12px">${esc((t.updatedAt || '').replace('T',' ').slice(0, 19))}</td>
                    <td>
                        <div style="display:flex;gap:6px;flex-wrap:wrap">
                            <button class="btn btn-sm" onclick="App.execTask(${t.id})">▶ 执行</button>
                            <button class="btn btn-sm" onclick="App.showTaskFiles(${t.id})">📁 文件</button>
                            <button class="btn btn-sm" onclick="App.genStrm(${t.id})">STRM</button>
                            <button class="btn btn-sm" onclick="App.editTask(${t.id})">✏️</button>
                            <button class="btn btn-sm btn-danger" onclick="App.delTask(${t.id})">🗑</button>
                        </div>
                    </td>
                </tr>`).join('')}
            </tbody>
        </table></div>
        <div class="toolbar" style="margin-top:12px">
            <span style="font-size:12px;color:var(--t-sub)">已选 <b id="tskSelN">0</b> 项</span>
            <div class="spacer"></div>
            <button class="btn btn-sm btn-danger" onclick="App.batchDelTasks()">🗑️ 批量删除</button>
        </div>`;

        wrap.querySelector('#tskAll').onchange = e => {
            wrap.querySelectorAll('.tsk-cb').forEach(cb => cb.checked = e.target.checked);
            this.countSel();
        };
        wrap.querySelectorAll('.tsk-cb').forEach(cb => cb.onchange = () => this.countSel());
    },

    countSel() {
        const n = document.querySelectorAll('.tsk-cb:checked').length;
        const el = document.querySelector('#tskSelN');
        if (el) el.textContent = n;
    },

    async execTask(id) {
        UI.toast('任务执行中，请查看日志...');
        const r = await API.executeTask(id).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('任务已执行'); this.refreshTasks(); }
        else UI.err(r.error || '执行失败');
    },

    async genStrm(id) {
        const r = await API.genStrmByTask([id], false).catch(e => ({ success: false, error: e.message }));
        if (r.success) UI.ok('STRM 生成任务已开始');
        else UI.err(r.error);
    },

    async delTask(id) {
        const choice = await UI.modal({
            title: '删除任务',
            body: `<p style="font-size:13px;margin-bottom:14px">是否同时删除云端已转存的文件？</p>
                <label class="check" style="margin-bottom:8px"><input type="checkbox" id="delCloudChk"> 同时删除云端文件与本地 STRM</label>`,
            footer: `<button class="btn btn-danger" data-act="del">删除</button><button class="btn btn-ghost" data-act="cancel">取消</button>`
        }).then(m => new Promise(res => {
            m.foot.querySelector('[data-act=del]').onclick = () => res({ ok: true, cloud: m.body.querySelector('#delCloudChk').checked, m });
            m.foot.querySelector('[data-act=cancel]').onclick = () => res({ ok: false, m });
        }));
        if (!choice.ok) { choice.m.close(); return; }
        choice.m.close();
        const r = await API.deleteTask(id, choice.cloud).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('已删除'); this.refreshTasks(); } else UI.err(r.error);
    },

    async batchDelTasks() {
        const ids = Array.from(document.querySelectorAll('.tsk-cb:checked')).map(cb => parseInt(cb.value));
        if (!ids.length) return UI.warn('请先选择任务');
        if (!await UI.confirm('批量删除', `确定删除选中的 ${ids.length} 个任务？（不删云端文件）`)) return;
        const r = await API.batchDeleteTasks(ids, false).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('已批量删除'); this.refreshTasks(); } else UI.err(r.error);
    },

    /* ---------- 新建任务（向导式） ---------- */
    async openCreateTask(prefillShare = '') {
        const accounts = this.accountsCache.filter(a => !a.username.startsWith('n_'));
        if (!accounts.length) return UI.warn('请先在「账号管理」添加网盘账号');

        const m = UI.modal({
            title: '新建转存任务',
            size: 'modal-lg',
            body: `
            <div class="form-grid">
                <div class="field">
                    <label>目标账号<span class="req">*</span></label>
                    <select class="select" id="ctAccount">
                        ${accounts.map(a => `<option value="${a.id}" ${a.isDefault ? 'selected' : ''}>${driveIcon(a.driveType)} ${esc(a.alias || a.username)}（${driveName(a.driveType)}）</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>目标目录<span class="req">*</span></label>
                    <div style="display:flex;gap:8px">
                        <input class="input" id="ctTargetFolderId" placeholder="点击右侧选择目录" readonly>
                        <button class="btn" type="button" id="ctPickFolder">📁</button>
                    </div>
                    <input type="hidden" id="ctTargetFolder">
                </div>
                <div class="field full">
                    <label>分享链接<span class="req">*</span></label>
                    <textarea class="textarea" id="ctShareLink" rows="2" placeholder="粘贴分享链接（支持天翼/移动139/夸克/UC/阿里，可内嵌提取码）">${esc(prefillShare)}</textarea>
                    <div class="hint" id="ctShareHint">粘贴后自动解析分享目录</div>
                </div>
                <div class="field full" id="ctShareFoldersGroup" style="display:none">
                    <label>分享目录（勾选要转存的目录）</label>
                    <div class="tree" id="ctShareFolders" style="max-height:180px"></div>
                </div>
                <div class="field">
                    <label>任务名称<span class="req">*</span></label>
                    <input class="input" id="ctTaskName" placeholder="自动填充，可修改">
                </div>
                <div class="field">
                    <label>总集数（剧集用，0/空=不限）</label>
                    <input class="input" type="number" id="ctTotalEpisodes" value="0" min="0">
                </div>
                <div class="field">
                    <label>访问码（加密分享）</label>
                    <input class="input" id="ctAccessCode" placeholder="无则留空">
                </div>
                <div class="field">
                    <label>备注</label>
                    <input class="input" id="ctRemark" placeholder="可选">
                </div>
                <div class="field full">
                    <label>高级：文件名过滤（可选）</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                        <input class="input" id="ctMatchPattern" placeholder="匹配模式">
                        <select class="select" id="ctMatchOperator">
                            <option value="">操作符</option>
                            <option value="contains">包含</option>
                            <option value="notContains">不包含</option>
                            <option value="eq">等于</option>
                            <option value="lt">小于</option>
                            <option value="gt">大于</option>
                        </select>
                        <input class="input" id="ctMatchValue" placeholder="匹配值">
                    </div>
                </div>
                <div class="field full">
                    <label>高级：正则重命名（可选）</label>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                        <input class="input" id="ctSourceRegex" placeholder="源文件名正则">
                        <input class="input" id="ctTargetRegex" placeholder="目标文件名正则">
                    </div>
                </div>
                <div class="field">
                    <label class="check" style="margin-top:26px"><input type="checkbox" id="ctEnableCron"> 启用定时执行</label>
                </div>
                <div class="field" id="ctCronBox" style="display:none">
                    <label>Cron 表达式</label>
                    <input class="input" id="ctCronExpression" placeholder="例：0 19-23 * * *">
                </div>
                <div class="field full">
                    <label class="check"><input type="checkbox" id="ctEnableScraper" checked> 启用刮削（生成 NFO/海报）</label>
                </div>
            </div>`,
            footer: `<button class="btn btn-primary" data-act="create">创建任务</button><button class="btn btn-ghost" data-act="cancel">取消</button>`
        });

        const $ = id => m.body.querySelector('#' + id);

        // 选择目标目录
        $('ctPickFolder').onclick = () => {
            const accId = $('ctAccount').value;
            UI.folderTree({
                accountId: accId,
                onSelect: ({ id, name }) => {
                    $('ctTargetFolderId').value = id;
                    $('ctTargetFolder').value = name;
                }
            });
        };

        // 分享链接解析
        let parseTimer;
        $('ctShareLink').oninput = () => {
            clearTimeout(parseTimer);
            parseTimer = setTimeout(() => this.parseShareForCreate(m), 600);
        };
        $('ctEnableCron').onchange = e => $('ctCronBox').style.display = e.target.checked ? '' : 'none';

        if (prefillShare) setTimeout(() => this.parseShareForCreate(m), 200);

        m.foot.querySelector('[data-act=create]').onclick = async () => {
            const selectedFolders = Array.from(m.body.querySelectorAll('input[name=ctShareFolder]:checked')).map(cb => cb.value);
            const body = {
                accountId: parseInt($('ctAccount').value),
                shareLink: $('ctShareLink').value.trim(),
                totalEpisodes: parseInt($('ctTotalEpisodes').value) || 0,
                targetFolderId: $('ctTargetFolderId').value.trim(),
                targetFolder: $('ctTargetFolder').value || $('ctTargetFolderId').value,
                accessCode: $('ctAccessCode').value.trim(),
                matchPattern: $('ctMatchPattern').value.trim(),
                matchOperator: $('ctMatchOperator').value,
                matchValue: $('ctMatchValue').value.trim(),
                remark: $('ctRemark').value.trim(),
                enableCron: $('ctEnableCron').checked,
                cronExpression: $('ctCronExpression').value.trim(),
                sourceRegex: $('ctSourceRegex').value.trim(),
                targetRegex: $('ctTargetRegex').value.trim(),
                taskName: $('ctTaskName').value.trim(),
                enableTaskScraper: $('ctEnableScraper').checked,
                selectedFolders,
                overwriteFolder: 0,
            };
            if (!body.shareLink) return UI.warn('请填写分享链接');
            if (!body.targetFolderId) return UI.warn('请选择目标目录');
            if (!body.taskName) return UI.warn('任务名称不能为空');
            if (body.matchPattern && !body.matchValue) return UI.warn('填了匹配模式，匹配值必须填');
            if (body.enableCron && !body.cronExpression) return UI.warn('启用定时执行需填写 Cron 表达式');
            if (body.targetRegex && !body.sourceRegex) return UI.warn('填了目标正则，源正则必须填');
            if (!selectedFolders.length) return UI.warn('至少选择一个分享目录');

            const btn = m.foot.querySelector('[data-act=create]');
            btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 创建中...';
            const r = await API.createTask(body).catch(e => ({ success: false, error: e.message }));
            btn.disabled = false; btn.textContent = '创建任务';
            if (r.success) {
                m.close(); UI.ok('任务创建成功');
                if (this.route === 'tasks') this.refreshTasks();
            } else if (r.error === 'folder already exists') {
                if (await UI.confirm('目录已存在', '目标目录已存在，是否覆盖创建？')) {
                    body.overwriteFolder = 1;
                    const r2 = await API.createTask(body).catch(e => ({ success: false, error: e.message }));
                    if (r2.success) { m.close(); UI.ok('任务创建成功'); this.refreshTasks(); }
                    else UI.err(r2.error);
                }
            } else UI.err(r.error || '创建失败');
        };
        m.foot.querySelector('[data-act=cancel]').onclick = m.close;
    },

    async parseShareForCreate(m) {
        const $ = id => m.body.querySelector('#' + id);
        const raw = $('ctShareLink').value.trim();
        const accountId = $('ctAccount').value;
        if (!raw || !accountId) return;
        const hint = $('ctShareHint');
        const group = $('ctShareFoldersGroup');

        // 多网盘链接识别
        const drv = detectDriveType(raw);
        const acc = this.accountsCache.find(a => a.id == accountId);
        const accDrive = acc?.driveType || 'cloud189';

        if (drv && drv !== 'cloud189') {
            if (accDrive !== drv) {
                hint.textContent = `⚠️ 这是${driveName(drv)}链接，当前选择的是${driveName(accDrive)}账号，请切换账号`;
                hint.style.color = 'var(--c-red)';
                return;
            }
            hint.textContent = `✅ 已识别${driveName(drv)}链接，创建后将由驱动自动转存`;
            hint.style.color = 'var(--c-green)';
            group.style.display = '';
            $('ctShareFolders').innerHTML = `<label class="check" style="padding:8px"><input type="checkbox" name="ctShareFolder" value="root" checked> 全部内容（驱动自动转存）</label>`;
            if (!$('ctTaskName').value) $('ctTaskName').value = `${driveName(drv)}转存`;
            return;
        }

        const { url, accessCode } = parseCloudShare(raw);
        if (!url) { hint.textContent = '未识别到有效链接'; return; }
        if (accessCode && !$('ctAccessCode').value) $('ctAccessCode').value = accessCode;

        hint.textContent = '解析中...'; hint.style.color = '';
        try {
            const r = await API.parseShare(url, accountId, $('ctAccessCode').value.trim() || accessCode);
            if (r.success) {
                const folders = r.data || [];
                hint.textContent = `✅ 解析成功，共 ${folders.length} 个分享目录`; hint.style.color = 'var(--c-green)';
                group.style.display = '';
                $('ctShareFolders').innerHTML = folders.map(f =>
                    `<label class="check" style="padding:6px 10px;border-radius:5px"><input type="checkbox" name="ctShareFolder" value="${esc(f.id)}" checked> ${esc(f.name)}</label>`
                ).join('');
                if (folders.length && !$('ctTaskName').value) $('ctTaskName').value = folders[0].name;
            } else {
                hint.textContent = `解析失败: ${r.error || '请检查链接与访问码'}`; hint.style.color = 'var(--c-red)';
            }
        } catch (e) {
            hint.textContent = '解析失败: ' + e.message; hint.style.color = 'var(--c-red)';
        }
    },

    /* ---------- 任务文件管理 ---------- */
    async showTaskFiles(taskId) {
        const task = (window.__tasks || []).find(t => t.id === taskId);
        if (!task) return UI.warn('任务不存在');
        const m = UI.modal({
            title: `文件管理 — ${task.resourceName || '#' + taskId}`,
            size: 'modal-xl',
            body: '<div class="loading-center"><span class="spin"></span></div>'
        });
        const r = await API.folderFiles(task.accountId, taskId).catch(e => ({ success: false, error: e.message }));
        if (!r.success) { m.body.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${esc(r.error)}</div></div>`; return; }
        const files = r.data || [];
        window.__taskFiles = files;

        m.body.innerHTML = `
            <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
                <button class="btn btn-sm btn-primary" onclick="App.batchRename(${taskId})">✏️ 批量重命名</button>
                <button class="btn btn-sm" onclick="App.aiRenameFiles(${taskId})">🤖 AI 重命名</button>
                <button class="btn btn-sm btn-danger" onclick="App.delTaskFiles(${taskId})">🗑️ 删除选中</button>
            </div>
            <div class="table-wrap"><table class="tbl">
                <thead><tr><th style="width:30px"><input type="checkbox" id="fAll"></th><th>文件名</th><th>大小</th><th>时间</th></tr></thead>
                <tbody>${files.map((f, i) => `
                    <tr>
                        <td><input type="checkbox" class="f-cb" data-i="${i}"></td>
                        <td style="font-size:12.5px">${esc(f.name)}</td>
                        <td style="color:var(--t-sub)">${formatBytes(f.size)}</td>
                        <td style="color:var(--t-sub);font-size:11px">${esc(f.lastOpTime || '')}</td>
                    </tr>`).join('')}
                </tbody>
            </table></div>`;
        m.body.querySelector('#fAll').onchange = e => m.body.querySelectorAll('.f-cb').forEach(cb => cb.checked = e.target.checked);
    },

    async delTaskFiles(taskId) {
        const cbs = Array.from(document.querySelectorAll('.f-cb:checked'));
        if (!cbs.length) return UI.warn('请先选择文件');
        const files = cbs.map(cb => window.__taskFiles[parseInt(cb.dataset.i)]).map(f => ({ fileId: f.id, fileName: f.name }));
        if (!await UI.confirm('删除文件', `确定删除选中的 ${files.length} 个文件？（将同时删除云端与 STRM）`)) return;
        const r = await API.deleteTaskFiles(taskId, files).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('删除成功'); document.querySelector('.modal-x').click(); this.showTaskFiles(taskId); }
        else UI.err(r.error);
    },

    async batchRename(taskId) {
        const task = (window.__tasks || []).find(t => t.id === taskId);
        const cbs = Array.from(document.querySelectorAll('.f-cb:checked'));
        if (!cbs.length) return UI.warn('请先选择文件');
        const files = cbs.map(cb => window.__taskFiles[parseInt(cb.dataset.i)]).map(f => ({ fileId: f.id, oldName: f.name, destFileName: f.name }));
        const m = UI.modal({
            title: '批量重命名',
            body: `
                <div class="field"><label>源文件名正则</label><input class="input" id="rnSrc" value="${esc(task?.sourceRegex || '')}"></div>
                <div class="field" style="margin-top:12px"><label>目标文件名正则</label><input class="input" id="rnDst" value="${esc(task?.targetRegex || '')}"></div>
                <div class="hint">JS replace 语义，$1 $2 引用捕获组</div>`,
            footer: `<button class="btn btn-primary" data-act="ok">确定</button><button class="btn btn-ghost" data-act="cancel">取消</button>`
        });
        m.foot.querySelector('[data-act=ok]').onclick = async () => {
            const src = m.body.querySelector('#rnSrc').value;
            const dst = m.body.querySelector('#rnDst').value;
            let err = null;
            files.forEach(f => {
                try { f.destFileName = f.oldName.replace(new RegExp(src, 'g'), dst); } catch (e) { err = e.message; }
            });
            if (err) return UI.err('正则错误: ' + err);
            const r = await API.renameFiles({ taskId, accountId: task.accountId, files, sourceRegex: src, targetRegex: dst })
                .catch(e => ({ success: false, error: e.message }));
            if (r.success) { m.close(); UI.ok('重命名完成' + (r.data?.length ? `，${r.data.length} 个失败` : '')); }
            else UI.err(r.error);
        };
        m.foot.querySelector('[data-act=cancel]').onclick = m.close;
    },

    async aiRenameFiles(taskId) {
        const cbs = Array.from(document.querySelectorAll('.f-cb:checked'));
        if (!cbs.length) return UI.warn('请先选择文件');
        const files = cbs.map(cb => window.__taskFiles[parseInt(cb.dataset.i)]).map(f => ({ fileId: f.id, fileName: f.name, name: f.name, size: f.size }));
        UI.toast('AI 分析中...');
        const r = await API.aiRename(taskId, files).catch(e => ({ success: false, error: e.message }));
        if (r.success) {
            const list = r.data || [];
            const m = UI.modal({
                title: 'AI 重命名预览',
                size: 'modal-lg',
                body: `<div class="table-wrap"><table class="tbl">
                    <thead><tr><th>原文件名</th><th>新文件名</th></tr></thead>
                    <tbody>${list.map(f => `<tr><td style="font-size:12px;color:var(--t-sub)">${esc(f.fileName || f.oldName)}</td><td style="font-size:12.5px;font-weight:600">${esc(f.destFileName || f.newName)}</td></tr>`).join('')}</tbody>
                </table></div>`,
                footer: `<button class="btn btn-primary" data-act="apply">应用重命名</button><button class="btn btn-ghost" data-act="cancel">关闭</button>`
            });
            m.foot.querySelector('[data-act=apply]').onclick = async () => {
                const task = (window.__tasks || []).find(t => t.id === taskId);
                const applyFiles = list.map(f => ({ fileId: f.fileId || f.id, oldName: f.fileName || f.oldName, destFileName: f.destFileName || f.newName }));
                const r2 = await API.renameFiles({ taskId, accountId: task.accountId, files: applyFiles }).catch(e => ({ success: false, error: e.message }));
                if (r2.success) { m.close(); UI.ok('重命名完成'); } else UI.err(r2.error);
            };
            m.foot.querySelector('[data-act=cancel]').onclick = m.close;
        } else UI.err(r.error || 'AI 分析失败，请确认已配置 OpenAI');
    },

    /* ---------- 编辑任务 ---------- */
    async editTask(id) {
        const task = (window.__tasks || []).find(t => t.id === id);
        if (!task) return UI.warn('任务不存在');
        const m = UI.modal({
            title: `编辑任务 #${id}`,
            size: 'modal-lg',
            body: `
            <div class="form-grid">
                <div class="field"><label>资源名称</label><input class="input" id="etName" value="${esc(task.resourceName || '')}"></div>
                <div class="field"><label>状态</label>
                    <select class="select" id="etStatus">
                        ${['pending','processing','completed','error','disabled'].map(s => `<option value="${s}" ${task.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                </div>
                <div class="field"><label>当前集数</label><input class="input" type="number" id="etCur" value="${task.currentEpisodes || 0}"></div>
                <div class="field"><label>总集数</label><input class="input" type="number" id="etTotal" value="${task.totalEpisodes || 0}"></div>
                <div class="field"><label>保存目录 ID</label><input class="input" id="etFolderId" value="${esc(task.realFolderId || '')}"></div>
                <div class="field"><label>分享目录 ID</label><input class="input" id="etShareFolderId" value="${esc(task.shareFolderId || '')}"></div>
                <div class="field"><label>分享目录名</label><input class="input" id="etShareFolderName" value="${esc(task.shareFolderName || '')}"></div>
                <div class="field"><label>备注</label><input class="input" id="etRemark" value="${esc(task.remark || '')}"></div>
                <div class="field"><label>匹配模式</label><input class="input" id="etMatchPattern" value="${esc(task.matchPattern || '')}"></div>
                <div class="field"><label>匹配值</label><input class="input" id="etMatchValue" value="${esc(task.matchValue || '')}"></div>
                <div class="field full"><label class="check"><input type="checkbox" id="etCron" ${task.enableCron ? 'checked' : ''}> 启用定时执行</label></div>
                <div class="field full" id="etCronBox" style="display:${task.enableCron ? '' : 'none'}">
                    <label>Cron 表达式</label><input class="input" id="etCronExpr" value="${esc(task.cronExpression || '')}">
                </div>
                <div class="field full"><label class="check"><input type="checkbox" id="etScraper" ${task.enableTaskScraper ? 'checked' : ''}> 启用刮削</label></div>
            </div>`,
            footer: `<button class="btn btn-primary" data-act="save">保存</button><button class="btn btn-ghost" data-act="cancel">取消</button>`
        });
        m.body.querySelector('#etCron').onchange = e => m.body.querySelector('#etCronBox').style.display = e.target.checked ? '' : 'none';
        m.foot.querySelector('[data-act=save]').onclick = async () => {
            const b = m.body;
            const body = {
                resourceName: b.querySelector('#etName').value,
                status: b.querySelector('#etStatus').value,
                currentEpisodes: parseInt(b.querySelector('#etCur').value) || 0,
                totalEpisodes: parseInt(b.querySelector('#etTotal').value) || 0,
                realFolderId: b.querySelector('#etFolderId').value,
                realFolderName: task.realFolderName,
                shareFolderId: b.querySelector('#etShareFolderId').value,
                shareFolderName: b.querySelector('#etShareFolderName').value,
                remark: b.querySelector('#etRemark').value,
                matchPattern: b.querySelector('#etMatchPattern').value,
                matchOperator: task.matchOperator,
                matchValue: b.querySelector('#etMatchValue').value,
                enableCron: b.querySelector('#etCron').checked,
                cronExpression: b.querySelector('#etCronExpr').value,
                enableTaskScraper: b.querySelector('#etScraper').checked,
            };
            const r = await API.updateTask(id, body).catch(e => ({ success: false, error: e.message }));
            if (r.success) { m.close(); UI.ok('已保存'); this.refreshTasks(); } else UI.err(r.error);
        };
        m.foot.querySelector('[data-act=cancel]').onclick = m.close;
    },

    /* ==================== 资源搜索页 ==================== */
    async page_search(box) {
        box.innerHTML = `
            <div class="search-bar">
                <input class="input" id="resKw" placeholder="输入影视名 / 关键词，回车搜索...">
                <button class="btn btn-primary" onclick="App.doSearch()">🔍 聚合搜索</button>
                <button class="btn" onclick="App.doSearch('cloudsaver')">☁️ CloudSaver</button>
            </div>
            <div class="hint" style="margin-bottom:14px">聚合搜索 = 本地任务库 + 盘搜（需在设置中配置 pansouUrl）；CloudSaver 需配置服务地址</div>
            <div id="resBox"><div class="empty"><div class="ico">🔍</div><div class="txt">输入关键词开始搜索资源</div></div></div>
        `;
        box.querySelector('#resKw').onkeydown = e => { if (e.key === 'Enter') this.doSearch(); };
    },

    async doSearch(mode = 'all') {
        const kw = document.querySelector('#resKw').value.trim();
        if (!kw) return UI.warn('请输入关键词');
        const resBox = document.querySelector('#resBox');
        resBox.innerHTML = '<div class="loading-center"><span class="spin"></span> 搜索中...</div>';
        try {
            let items = [];
            if (mode === 'cloudsaver') {
                const r = await API.cloudsaverSearch(kw);
                if (!r.success) throw new Error(r.error || 'CloudSaver 搜索失败');
                items = (r.data || []).flatMap(d => (d.cloudLinks || []).map(l => ({ title: d.title, url: l.link, source: 'CloudSaver' })));
            } else {
                const r = await API.resourceSearch(kw);
                if (!r.success) throw new Error(r.error || '搜索失败');
                items = r.data || [];
            }
            window.__searchResults = items;
            if (!items.length) { resBox.innerHTML = '<div class="empty"><div class="ico">🤷</div><div class="txt">未搜到相关资源</div></div>'; return; }
            resBox.innerHTML = items.map((it, i) => `
                <div class="res-item">
                    <span class="tag ${detectDriveType(it.url) ? 'tag-blue' : 'tag-gray'}">${driveName(detectDriveType(it.url) || '')}</span>
                    <span class="r-title" title="${esc(it.title)}">${esc(it.title)}</span>
                    <span class="r-url" title="${esc(it.url)}">${esc(it.url || '')}</span>
                    <span class="tag tag-gray">${esc(it.source || '')}</span>
                    <a class="btn btn-sm btn-ghost" href="${esc(it.url)}" target="_blank">打开</a>
                    <button class="btn btn-sm btn-primary" onclick="App.searchToTask(${i})">转存入库</button>
                </div>`).join('');
        } catch (e) {
            resBox.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${esc(e.message)}</div></div>`;
        }
    },

    async searchToTask(i) {
        const it = (window.__searchResults || [])[i];
        if (!it?.url) return;
        this.openCreateTask(it.url);
    },

    /* ==================== 账号管理页 ==================== */
    async page_accounts(box) {
        const r = await API.accounts().catch(e => ({ error: e.message }));
        if (!r.success) { box.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${esc(r.error)}</div></div>`; return; }
        const accounts = r.data || [];
        this.accountsCache = accounts;

        box.innerHTML = `
            <div class="toolbar">
                <div class="spacer"></div>
                <button class="btn btn-primary" onclick="App.openAddAccount()">＋ 添加账号</button>
                <button class="btn" onclick="App.runHealthCheck()">🩺 全员巡检</button>
                <button class="btn btn-ghost" onclick="App.go('accounts')">🔄 刷新</button>
                <button class="btn btn-danger" onclick="App.clearRecycle()">🗑️ 清空回收站</button>
            </div>
            ${accounts.length === 0 ? '<div class="empty"><div class="ico">👤</div><div class="txt">暂无账号，点击「添加账号」接入网盘</div></div>' : `
            <div class="grid-2">${accounts.map(a => this.accountCard(a)).join('')}</div>`}
        `;
    },

    accountCard(a) {
        const cap = a.capacity?.cloudCapacityInfo || {};
        const fam = a.capacity?.familyCapacityInfo || {};
        const pct = cap.totalSize ? Math.min(100, (cap.usedSize / cap.totalSize) * 100).toFixed(1) : 0;
        const dt = a.driveType || 'cloud189';
        return `
        <div class="acc-card">
            <div class="acc-head">
                <div class="acc-ico" style="background:${driveColor(dt)}22">${driveIcon(dt)}</div>
                <div style="flex:1;min-width:0">
                    <div class="acc-name">${a.isDefault ? '⭐ ' : ''}${esc(a.alias || a.username)}</div>
                    <div class="acc-sub">${esc(a.username)} · ${driveName(dt)}</div>
                </div>
                ${UI.healthTag(a.runtimeStatus)}
            </div>
            ${cap.totalSize ? `
            <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--t-sub);margin-bottom:4px">
                    <span>个人云</span><span>${formatBytes(cap.usedSize)} / ${formatBytes(cap.totalSize)} (${pct}%)</span>
                </div>
                <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
            </div>` : ''}
            <div class="acc-rows">
                <div class="acc-row"><span class="k">家庭云容量</span><span class="v">${formatBytes(fam.usedSize)} / ${formatBytes(fam.totalSize)}</span></div>
                <div class="acc-row"><span class="k">媒体目录</span><span class="v" style="cursor:pointer" onclick="App.editStrmPrefix(${a.id},'cloud')">${esc(a.cloudStrmPrefix || '—')}</span></div>
                <div class="acc-row"><span class="k">本地目录</span><span class="v" style="cursor:pointer" onclick="App.editStrmPrefix(${a.id},'local')">${esc(a.localStrmPrefix || '—')}</span></div>
                <div class="acc-row"><span class="k">Emby 替换</span><span class="v" style="cursor:pointer" onclick="App.editStrmPrefix(${a.id},'emby')">${esc(a.embyPathReplace || '—')}</span></div>
                ${a.lastCheckError ? `<div class="acc-row"><span class="k">巡检错误</span><span class="v" style="color:var(--c-red)">${esc(a.lastCheckError)}</span></div>` : ''}
            </div>
            <div class="acc-actions">
                <button class="btn btn-sm" onclick="App.editAccount(${a.id})">✏️ 编辑</button>
                <button class="btn btn-sm" onclick="App.checkOneAccount(${a.id},'${dt}')">🩺 巡检</button>
                <button class="btn btn-sm" onclick="App.setAlias(${a.id},'${esc(a.alias || '')}')">🏷️ 别名</button>
                <button class="btn btn-sm" onclick="App.setDefaultAccount(${a.id})">⭐ 默认</button>
                <button class="btn btn-sm btn-danger" onclick="App.delAccount(${a.id})">🗑️ 删除</button>
            </div>
        </div>`;
    },

    async openAddAccount(editId = null) {
        const editing = editId ? this.accountsCache.find(a => a.id === editId) : null;
        const driveRes = await API.drives().catch(() => ({ data: [] }));
        const drives = driveRes.data || [];
        const curDrive = editing?.driveType || 'cloud189';

        const m = UI.modal({
            title: editing ? `编辑账号 — ${editing.username}` : '添加网盘账号',
            size: 'modal-lg',
            body: `
            <div class="form-grid">
                <div class="field">
                    <label>网盘类型<span class="req">*</span></label>
                    <select class="select" id="acDrive" ${editing ? 'disabled' : ''}>
                        ${(drives.length ? drives : Object.keys(DRIVE_META).map(d => ({ driveType: d, displayName: DRIVE_META[d].name }))).map(d =>
                            `<option value="${d.driveType}" ${curDrive === d.driveType ? 'selected' : ''}>${d.displayName}</option>`).join('')}
                    </select>
                </div>
                <div class="field">
                    <label>用户名 / 手机号</label>
                    <input class="input" id="acUser" value="${esc(editing?.username || '')}" placeholder="天翼手机号；移动139手机号" ${editing ? 'readonly' : ''}>
                </div>
                <div class="field" id="acPwdField">
                    <label>密码 / Token</label>
                    <input class="input" type="password" id="acPass" placeholder="天翼密码；阿里 Token">
                </div>
                <div class="field" id="acCookieField">
                    <label>Cookie / 凭据</label>
                    <input class="input" id="acCookie" value="${esc(editing?.cookies || '')}" placeholder="夸克/UC Cookie；移动139 Authorization">
                </div>
                <div class="field"><label>别名</label><input class="input" id="acAlias" value="${esc(editing?.alias || '')}"></div>
                <div class="field"><label>媒体目录（云盘路径）</label><input class="input" id="acCloud" value="${esc(editing?.cloudStrmPrefix || '')}"></div>
                <div class="field"><label>本地目录</label><input class="input" id="acLocal" value="${esc(editing?.localStrmPrefix || '')}"></div>
                <div class="field"><label>Emby 路径替换</label><input class="input" id="acEmby" value="${esc(editing?.embyPathReplace || '')}"></div>
                <div class="field full" id="acCaptcha" style="display:none">
                    <label>验证码</label>
                    <div style="display:flex;gap:10px;align-items:center">
                        <img id="acCaptchaImg" style="height:38px;border-radius:6px">
                        <input class="input" id="acCode" placeholder="输入图中验证码">
                    </div>
                </div>
                <div class="field full"><div class="hint">天翼：填手机号+密码；移动139：填 Authorization 凭据；夸克/UC：填 Cookie；阿里：填 Access Token</div></div>
            </div>`,
            footer: `<button class="btn btn-primary" data-act="save">${editing ? '保存' : '添加'}</button><button class="btn btn-ghost" data-act="cancel">取消</button>`
        });

        m.foot.querySelector('[data-act=save]').onclick = () => this.submitAccount(m, editing);
        m.foot.querySelector('[data-act=cancel]').onclick = m.close;
    },

    async submitAccount(m, editing) {
        const b = m.body;
        const driveType = b.querySelector('#acDrive').value;
        let username = b.querySelector('#acUser').value.trim();
        const password = b.querySelector('#acPass').value;
        const cookies = b.querySelector('#acCookie').value;
        const validateCode = b.querySelector('#acCode')?.value || '';
        const body = {
            driveType,
            username,
            password,
            cookies,
            alias: b.querySelector('#acAlias').value.trim(),
            validateCode,
            cloudStrmPrefix: b.querySelector('#acCloud').value.trim(),
            localStrmPrefix: b.querySelector('#acLocal').value.trim(),
            embyPathReplace: b.querySelector('#acEmby').value.trim(),
        };
        if (editing) username = editing.original_username || editing.username;
        if (!username && !cookies && !password) return UI.warn('用户名/密码/Cookie 至少填一项');
        if (editing) body.username = editing.original_username || editing.username;

        const btn = m.foot.querySelector('[data-act=save]');
        btn.disabled = true; btn.innerHTML = '<span class="spin"></span> 提交中...';
        const r = await API.createAccount(body).catch(e => ({ success: false, error: e.message }));
        btn.disabled = false; btn.textContent = editing ? '保存' : '添加';

        if (r.success) { m.close(); UI.ok('账号已保存'); this.go('accounts'); return; }
        if (r.code === 'NEED_CAPTCHA') {
            b.querySelector('#acCaptcha').style.display = '';
            b.querySelector('#acCaptchaImg').src = r.data.captchaUrl;
            return UI.warn('需要验证码，请输入后重新提交');
        }
        UI.err(r.error || '保存失败');
    },

    async editAccount(id) { this.openAddAccount(id); },

    async checkOneAccount(id, driveType) {
        UI.toast('巡检中...');
        const r = await API.driveHealth(driveType, id).catch(e => ({ success: false, error: e.message }));
        if (r.success && r.data?.valid) UI.ok(r.data.message || '账号正常');
        else UI.err(r.data?.message || r.error || '账号异常');
        this.go('accounts');
    },

    async setAlias(id, cur) {
        const v = await UI.prompt('修改别名', '新别名', cur);
        if (v === null) return;
        const r = await API.updateAlias(id, v).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('已更新'); this.go('accounts'); } else UI.err(r.error);
    },

    async setDefaultAccount(id) {
        const r = await API.setDefaultAccount(id).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('已设为默认'); this.go('accounts'); } else UI.err(r.error);
    },

    async editStrmPrefix(id, type) {
        const labels = { cloud: '媒体目录（云盘路径）', local: '本地目录', emby: 'Emby 路径替换' };
        const acc = this.accountsCache.find(a => a.id === id);
        const cur = type === 'cloud' ? acc?.cloudStrmPrefix : type === 'local' ? acc?.localStrmPrefix : acc?.embyPathReplace;
        const v = await UI.prompt('修改 ' + labels[type], labels[type], cur || '');
        if (v === null) return;
        const r = await API.updateStrmPrefix(id, v, type).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('已更新'); this.go('accounts'); } else UI.err(r.error);
    },

    async delAccount(id) {
        if (!await UI.confirm('删除账号', '删除后该账号的任务配置将失效。确定删除？')) return;
        const r = await API.deleteAccount(id).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('已删除'); this.go('accounts'); } else UI.err(r.error);
    },

    /* ==================== 网盘浏览页 ==================== */
    async page_browser(box) {
        const accRes = await API.accounts().catch(() => ({ data: [] }));
        this.accountsCache = accRes.data || [];
        const accounts = this.accountsCache;
        if (!accounts.length) { box.innerHTML = '<div class="empty"><div class="ico">👤</div><div class="txt">请先添加网盘账号</div></div>'; return; }

        box.innerHTML = `
            <div class="toolbar">
                <select class="select" id="bwAccount" style="max-width:280px">
                    ${accounts.map(a => `<option value="${a.id}">${driveIcon(a.driveType)} ${esc(a.alias || a.username)}（${driveName(a.driveType)}）</option>`).join('')}
                </select>
                <button class="btn" onclick="App.newFolder()">📁 新建目录</button>
                <div class="spacer"></div>
                <button class="btn btn-ghost" onclick="App.go('browser')">🔄 刷新</button>
            </div>
            <div class="hint" style="margin-bottom:12px" id="bwPath">路径：/（根目录）</div>
            <div id="bwList"><div class="loading-center"><span class="spin"></span></div></div>
        `;
        box.querySelector('#bwAccount').onchange = () => this.browseFolder('root', '/');
        this.browseFolder('root', '/');
    },

    async browseFolder(folderId, path) {
        const wrap = document.querySelector('#bwList');
        if (!wrap) return;
        const accountId = document.querySelector('#bwAccount').value;
        window.__bwAccountId = accountId;
        window.__bwFolderId = folderId;
        window.__bwPath = path;
        wrap.innerHTML = '<div class="loading-center"><span class="spin"></span> 加载目录...</div>';
        const r = await API.driveFiles(accountId, folderId).catch(e => ({ success: false, error: e.message }));
        if (!r.success) { wrap.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${esc(r.error)}</div></div>`; return; }
        const entries = r.data?.entries || [];
        const pathEl = document.querySelector('#bwPath');
        if (pathEl) pathEl.textContent = `路径：${path}`;

        wrap.innerHTML = `
        <div class="table-wrap"><table class="tbl">
            <thead><tr><th>名称</th><th>大小</th><th>修改时间</th><th style="width:200px">操作</th></tr></thead>
            <tbody>
                ${folderId !== 'root' ? `<tr style="cursor:pointer" onclick="App.browseFolder(window.__bwParentId, window.__bwParentPath)"><td colspan="4">📁 .. （返回上级）</td></tr>` : ''}
                ${entries.length === 0 ? '<tr><td colspan="4" style="text-align:center;color:var(--t-dim);padding:30px">空目录</td></tr>' : ''}
                ${entries.map(e => `
                    <tr>
                        <td>${e.isFolder
                            ? `<span style="cursor:pointer" onclick="App.browseFolder('${esc(e.fileId)}','${esc(path)}/${esc(e.fileName)}')">📁 ${esc(e.fileName)}</span>`
                            : `📄 ${esc(e.fileName)}`}</td>
                        <td style="color:var(--t-sub)">${e.isFolder ? '—' : formatBytes(e.fileSize)}</td>
                        <td style="color:var(--t-sub);font-size:11px">${esc((e.updatedAt || '').replace('T',' ').slice(0,19))}</td>
                        <td>
                            ${e.isFolder ? '' : `
                            <button class="btn btn-sm" onclick="App.getLink('${esc(e.fileId)}','${esc(e.fileName)}')">🔗 直链</button>`}
                            ${!e.isFolder ? `<button class="btn btn-sm btn-danger" onclick="App.delDriveFile('${esc(e.fileId)}','${esc(e.fileName)}')">🗑</button>` : ''}
                        </td>
                    </tr>`).join('')}
            </tbody>
        </table></div>`;
        // 记录父级
        const parts = path.split('/').filter(Boolean);
        window.__bwParentId = 'root'; // 简化：父级用 root 兜底，多级由面包屑回溯
        window.__bwParentPath = parts.slice(0, -1).join('/') || '/';
        window.__bwHistory = window.__bwHistory || [];
        window.__bwHistory.push({ id: folderId, path });
    },

    browseFolder(id, path) {
        // 重载实例方法（page_browser 中动态绑定）
        this.browseFolder(id, path);
    },

    async newFolder() {
        const name = await UI.prompt('新建目录', '目录名称', '');
        if (!name) return;
        const r = await API.createFolder(window.__bwAccountId, window.__bwFolderId, name).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('目录已创建'); this.browseFolder(window.__bwFolderId, window.__bwPath); }
        else UI.err(r.error);
    },

    async getLink(fileId, name) {
        UI.toast('解析直链中...');
        const r = await API.getDownloadUrl(window.__bwAccountId, fileId).catch(e => ({ success: false, error: e.message }));
        if (r.success) {
            const url = r.data.url;
            const m = UI.modal({
                title: '下载直链 — ' + name,
                body: `<div class="json-box">${esc(url)}</div>
                    <div class="hint" style="margin-top:10px">直链有时效（约 ${r.data.expireAt ? Math.round((r.data.expireAt - Date.now()) / 60000) + ' 分钟' : '30 分钟'}），过期请重新获取</div>`,
                footer: `<button class="btn btn-primary" data-act="copy">📋 复制</button><button class="btn btn-ghost" data-act="open">▶ 打开</button><button class="btn btn-ghost" data-act="close">关闭</button>`
            });
            m.foot.querySelector('[data-act=copy]').onclick = () => { navigator.clipboard.writeText(url); UI.ok('已复制'); };
            m.foot.querySelector('[data-act=open]').onclick = () => window.open(url, '_blank');
            m.foot.querySelector('[data-act=close]').onclick = m.close;
        } else UI.err(r.error);
    },

    async delDriveFile(fileId, name) {
        if (!await UI.confirm('删除文件', `确定删除「${name}」？`)) return;
        const r = await fetch(`/api/drives/account/${window.__bwAccountId}/files`, { method: 'DELETE' }).catch(e => null);
        UI.warn('当前版本删除接口需从任务文件管理操作');
    },

    /* ==================== 媒体库页 ==================== */
    async page_media(box) {
        const [strmRes, libRes, userRes] = await Promise.all([
            API.strmList('').catch(() => ({ data: [] })),
            API.embyLibraries().catch(() => ({ data: [] })),
            API.embyUsers().catch(() => ({ data: [] })),
        ]);
        const strmFiles = strmRes.data || [];
        const libs = libRes.data || [];
        const users = userRes.data || [];

        box.innerHTML = `
            <div class="stat-grid">
                <div class="stat"><div class="s-ico" style="background:rgba(32,107,249,.15)">📄</div><div><div class="s-num">${strmFiles.length}</div><div class="s-label">STRM 文件（根目录）</div></div></div>
                <div class="stat"><div class="s-ico" style="background:rgba(143,123,245,.15)">🎬</div><div><div class="s-num">${libs.length}</div><div class="s-label">Casby 媒体库</div></div></div>
                <div class="stat"><div class="s-ico" style="background:rgba(84,206,0,.13)">👥</div><div><div class="s-num">${users.length}</div><div class="s-label">Emby 用户</div></div></div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="dash-grid">
                <div class="card">
                    <div class="card-title"><span class="ico">⚡</span>STRM 全量生成</div>
                    <div class="card-desc">按账号扫描云端媒体目录，全量生成 STRM 文件</div>
                    <div id="strmAccList" style="display:grid;gap:6px;margin-bottom:12px">
                        ${this.accountsCache.length ? this.accountsCache.map(a => `
                            <label class="check"><input type="checkbox" class="strm-acc" value="${a.id}" checked> ${driveIcon(a.driveType)} ${esc(a.alias || a.username)}</label>
                        `).join('') : '<div class="hint">暂无账号</div>'}
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-primary btn-sm" onclick="App.genAllStrm(false)">生成（跳过已有）</button>
                        <button class="btn btn-sm" onclick="App.genAllStrm(true)">覆盖生成</button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title"><span class="ico">🎬</span>Casby 媒体库</div>
                    <div class="card-desc">虚拟 Emby 媒体库（/emby 端点）</div>
                    <div style="display:grid;gap:8px;margin-bottom:12px">
                        ${libs.length ? libs.map(l => `
                            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#141930;border-radius:6px">
                                <span>${l.collectionType === 'tvshows' ? '📺' : '🎞️'}</span>
                                <span style="flex:1;font-weight:600">${esc(l.name)}</span>
                                <span class="tag ${l.isActive ? 'tag-green' : 'tag-gray'}">${l.isActive ? '启用' : '停用'}</span>
                            </div>`).join('') : '<div class="hint">暂无媒体库</div>'}
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-sm btn-primary" onclick="App.addEmbyLib()">＋ 新建媒体库</button>
                        <button class="btn btn-sm" onclick="App.embyBootstrap()">🚀 初始化默认库</button>
                    </div>
                </div>

                <div class="card">
                    <div class="card-title"><span class="ico">👥</span>Emby 用户</div>
                    <div class="card-desc">Casby 虚拟 Emby 的用户</div>
                    <div style="display:grid;gap:8px;margin-bottom:12px">
                        ${users.length ? users.map(u => `
                            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#141930;border-radius:6px">
                                <span>👤</span>
                                <span style="flex:1;font-weight:600">${esc(u.username)}</span>
                                <span class="tag ${u.isDisabled ? 'tag-red' : 'tag-green'}">${u.isDisabled ? '禁用' : '正常'}</span>
                            </div>`).join('') : '<div class="hint">暂无用户</div>'}
                    </div>
                    <button class="btn btn-sm btn-primary" onclick="App.addEmbyUser()">＋ 新建用户</button>
                </div>

                <div class="card">
                    <div class="card-title"><span class="ico">📄</span>STRM 文件浏览器</div>
                    <div class="card-desc">服务器 strm/ 目录内容</div>
                    <div class="table-wrap" style="max-height:260px;overflow-y:auto">
                        <table class="tbl"><tbody>
                            ${strmFiles.slice(0, 50).map(f => `<tr><td style="font-size:12px">📄 ${esc(f.name || f)}</td></tr>`).join('') || '<tr><td style="color:var(--t-dim);padding:20px;text-align:center">空</td></tr>'}
                        </tbody></table>
                    </div>
                    ${strmFiles.length > 50 ? `<div class="hint">仅显示前 50 项，共 ${strmFiles.length} 项</div>` : ''}
                </div>
            </div>
        `;
    },

    async genAllStrm(overwrite) {
        const ids = Array.from(document.querySelectorAll('.strm-acc:checked')).map(cb => parseInt(cb.value));
        if (!ids.length) return UI.warn('请选择至少一个账号');
        const r = await API.strmGenerateAll(ids, overwrite).catch(e => ({ success: false, error: e.message }));
        if (r.success) UI.ok('STRM 全量生成已开始，请查看日志');
        else UI.err(r.error);
    },

    async addEmbyLib() {
        const m = UI.modal({
            title: '新建 Casby 媒体库',
            body: `
                <div class="field"><label>库名称<span class="req">*</span></label><input class="input" id="elName" placeholder="例：电影"></div>
                <div class="field" style="margin-top:12px"><label>类型</label>
                    <select class="select" id="elType"><option value="movies">电影</option><option value="tvshows">电视剧</option></select>
                </div>`,
            footer: `<button class="btn btn-primary" data-act="ok">创建</button><button class="btn btn-ghost" data-act="cancel">取消</button>`
        });
        m.foot.querySelector('[data-act=ok]').onclick = async () => {
            const name = m.body.querySelector('#elName').value.trim();
            if (!name) return UI.warn('请输入库名称');
            const r = await API.createEmbyLibrary({ name, collectionType: m.body.querySelector('#elType').value }).catch(e => ({ success: false, error: e.message }));
            if (r.success) { m.close(); UI.ok('已创建'); this.go('media'); } else UI.err(r.error);
        };
        m.foot.querySelector('[data-act=cancel]').onclick = m.close;
    },

    async embyBootstrap() {
        if (!await UI.confirm('初始化', '将创建默认用户 emby 与「电影/电视剧」媒体库。继续？')) return;
        const r = await API.embyBootstrap().catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('初始化成功'); this.go('media'); } else UI.err(r.error);
    },

    async addEmbyUser() {
        const m = UI.modal({
            title: '新建 Emby 用户',
            body: `
                <div class="field"><label>用户名<span class="req">*</span></label><input class="input" id="euName"></div>
                <div class="field" style="margin-top:12px"><label>密码（可空）</label><input class="input" type="password" id="euPass"></div>`,
            footer: `<button class="btn btn-primary" data-act="ok">创建</button><button class="btn btn-ghost" data-act="cancel">取消</button>`
        });
        m.foot.querySelector('[data-act=ok]').onclick = async () => {
            const username = m.body.querySelector('#euName').value.trim();
            if (!username) return UI.warn('请输入用户名');
            const r = await API.createEmbyUser(username, m.body.querySelector('#euPass').value).catch(e => ({ success: false, error: e.message }));
            if (r.success) { m.close(); UI.ok('已创建'); this.go('media'); } else UI.err(r.error);
        };
        m.foot.querySelector('[data-act=cancel]').onclick = m.close;
    },

    /* ==================== CAS 实验室页 ==================== */
    async page_cas(box) {
        const accRes = await API.accounts().catch(() => ({ data: [] }));
        this.accountsCache = accRes.data || [];
        const accounts = this.accountsCache;
        const driveRes = await API.drives().catch(() => ({ data: [] }));

        box.innerHTML = `
            <div class="grid-2">
                <div class="card">
                    <div class="card-title"><span class="ico">⚡</span>CAS 秒传入库</div>
                    <div class="card-desc">基于哈希指纹零带宽秒传，支持 管道符 / JSON / Base64 / cloud189://</div>
                    <div class="field" style="margin-bottom:12px">
                        <label>目标账号</label>
                        <select class="select" id="casAccount">
                            ${accounts.map(a => `<option value="${a.id}">${driveIcon(a.driveType)} ${esc(a.alias || a.username)}（${driveName(a.driveType)}）</option>`).join('')}
                        </select>
                    </div>
                    <div class="field" style="margin-bottom:12px">
                        <label>目标目录 ID（默认 root）</label>
                        <input class="input" id="casFolder" placeholder="root" value="root">
                    </div>
                    <div class="field" style="margin-bottom:12px">
                        <label>CAS 清单内容</label>
                        <textarea class="textarea" id="casContent" rows="6" placeholder='格式示例：&#10;1. 管道符：电影.mkv|10737418240|E80B...MD5|5D41...SliceMD5&#10;2. JSON：{"version":2,"fileName":"电影.mkv","fileSize":10737418240,"hashes":{"md5":"..."}}&#10;3. cloud189://Base64串'></textarea>
                    </div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                        <button class="btn btn-primary" onclick="App.doCasRapid()">⚡ 立即秒传</button>
                        <button class="btn" onclick="App.doCasPlay()">🎬 解析播放直链</button>
                        <button class="btn btn-ghost" onclick="App.casDemo()">📋 填入示例</button>
                    </div>
                    <div id="casResult" style="display:none;margin-top:12px"></div>
                </div>

                <div class="card">
                    <div class="card-title"><span class="ico">🛡️</span>CAS 指纹镜像</div>
                    <div class="card-desc">递归扫描网盘媒体目录，生成 .cas 指纹档案灾备</div>
                    <div class="field" style="margin-bottom:12px">
                        <label>扫描账号</label>
                        <select class="select" id="mirAccount">
                            ${accounts.map(a => `<option value="${a.id}">${driveIcon(a.driveType)} ${esc(a.alias || a.username)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field" style="margin-bottom:12px">
                        <label>扫描起始目录 ID</label>
                        <input class="input" id="mirScan" placeholder="root" value="root">
                    </div>
                    <div class="field" style="margin-bottom:12px">
                        <label>输出目录</label>
                        <input class="input" id="mirOut" placeholder="/cas" value="/cas">
                    </div>
                    <label class="check" style="margin-bottom:12px"><input type="checkbox" id="mirLocal" checked> 本地模式（不占网盘空间）</label>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-primary" onclick="App.startMirror()">🚀 启动镜像任务</button>
                        <button class="btn btn-ghost" onclick="App.loadMirrorTasks()">🔄 刷新任务</button>
                    </div>
                    <div id="mirTasks" style="margin-top:14px"></div>
                </div>

                <div class="card">
                    <div class="card-title"><span class="ico">🔗</span>分享转存（任意网盘）</div>
                    <div class="card-desc">粘贴分享链接，由对应驱动直接转存到目标账号</div>
                    <div class="field" style="margin-bottom:12px">
                        <label>目标账号</label>
                        <select class="select" id="ssAccount">
                            ${accounts.map(a => `<option value="${a.id}">${driveIcon(a.driveType)} ${esc(a.alias || a.username)}</option>`).join('')}
                        </select>
                    </div>
                    <div class="field" style="margin-bottom:12px">
                        <label>分享链接</label>
                        <textarea class="textarea" id="ssUrl" rows="2" placeholder="https://pan.quark.cn/s/xxx 或 https://yun.139.com/..."></textarea>
                    </div>
                    <button class="btn btn-primary" onclick="App.doSaveShare()">📥 立即转存</button>
                    <div id="ssResult" style="display:none;margin-top:12px"></div>
                </div>

                <div class="card">
                    <div class="card-title"><span class="ico">🧩</span>驱动能力矩阵</div>
                    <div class="card-desc">当前系统注册的全部网盘驱动</div>
                    <div class="cap-grid">
                        ${(driveRes.data || []).map(d => `
                            <div class="cap">
                                <div class="name">${driveIcon(d.driveType)} ${esc(d.displayName)}</div>
                                <div class="meta">
                                    ${d.capabilities?.rapidUpload ? '<span class="tag tag-blue">秒传</span>' : ''}
                                    ${d.capabilities?.shareSave ? '<span class="tag tag-green">转存</span>' : ''}
                                    ${d.capabilities?.directLink ? '<span class="tag tag-purple">直链</span>' : ''}
                                    ${d.capabilities?.familyCloud ? '<span class="tag tag-yellow">家庭云</span>' : ''}
                                </div>
                            </div>`).join('')}
                    </div>
                </div>
            </div>
        `;
        this.loadMirrorTasks();
    },

    casDemo() {
        document.querySelector('#casContent').value =
`流浪地球2.2023.2160p.WEB-DL.H265.mkv|89442591232|E80B5017098950FC58AAD83C8C14978E|5D41402ABC4B2A76B9719D911017C592`;
    },

    async doCasRapid() {
        const accountId = document.querySelector('#casAccount').value;
        const targetFolderId = document.querySelector('#casFolder').value.trim() || 'root';
        const casContent = document.querySelector('#casContent').value.trim();
        if (!casContent) return UI.warn('请粘贴 CAS 清单');
        const box = document.querySelector('#casResult');
        box.style.display = ''; box.innerHTML = '<div class="loading-center" style="padding:20px"><span class="spin"></span> 秒传中...</div>';
        const r = await API.rapidUpload(accountId, targetFolderId, casContent).catch(e => ({ success: false, error: e.message }));
        box.innerHTML = `<div class="json-box">${esc(JSON.stringify(r, null, 2))}</div>`;
        if (r.success) UI.ok(r.message || '秒传成功'); else UI.err(r.message || r.error || '秒传未命中');
    },

    async doCasPlay() {
        const accountId = document.querySelector('#casAccount').value;
        const casContent = document.querySelector('#casContent').value.trim();
        if (!casContent) return UI.warn('请粘贴 CAS 清单');
        const box = document.querySelector('#casResult');
        box.style.display = ''; box.innerHTML = '<div class="loading-center" style="padding:20px"><span class="spin"></span> 解析直链中...</div>';
        const r = await API.playInfo(accountId, { casContent }).catch(e => ({ success: false, error: e.message }));
        box.innerHTML = `<div class="json-box">${esc(JSON.stringify(r, null, 2))}</div>`;
        if (r.success) UI.ok('直链解析成功'); else UI.err(r.error || '解析失败');
    },

    async startMirror() {
        const accountId = parseInt(document.querySelector('#mirAccount').value);
        const body = {
            scanPath: document.querySelector('#mirScan').value.trim() || 'root',
            outputDir: document.querySelector('#mirOut').value.trim() || '/cas',
            localMode: document.querySelector('#mirLocal').checked,
        };
        const r = await API.startCasMirror(accountId, body).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('镜像任务已启动'); this.loadMirrorTasks(); } else UI.err(r.error);
    },

    async loadMirrorTasks() {
        const box = document.querySelector('#mirTasks');
        if (!box) return;
        const r = await API.casMirrorTasks().catch(() => ({ data: [] }));
        const tasks = r.data || [];
        box.innerHTML = tasks.length ? `
            <div class="table-wrap"><table class="tbl">
                <thead><tr><th>任务</th><th>账号</th><th>进度</th><th>状态</th></tr></thead>
                <tbody>${tasks.map(t => `<tr>
                    <td style="font-size:11px;font-family:var(--mono)">${esc(t.taskId.slice(0, 18))}</td>
                    <td style="font-size:12px">${esc(t.accountAlias || '')}</td>
                    <td style="font-size:12px">${t.processedFiles}/${t.totalFiles}（成功 ${t.successFiles}）</td>
                    <td><span class="tag ${t.status === 'done' ? 'tag-green' : t.status === 'failed' ? 'tag-red' : 'tag-blue'}">${esc(t.status)}</span></td>
                </tr>`).join('')}</tbody>
            </table></div>` : '<div class="hint">暂无镜像任务</div>';
    },

    async doSaveShare() {
        const accountId = document.querySelector('#ssAccount').value;
        const shareUrl = document.querySelector('#ssUrl').value.trim();
        if (!shareUrl) return UI.warn('请粘贴分享链接');
        const box = document.querySelector('#ssResult');
        box.style.display = ''; box.innerHTML = '<div class="loading-center" style="padding:20px"><span class="spin"></span> 转存中...</div>';
        const r = await API.saveShare(accountId, shareUrl, 'root').catch(e => ({ success: false, error: e.message }));
        box.innerHTML = `<div class="json-box">${esc(JSON.stringify(r, null, 2))}</div>`;
        if (r.success) UI.ok('转存成功'); else UI.err(r.error || '转存失败');
    },

    /* ==================== 系统设置页 ==================== */
    async page_settings(box) {
        const r = await API.getSettings().catch(e => ({ error: e.message }));
        if (!r.success) { box.innerHTML = `<div class="empty"><div class="ico">⚠️</div><div class="txt">${esc(r.error)}</div></div>`; return; }
        const s = r.data || {};
        this.settingsCache = s;

        const TABS = [
            ['task', '📋 任务调度'], ['push', '📨 推送通知'], ['proxy', '🌐 网络代理'],
            ['media', '🎬 媒体刮削'], ['ai', '🤖 AI / OpenAI'], ['system', '🔐 系统'],
        ];
        box.innerHTML = `
            <div class="settings-nav" id="setNav">
                ${TABS.map(([id, name], i) => `<div class="settings-tab ${i === 0 ? 'active' : ''}" data-tab="${id}">${name}</div>`).join('')}
            </div>
            <div id="setBody"></div>
        `;
        box.querySelectorAll('.settings-tab').forEach(t => t.onclick = () => {
            box.querySelectorAll('.settings-tab').forEach(x => x.classList.remove('active'));
            t.classList.add('active');
            this.renderSettingsTab(t.dataset.tab, s);
        });
        this.renderSettingsTab('task', s);
    },

    renderSettingsTab(tab, s) {
        const body = document.querySelector('#setBody');
        const T = s.task || {}, P = s.proxy || {};

        if (tab === 'task') {
            body.innerHTML = `
            <div class="card">
                <div class="card-title">任务调度与转存策略</div>
                <div class="form-grid" style="margin-top:12px">
                    <div class="field"><label>任务过期天数（无更新即完结）</label><input class="input set-input" type="number" data-k="task.taskExpireDays" value="${T.taskExpireDays ?? 3}"></div>
                    <div class="field"><label>任务检查 Cron</label><input class="input set-input" data-k="task.taskCheckCron" value="${esc(T.taskCheckCron || '0 19-23 * * *')}"></div>
                    <div class="field"><label>回收站清理 Cron</label><input class="input set-input" data-k="task.cleanRecycleCron" value="${esc(T.cleanRecycleCron || '0 */8 * * *')}"></div>
                    <div class="field"><label>最大重试次数</label><input class="input set-input" type="number" data-k="task.maxRetries" value="${T.maxRetries ?? 3}"></div>
                    <div class="field"><label>重试间隔（秒，≥60）</label><input class="input set-input" type="number" data-k="task.retryInterval" value="${T.retryInterval ?? 300}"></div>
                    <div class="field"><label>媒体文件后缀</label><input class="input set-input" data-k="task.mediaSuffix" value="${esc(T.mediaSuffix || '.mkv;.mp4;.ts')}"></div>
                    <div class="field full"><label class="check"><input type="checkbox" class="set-input" data-k="task.enableOnlySaveMedia" ${T.enableOnlySaveMedia ? 'checked' : ''}> 仅保存媒体文件</label></div>
                    <div class="field full"><label class="check"><input type="checkbox" class="set-input" data-k="task.enableAutoCreateFolder" ${T.enableAutoCreateFolder ? 'checked' : ''}> 目录不存在时自动创建</label></div>
                    <div class="field full"><label class="check"><input type="checkbox" class="set-input" data-k="task.enableAutoClearRecycle" ${T.enableAutoClearRecycle ? 'checked' : ''}> 自动清理个人云回收站</label></div>
                    <div class="field full"><label class="check"><input type="checkbox" class="set-input" data-k="task.enableAutoClearFamilyRecycle" ${T.enableAutoClearFamilyRecycle ? 'checked' : ''}> 自动清理家庭云回收站</label></div>
                </div>
            </div>
            ${this.saveBtn()}`;
        }

        if (tab === 'push') {
            const W = s.wecom || {}, TG = s.telegram || {}, WX = s.wxpusher || {}, B = s.bark || {}, PP = s.pushplus || {}, TB = TG.bot || {};
            body.innerHTML = `
            <div class="card">
                <div class="card-title">企业微信</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="wecom.enable" ${W.enable ? 'checked' : ''}> 启用</label></div>
                    <div class="field"><label>Webhook</label><input class="input set-input" data-k="wecom.webhook" value="${esc(W.webhook || '')}"></div>
                </div>
            </div>
            <div class="card">
                <div class="card-title">Telegram</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="telegram.enable" ${TG.enable ? 'checked' : ''}> 启用通知</label></div>
                    <div class="field"><label>Bot Token</label><input class="input set-input" data-k="telegram.botToken" value="${esc(TG.botToken || '')}"></div>
                    <div class="field"><label>Chat ID</label><input class="input set-input" data-k="telegram.chatId" value="${esc(TG.chatId || '')}"></div>
                    <div class="field"><label>CF 代理域名</label><input class="input set-input" data-k="telegram.proxyDomain" value="${esc(TG.proxyDomain || '')}"></div>
                </div>
                <div class="sec-title" style="font-size:13px;margin-top:16px">Telegram Bot（交互式转存机器人）</div>
                <div class="form-grid">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="telegram.bot.enable" ${TB.enable ? 'checked' : ''}> 启用 Bot</label></div>
                    <div class="field"><label>Bot Token</label><input class="input set-input" data-k="telegram.bot.botToken" value="${esc(TB.botToken || '')}"></div>
                    <div class="field"><label>Chat ID</label><input class="input set-input" data-k="telegram.bot.chatId" value="${esc(TB.chatId || '')}"></div>
                </div>
            </div>
            <div class="card">
                <div class="card-title">WxPusher / Bark / PushPlus</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="wxpusher.enable" ${WX.enable ? 'checked' : ''}> WxPusher</label></div>
                    <div class="field"><label>WxPusher SPT</label><input class="input set-input" data-k="wxpusher.spt" value="${esc(WX.spt || '')}"></div>
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="bark.enable" ${B.enable ? 'checked' : ''}> Bark</label></div>
                    <div class="field"><label>Bark 服务地址</label><input class="input set-input" data-k="bark.serverUrl" value="${esc(B.serverUrl || '')}"></div>
                    <div class="field"><label>Bark Key</label><input class="input set-input" data-k="bark.key" value="${esc(B.key || '')}"></div>
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="pushplus.enable" ${PP.enable ? 'checked' : ''}> PushPlus</label></div>
                    <div class="field"><label>PushPlus Token</label><input class="input set-input" data-k="pushplus.token" value="${esc(PP.token || '')}"></div>
                </div>
            </div>
            ${this.saveBtn()}`;
        }

        if (tab === 'proxy') {
            body.innerHTML = `
            <div class="card">
                <div class="card-title">网络代理</div>
                <div class="card-desc">供 Telegram / TMDB / OpenAI / 天翼 API 使用</div>
                <div class="form-grid">
                    <div class="field"><label>主机</label><input class="input set-input" data-k="proxy.host" value="${esc(P.host || '')}"></div>
                    <div class="field"><label>端口</label><input class="input set-input" type="number" data-k="proxy.port" value="${P.port || ''}"></div>
                    <div class="field"><label>用户名</label><input class="input set-input" data-k="proxy.username" value="${esc(P.username || '')}"></div>
                    <div class="field"><label>密码</label><input class="input set-input" type="password" data-k="proxy.password" value="${esc(P.password || '')}"></div>
                </div>
                <div class="sec-title" style="font-size:13px;margin-top:14px">代理生效范围</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px">
                    ${['telegram', 'tmdb', 'openai', 'cloud189', 'customPush'].map(k => `
                        <label class="check"><input type="checkbox" class="set-input" data-k="proxy.services.${k}" ${P.services?.[k] ? 'checked' : ''}> ${k}</label>`).join('')}
                </div>
            </div>
            ${this.saveBtn()}`;
        }

        if (tab === 'media') {
            const E = s.emby || {}, CS = s.cloudSaver || {}, TM = s.tmdb || {}, ST = s.strm || {}, AL = s.alist || {};
            body.innerHTML = `
            <div class="card">
                <div class="card-title">STRM 与 Emby</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="strm.enable" ${ST.enable ? 'checked' : ''}> 启用 STRM 生成</label></div>
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="emby.enable" ${E.enable ? 'checked' : ''}> 启用 Emby 通知</label></div>
                    <div class="field"><label>Emby 服务地址</label><input class="input set-input" data-k="emby.serverUrl" value="${esc(E.serverUrl || '')}"></div>
                    <div class="field"><label>Emby API Key</label><input class="input set-input" data-k="emby.apiKey" value="${esc(E.apiKey || '')}"></div>
                </div>
            </div>
            <div class="card">
                <div class="card-title">CloudSaver 资源搜索</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label>服务地址</label><input class="input set-input" data-k="cloudSaver.baseUrl" value="${esc(CS.baseUrl || '')}"></div>
                    <div class="field"><label>用户名</label><input class="input set-input" data-k="cloudSaver.username" value="${esc(CS.username || '')}"></div>
                    <div class="field"><label>密码</label><input class="input set-input" type="password" data-k="cloudSaver.password" value="${esc(CS.password || '')}"></div>
                </div>
            </div>
            <div class="card">
                <div class="card-title">TMDB 刮削</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="tmdb.enableScraper" ${TM.enableScraper ? 'checked' : ''}> 启用刮削</label></div>
                    <div class="field"><label>TMDB API Key</label><input class="input set-input" data-k="tmdb.tmdbApiKey" value="${esc(TM.tmdbApiKey || '')}"></div>
                </div>
            </div>
            <div class="card">
                <div class="card-title">Alist</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="alist.enable" ${AL.enable ? 'checked' : ''}> 启用</label></div>
                    <div class="field"><label>服务地址</label><input class="input set-input" data-k="alist.baseUrl" value="${esc(AL.baseUrl || '')}"></div>
                    <div class="field"><label>API Key</label><input class="input set-input" data-k="alist.apiKey" value="${esc(AL.apiKey || '')}"></div>
                </div>
            </div>
            ${this.saveBtn('media')}`;
        }

        if (tab === 'ai') {
            const O = s.openai || {};
            body.innerHTML = `
            <div class="card">
                <div class="card-title">OpenAI 兼容 API</div>
                <div class="card-desc">用于 AI 智能识别与重命名</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label class="check"><input type="checkbox" class="set-input" data-k="openai.enable" ${O.enable ? 'checked' : ''}> 启用</label></div>
                    <div class="field"><label>Base URL</label><input class="input set-input" data-k="openai.baseUrl" value="${esc(O.baseUrl || '')}" placeholder="https://api.openai.com/v1"></div>
                    <div class="field"><label>API Key</label><input class="input set-input" type="password" data-k="openai.apiKey" value="${esc(O.apiKey || '')}"></div>
                    <div class="field"><label>模型</label><input class="input set-input" data-k="openai.model" value="${esc(O.model || 'GLM-4-Flash-250414')}"></div>
                    <div class="field"><label>重命名模板（剧集）</label><input class="input set-input" data-k="openai.rename.template" value="${esc(O.rename?.template || '{name} - {se}{ext}')}"></div>
                    <div class="field"><label>重命名模板（电影）</label><input class="input set-input" data-k="openai.rename.movieTemplate" value="${esc(O.rename?.movieTemplate || '{name} ({year}){ext}')}"></div>
                </div>
            </div>
            ${this.saveBtn('media')}`;
        }

        if (tab === 'system') {
            const SY = s.system || {};
            body.innerHTML = `
            <div class="card">
                <div class="card-title">系统账号与安全</div>
                <div class="form-grid" style="margin-top:10px">
                    <div class="field"><label>登录用户名</label><input class="input set-input" data-k="system.username" value="${esc(SY.username || 'admin')}"></div>
                    <div class="field"><label>登录密码</label><input class="input set-input" type="password" data-k="system.password" value="${esc(SY.password || '')}"></div>
                    <div class="field full"><label>API Key（供外部系统 x-api-key 调用）</label><input class="input set-input" data-k="system.apiKey" value="${esc(SY.apiKey || '')}"></div>
                    <div class="field full"><label>Base URL（推送链接前缀）</label><input class="input set-input" data-k="system.baseUrl" value="${esc(SY.baseUrl || '')}"></div>
                </div>
            </div>
            ${this.saveBtn()}`;
        }

        // 绑定保存按钮
        const saveBtn = body.querySelector('[data-act=save-settings]');
        if (saveBtn) saveBtn.onclick = () => this.saveSettingsFrom(tab);
    },

    saveBtn(kind = 'system') {
        return `<div style="display:flex;justify-content:flex-end;margin-top:6px">
            <button class="btn btn-primary" data-act="save-settings">💾 保存设置</button>
        </div>`;
    },

    async saveSettingsFrom(tab) {
        // 收集全部 data-k 字段，按路径合并进原配置
        const cfg = JSON.parse(JSON.stringify(this.settingsCache || {}));
        document.querySelectorAll('.set-input').forEach(el => {
            const path = el.dataset.k;
            const val = el.type === 'checkbox' ? el.checked :
                        el.type === 'number' ? (parseInt(el.value) || 0) : el.value;
            const parts = path.split('.');
            let node = cfg;
            for (let i = 0; i < parts.length - 1; i++) {
                node[parts[i]] = node[parts[i]] || {};
                node = node[parts[i]];
            }
            node[parts[parts.length - 1]] = val;
        });

        if (cfg.task?.retryInterval && cfg.task.retryInterval < 60) {
            return UI.warn('任务重试间隔不能小于 60 秒');
        }

        // system 设置走 /api/settings（含调度重启），媒体类走 /api/settings/media
        const isMedia = ['media', 'ai'].includes(tab);
        const r = await (isMedia ? API.saveMediaSettings(cfg) : API.saveSettings(cfg)).catch(e => ({ success: false, error: e.message }));
        if (r.success) { UI.ok('设置已保存'); this.settingsCache = cfg; }
        else UI.err(r.error || '保存失败');
    },

    /* ==================== 实时日志页 ==================== */
    async page_logs(box) {
        box.innerHTML = `
            <div class="toolbar">
                <div class="sec-title" style="margin:0"><span class="ico">📜</span>系统实时日志</div>
                <div class="spacer"></div>
                <label class="check"><input type="checkbox" id="logAuto" checked> 自动滚动</label>
                <button class="btn btn-ghost btn-sm" onclick="App.go('logs')">🔄 重连</button>
                <button class="btn btn-ghost btn-sm" onclick="App.clearLogView()">🧹 清屏</button>
            </div>
            <div class="log-panel" id="logMain" style="height:calc(100vh - 220px)"></div>
        `;
        const panel = box.querySelector('#logMain');
        const auto = box.querySelector('#logAuto');
        let lines = [];
        window.__logLines = lines;
        const render = () => {
            panel.innerHTML = lines.map(l =>
                `<div class="log-line lv-${UI.logLevel(l)}"><span class="t">${esc(l.slice(0, 22))}</span> <span class="msg">${esc(l.slice(22))}</span></div>`
            ).join('');
            if (auto.checked) panel.scrollTop = panel.scrollHeight;
        };
        window.__logRender = render;
        new LogStream(
            msg => { lines.push(msg); if (lines.length > 500) lines.shift(); render(); },
            logs => { lines = logs; render(); }
        );
    },

    clearLogView() {
        const panel = document.querySelector('#logMain');
        if (panel) panel.innerHTML = '';
        UI.ok('已清屏（不影响日志文件）');
    },

    /* ==================== AI 助手 ==================== */
    aiChat() {
        const m = UI.modal({
            title: '🤖 AI 助手',
            body: `
                <div id="aiMsgs" style="height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin-bottom:12px"></div>
                <div style="display:flex;gap:8px">
                    <input class="input" id="aiInput" placeholder="输入问题，如：帮我整理一下最近的转存任务">
                    <button class="btn btn-primary" id="aiSend">发送</button>
                </div>`,
            size: 'modal-lg'
        });
        const msgs = m.body.querySelector('#aiMsgs');
        const input = m.body.querySelector('#aiInput');
        let lastAi = null;

        const addMsg = (text, user) => {
            const d = document.createElement('div');
            d.style.cssText = user
                ? 'align-self:flex-end;background:var(--c-primary);color:#fff;padding:8px 14px;border-radius:12px 12px 2px 12px;max-width:80%;font-size:13px'
                : 'align-self:flex-start;background:#141930;padding:8px 14px;border-radius:12px 12px 12px 2px;max-width:85%;font-size:13px;white-space:pre-wrap';
            d.textContent = text;
            msgs.appendChild(d);
            msgs.scrollTop = msgs.scrollHeight;
            return d;
        };

        m.body.querySelector('#aiSend').onclick = async () => {
            const text = input.value.trim();
            if (!text) return;
            input.value = '';
            addMsg(text, true);
            lastAi = addMsg('…', false);
            const r = await API.chat(text).catch(e => ({ success: false, error: e.message }));
            if (!r.success) lastAi.textContent = '发送失败: ' + (r.error || '');
        };
        input.onkeydown = e => { if (e.key === 'Enter') m.body.querySelector('#aiSend').click(); };

        // 监听 SSE AI 回复
        const es = new EventSource('/api/logs/events');
        es.onmessage = ev => {
            const data = JSON.parse(ev.data);
            if (data.type === 'aimessage' && lastAi) {
                lastAi.textContent += data.message;
                msgs.scrollTop = msgs.scrollHeight;
            }
        };
        const origClose = m.close;
        m.close = () => { es.close(); origClose(); };
        m.el.querySelector('.modal-x').addEventListener('click', () => es.close());
    },
};

/* 启动 */
document.addEventListener('DOMContentLoaded', () => App.boot());
