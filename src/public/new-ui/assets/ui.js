/* ============================================================
   UI 基础组件：toast / modal / 目录树选择器 / 工具
   ============================================================ */

const UI = {
    /* ---------- Toast ---------- */
    toast(msg, type = 'info', ms = 2600) {
        let box = document.querySelector('.toast-box');
        if (!box) { box = document.createElement('div'); box.className = 'toast-box'; document.body.appendChild(box); }
        const t = document.createElement('div');
        t.className = `toast ${type === 'success' ? 'ok' : type === 'error' ? 'err' : type === 'warning' ? 'warn' : ''}`;
        t.textContent = msg;
        box.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms);
    },
    ok(m) { this.toast(m, 'success'); },
    err(m) { this.toast(m, 'error'); },
    warn(m) { this.toast(m, 'warning'); },

    /* ---------- Modal ---------- */
    modal({ title, body, footer, size = '' }) {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        mask.innerHTML = `
            <div class="modal ${size}">
                <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-x">×</button></div>
                <div class="modal-body"></div>
                ${footer ? '<div class="modal-foot"></div>' : ''}
            </div>`;
        mask.querySelector('.modal-body').innerHTML = body || '';
        if (footer) mask.querySelector('.modal-foot').innerHTML = footer;
        const close = () => mask.remove();
        mask.querySelector('.modal-x').onclick = close;
        mask.addEventListener('mousedown', e => { if (e.target === mask) close(); });
        document.body.appendChild(mask);
        return { el: mask, close, body: mask.querySelector('.modal-body'), foot: mask.querySelector('.modal-foot') };
    },

    confirm(title, text) {
        return new Promise(resolve => {
            const m = this.modal({
                title,
                body: `<p style="font-size:13.5px;line-height:1.7">${esc(text)}</p>`,
                footer: `<button class="btn btn-danger" data-act="yes">确定</button><button class="btn btn-ghost" data-act="no">取消</button>`
            });
            m.foot.querySelector('[data-act=yes]').onclick = () => { m.close(); resolve(true); };
            m.foot.querySelector('[data-act=no]').onclick = () => { m.close(); resolve(false); };
        });
    },

    prompt(title, label, value = '') {
        return new Promise(resolve => {
            const m = this.modal({
                title,
                body: `<div class="field"><label>${esc(label)}</label><input class="input" id="__prompt_val" value="${esc(value)}"></div>`,
                footer: `<button class="btn btn-primary" data-act="ok">确定</button><button class="btn btn-ghost" data-act="no">取消</button>`
            });
            const inp = m.body.querySelector('#__prompt_val');
            inp.focus(); inp.select();
            const done = v => { m.close(); resolve(v); };
            m.foot.querySelector('[data-act=ok]').onclick = () => done(inp.value.trim());
            m.foot.querySelector('[data-act=no]').onclick = () => done(null);
            inp.onkeydown = e => { if (e.key === 'Enter') done(inp.value.trim()); };
        });
    },

    /* ---------- 目录树选择器 ---------- */
    folderTree({ title = '选择目录', accountId, folderId = '-11', onSelect }) {
        const m = this.modal({
            title,
            body: `<div class="tree" id="__tree_box"><div class="loading-center"><span class="spin"></span></div></div>`,
            size: 'modal-lg'
        });
        const box = m.body.querySelector('#__tree_box');
        const cache = new Map();

        async function loadNode(container, fid) {
            container.innerHTML = '<div class="loading-center" style="padding:14px"><span class="spin"></span></div>';
            try {
                const data = await API.folders(accountId, fid);
                container.innerHTML = '';
                (data.data || []).forEach(node => {
                    const row = document.createElement('div');
                    row.className = 'tree-node';
                    row.innerHTML = `<span class="arrow">▶</span><span>📁</span><span class="nm">${esc(node.name)}</span>`;
                    row.onclick = (e) => {
                        e.stopPropagation();
                        box.querySelectorAll('.tree-node.selected').forEach(x => x.classList.remove('selected'));
                        row.classList.add('selected');
                        const kids = row.nextElementSibling;
                        if (kids && kids.style.display === 'none') { kids.style.display = ''; row.querySelector('.arrow').classList.add('open'); }
                        else if (kids) { kids.style.display = 'none'; row.querySelector('.arrow').classList.remove('open'); return; }
                        else {
                            const k = document.createElement('div');
                            k.className = 'tree-kids'; k.style.display = '';
                            row.after(k);
                            row.querySelector('.arrow').classList.add('open');
                            loadNode(k, node.id);
                        }
                    };
                    row.ondblclick = () => {
                        onSelect && onSelect({ id: node.id, name: node.name });
                        m.close();
                    };
                    container.appendChild(row);
                    const kids = document.createElement('div');
                    kids.className = 'tree-kids'; kids.style.display = 'none';
                    container.appendChild(kids);
                });
                if (!container.children.length) {
                    container.innerHTML = '<div style="padding:12px;color:var(--t-dim);font-size:12px">无子目录</div>';
                }
            } catch (e) {
                container.innerHTML = `<div style="padding:12px;color:var(--c-red);font-size:12px">加载失败: ${esc(e.message)}</div>`;
            }
        }
        loadNode(box, folderId);

        // 双击提示 + 底部确认按钮
        const hint = document.createElement('div');
        hint.className = 'hint';
        hint.textContent = '单击展开目录，双击选中目录';
        m.body.appendChild(hint);
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:10px;margin-top:12px;justify-content:flex-end';
        bar.innerHTML = `<button class="btn btn-ghost" data-act="cancel">取消</button>`;
        bar.querySelector('[data-act=cancel]').onclick = () => m.close();
        m.body.appendChild(bar);

        // 选中确认
        box.addEventListener('click', () => {
            const sel = box.querySelector('.tree-node.selected');
            if (sel) {
                const nm = sel.querySelector('.nm').textContent;
                // 查找 id：通过重新加载时缓存
                const cached = box.__lastNodes?.find(n => n.name === nm);
            }
        });
        return m;
    },

    /* ---------- 状态徽章 ---------- */
    taskStatusTag(status) {
        const map = {
            pending: ['等待中', 'tag-yellow'],
            processing: ['转存中', 'tag-blue'],
            completed: ['已完结', 'tag-green'],
            error: ['失败', 'tag-red'],
            max_retries: ['重试上限', 'tag-red'],
            disabled: ['已停用', 'tag-gray'],
        };
        const [txt, cls] = map[status] || [status || '未知', 'tag-gray'];
        return `<span class="tag ${cls}">${esc(txt)}</span>`;
    },

    healthTag(runtimeStatus) {
        if (runtimeStatus === 'ok') return '<span class="tag tag-green">✓ 正常</span>';
        if (runtimeStatus === 'invalid') return '<span class="tag tag-red">✗ 异常</span>';
        return '<span class="tag tag-gray">未巡检</span>';
    },

    logLevel(line) {
        const l = (line || '').toUpperCase();
        if (l.includes('ERROR') || l.includes('失败') || l.includes('异常')) return 'ERROR';
        if (l.includes('WARN') || l.includes('警告')) return 'WARNING';
        if (l.includes('DEBUG')) return 'DEBUG';
        return 'INFO';
    }
};

/* SSE 日志流管理 */
class LogStream {
    constructor(onLog, onHistory) {
        this.onLog = onLog; this.onHistory = onHistory;
        this.es = null; this.closed = false;
        this.connect();
    }
    connect() {
        if (this.closed) return;
        this.es = new EventSource('/api/logs/events');
        this.es.onmessage = (ev) => {
            const data = JSON.parse(ev.data);
            if (data.type === 'history') this.onHistory?.(data.logs || []);
            else if (data.type === 'log') this.onLog?.(data.message);
            else if (data.type === 'aimessage') this.onLog?.(data.message);
        };
        this.es.onerror = () => { this.es.close(); if (!this.closed) setTimeout(() => this.connect(), 2000); };
    }
    close() { this.closed = true; this.es?.close(); }
}
