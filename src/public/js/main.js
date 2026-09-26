async function loadVersion() {
    try {
        const response = await fetch('/api/version');
        const data = await response.json();
        document.getElementById('version').innerText = `v${data.version}`;
    } catch (error) {
        console.error('Failed to load version:', error);
    }
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// 主入口文件
document.addEventListener('DOMContentLoaded', () => {
     // 初始化macos样式
    const appTitle = document.getElementById('appTitle');
    if (appTitle) {
        if(localStorage.getItem('_currentTheme') === 'macos') {
            // 插入新的css
            const newCss = document.createElement('link');
            newCss.rel = 'stylesheet';
            newCss.href = '/css/macos.css';
            document.head.appendChild(newCss);
        }
        appTitle.addEventListener('click', (e) => {
            e.preventDefault();
           const currentTheme = localStorage.getItem('_currentTheme')
           if(currentTheme === 'macos') {
            localStorage.setItem('_currentTheme', '')
            // 移除macos样式
            const macosCss = document.querySelector('link[href="/css/macos.css"]');
            if (macosCss) {
                document.head.removeChild(macosCss);
            }
           } else {
            localStorage.setItem('_currentTheme', 'macos')
            // 插入新的css
           const newCss = document.createElement('link');
           newCss.rel = 'stylesheet';
           newCss.href = '/css/macos.css';
           document.head.appendChild(newCss);
           }
        });
    }
    // 加载版本号
    loadVersion();
    // 初始化所有功能
    initTabs();
    initAccountForm();
    initTaskForm();
    initEditTaskForm();
    // 初始化主题
    initTheme();
    // 初始化日志
    initLogs()

    // 初始化目录选择器
    const folderSelector = new FolderSelector({
        enableFavorites: true,
        favoritesKey: 'createTaskFavorites',
        onSelect: ({ id, name, path }) => {
            document.getElementById('targetFolder').value = path;
            document.getElementById('targetFolderId').value = id;
        }
    });

    // 修改目录选择触发方式
    document.getElementById('targetFolder').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        folderSelector.show(accountId);
    });

    // 添加常用目录按钮点击事件
    document.getElementById('favoriteFolderBtn').addEventListener('click', (e) => {
        e.preventDefault();
        const accountId = document.getElementById('accountId').value;
        if (!accountId) {
            message.warning('请先选择账号');
            return;
        }
        folderSelector.showFavorites(accountId);
    });

    // 初始化数据
    fetchAccounts(true);
    fetchTasks();

    // 定时刷新数据
    // setInterval(() => {
    //     fetchTasks();
    // }, 30000);
});


// 从缓存获取数据
function getFromCache(key) {
    // 拼接用户 ID
    const userId = document.getElementById('accountId').value;
    return localStorage.getItem(key + '_' + userId);
}
// 保存数据到缓存
function saveToCache(key, value) {
    const userId = document.getElementById('accountId').value;
    localStorage.setItem(key + '_' + userId, value);
}

document.addEventListener('DOMContentLoaded', function() {
    const tooltip = document.getElementById('regexTooltip');

    // 使用事件委托，监听整个文档的点击事件
    document.addEventListener('click', function(e) {
        // 检查点击的是否是帮助图标
        if (e.target.classList.contains('help-icon')) {
            e.stopPropagation();
            const helpIcon = e.target;
            const rect = helpIcon.getBoundingClientRect();
            const isVisible = tooltip.style.display === 'block';
            
            // 关闭弹窗
            if (isVisible && tooltip._currentIcon === helpIcon) {
                tooltip.style.display = 'none';
                return;
            }

            // 显示弹窗
            tooltip.style.display = 'block';
            tooltip._currentIcon = helpIcon;
            tooltip.style.zIndex = 9999;
            
            // 计算位置
            const viewportWidth = window.innerWidth;
            const tooltipWidth = tooltip.offsetWidth;
            
            // 移动端适配
            if (viewportWidth <= 768) {
                tooltip.style.left = '50%';
                tooltip.style.top = '50%';
                tooltip.style.transform = 'translate(-50%, -50%)';
                tooltip.style.maxWidth = '90vw';
                tooltip.style.maxHeight = '80vh';
                tooltip.style.overflow = 'auto';
            } else {
                let left = rect.left;
                if (left + tooltipWidth > viewportWidth) {
                    left = viewportWidth - tooltipWidth - 10;
                }
                tooltip.style.top = `${rect.bottom + 5}px`;
                tooltip.style.left = `${left}px`;
                tooltip.style.transform = 'none';
            }
        } else if (!tooltip.contains(e.target)) {
            // 点击其他地方关闭弹窗
            tooltip.style.display = 'none';
        }
    });

    // 添加 ESC 键关闭
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            tooltip.style.display = 'none';
        }
    });
});

function toggleFloatingBtns() {
    const container = document.getElementById('floatingBtnsContainer');
    const icon = document.getElementById('toggleIcon');
    container.classList.toggle('collapsed');
    icon.classList.toggle('expanded');
}


function toggleHelpText(button) {
    const helpText = button.nextElementSibling;
    if (helpText.style.display === 'block') {
        helpText.style.display = 'none';
        button.textContent = '显示帮助';
    } else {
        helpText.style.display = 'block';
        button.textContent = '隐藏帮助';
    }
}

// ==================== 资源搜索 Tab 联动 (参考 MediaHelp) ====================
async function doTabResourceSearch() {
    const kw = document.getElementById('tabResourceInput').value.trim();
    if (!kw) return alert('请输入搜索关键词');

    const loading = document.getElementById('tabResourceLoading');
    const container = document.getElementById('tabResourceResults');
    const tbody = document.getElementById('tabResourceTbody');

    loading.style.display = 'block';
    container.style.display = 'none';

    try {
        const res = await fetch(`/api/resource/search?keyword=${encodeURIComponent(kw)}`);
        const json = await res.json();
        const list = json.data || [];

        tbody.innerHTML = '';
        if (list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#999;">未搜索到相关影视资源，请尝试缩短或更换关键字</td></tr>';
        } else {
            list.forEach(item => {
                const tr = document.createElement('tr');
                const driveBadge = `<span class="status-badge" style="background:#e8f4ff; color:#0969da; padding:2px 8px; border-radius:4px; font-size:12px;">${item.driveType || '通用'}</span>`;
                tr.innerHTML = `
                    <td><strong>${item.title || item.name || '未知标题'}</strong></td>
                    <td>${driveBadge}</td>
                    <td><a href="${item.shareUrl || item.url}" target="_blank" style="color:#0969da; word-break:break-all;">${item.shareUrl || item.url}</a></td>
                    <td style="text-align:center;">
                        <button type="button" class="btn-primary" style="padding:4px 10px; font-size:12px;" onclick="openCreateTaskWithShare('${item.shareUrl || item.url}', '${item.driveType || 'cloud189'}')">转存入库</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
        container.style.display = 'block';
    } catch (err) {
        alert('搜索失败: ' + err.message);
    } finally {
        loading.style.display = 'none';
    }
}

function openCreateTaskWithShare(shareUrl, driveType) {
    // 切换到任务 Tab 并预填分享链接
    document.querySelector('.tab[data-tab="task"]').click();
    openAddTaskModal();
    const shareInput = document.getElementById('shareUrl');
    if (shareInput) {
        shareInput.value = shareUrl;
        shareInput.dispatchEvent(new Event('input'));
    }
}

// ==================== CAS 实验室 Tab 联动 ====================
async function loadTabCasAccounts() {
    try {
        const res = await fetch('/api/accounts');
        const json = await res.json();
        const accs = json.data || [];
        const select = document.getElementById('tabCasAccountSelect');
        if (select) {
            select.innerHTML = accs.map(a => `<option value="${a.id}">#${a.id} ${a.alias || a.username} (${a.driveType || 'cloud189'})</option>`).join('');
        }
    } catch {}
}

async function doTabCasRapidUpload() {
    const accountId = document.getElementById('tabCasAccountSelect').value;
    const targetFolderId = document.getElementById('tabCasFolderInput').value.trim() || 'root';
    const casContent = document.getElementById('tabCasContentInput').value.trim();
    if (!casContent) return alert('请粘贴 CAS 清单或管道符');

    const resBox = document.getElementById('tabCasResultBox');
    resBox.style.display = 'block';
    resBox.textContent = '正在通过多网盘秒传协议校验指纹并还原入库...';

    try {
        const res = await fetch(`/api/drives/account/${accountId}/rapid`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetFolderId, casContent })
        });
        const data = await res.json();
        resBox.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
        resBox.textContent = '秒传失败: ' + e.message;
    }
}

async function doTabCasPlayResolve() {
    const accountId = document.getElementById('tabCasAccountSelect').value;
    const casContent = document.getElementById('tabCasContentInput').value.trim();
    if (!casContent) return alert('请粘贴 CAS 清单或管道符');

    const resBox = document.getElementById('tabCasResultBox');
    resBox.style.display = 'block';
    resBox.textContent = '正在通过虚拟 CAS 播放预热解析直链...';

    try {
        const res = await fetch(`/api/play/${accountId}/info?casContent=${encodeURIComponent(casContent)}`);
        const data = await res.json();
        resBox.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
        resBox.textContent = '直链解析失败: ' + e.message;
    }
}

function toggleAccountDriveFields() {
    const dt = document.getElementById('driveType').value;
    const pwdGroup = document.getElementById('accountPasswordGroup');
    const cookieGroup = document.getElementById('accountCookieGroup');
    if (dt === 'cloud139') {
        cookieGroup.querySelector('label').textContent = 'Authorization (移动云盘Basic凭据 或 Token)';
    } else if (dt === 'quark' || dt === 'uc') {
        cookieGroup.querySelector('label').textContent = 'Cookie (__pus / __puus)';
    } else if (dt === 'aliyun') {
        cookieGroup.querySelector('label').textContent = 'Access Token';
    } else {
        cookieGroup.querySelector('label').textContent = 'Cookie / 凭据串';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadTabCasAccounts();
});