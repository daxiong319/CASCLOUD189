# CASCLOUD189 前端功能项清单（按后端代码审查结果）

> 基于对 `src/index.js`、`src/proExtensions.js`、`src/routes/*`、`src/casby/*`、`src/sdk/cloudSaver`、`src/utils/logUtils.js` 的完整审查。
> 新前端必须 100% 覆盖以下功能项，页面结构参照 Symedia（深色侧栏 + 顶栏页签 + 卡片化布局）。

---

## 一、认证与会话
| 功能 | API | 说明 |
|---|---|---|
| 登录 | `POST /api/auth/login` | body: `{username, password}` |
| 登出 | 会话销毁 | 前端清理本地状态并跳转 /login |
| 版本号 | `GET /api/version` | 顶栏展示 |
| X-API-Key | Header `x-api-key` | API 直连备用认证 |

## 二、账号管理（网盘账号矩阵）
| 功能 | API |
|---|---|
| 账号列表（含容量/健康状态/网盘类型） | `GET /api/accounts` |
| 添加账号（天翼/移动139/夸克/UC/阿里，含验证码流程 NEED_CAPTCHA） | `POST /api/accounts` |
| 删除账号 | `DELETE /api/accounts/:id` |
| 清空回收站 | `DELETE /api/accounts/recycle` |
| 修改别名 | `PUT /api/accounts/:id/alias` |
| 设为默认账号 | `PUT /api/accounts/:id/default` |
| STRM 前缀配置（local/cloud/emby 三种） | `PUT /api/accounts/:id/strm-prefix` |
| 常用目录收藏 | `GET/POST /api/favorites/:accountId`、`POST /api/saveFavorites` |
| 账号目录树（选择器） | `GET /api/folders/:accountId?folderId=&refresh=` |
| 全账号健康巡检（多网盘统一） | `GET /api/accounts/health` |

## 三、转存任务
| 功能 | API |
|---|---|
| 任务列表（状态筛选/搜索/账号关联） | `GET /api/tasks?status=&search=` |
| 创建任务（分享链接解析→选目录→选集数） | `POST /api/tasks` |
| 解析分享链接（返回分享目录树） | `POST /api/share/parse` |
| 分享目录浏览 | `GET /api/share/folders/:accountId?taskId=&folderId=` |
| 任务目录文件列表 | `GET /api/folder/files?accountId=&taskId=` |
| 执行任务（立即转存） | `POST /api/tasks/:id/execute` |
| 执行全部任务 | `POST /api/tasks/executeAll` |
| 编辑任务 | `PUT /api/tasks/:id` |
| 删除任务（可选同时删云端文件） | `DELETE /api/tasks/:id` |
| 批量删除任务 | `DELETE /api/tasks/batch` |
| 删除任务文件 | `DELETE /api/tasks/files` |
| 生成 STRM（按任务） | `POST /api/tasks/strm` |
| 文件重命名（批量正则） | `POST /api/files/rename` |
| AI 智能重命名 | `POST /api/files/ai-rename` |
| 任务分组列表/创建/删除 | `GET/POST /api/task-groups`、`DELETE /api/task-groups/:id` |

## 四、媒体与刮削
| 功能 | API |
|---|---|
| STRM 全量生成（按账号） | `POST /api/strm/generate-all` |
| STRM 文件浏览 | `GET /api/strm/list?path=` |
| Emby Webhook 通知回调 | `POST /emby/notify` |
| 媒体刮削设置（TMDB） | `POST /api/settings/media` |

## 五、资源搜索（聚合搜索）
| 功能 | API |
|---|---|
| 聚合资源搜索（本地任务 + 盘搜） | `GET /api/resource/search?kw=` |
| CloudSaver 搜索 | `GET /api/cloudsaver/search?keyword=` |
| 搜索结果一键创建任务 | 联动 `POST /api/tasks` |

## 六、CAS 体系（Pro 扩展）
| 功能 | API |
|---|---|
| 驱动列表与能力（含配置表单字段） | `GET /api/drives` |
| 任意网盘 CAS 秒传入库（V2 清单/管道符/Base64） | `POST /api/drives/account/:id/rapid` |
| 天翼 CAS 秒传恢复（V1） | `POST /api/cas-restore/restore` |
| 虚拟 CAS 播放直链（302） | `GET /api/play/:id/redirect?fileId=&casContent=` |
| 虚拟 CAS 流式代理（Range） | `GET /api/play/:id/stream` |
| 播放信息（直链+过期时间） | `GET /api/play/:id/info` |
| 网盘文件浏览（多网盘） | `GET /api/drives/account/:id/files?folderId=` |
| 创建目录（多网盘） | `POST /api/drives/account/:id/folder` |
| 获取直链（多网盘） | `GET /api/drives/account/:id/download?fileId=` |
| 分享转存（多网盘） | `POST /api/drives/account/:id/save-share` |
| CAS 镜像任务启动 | `POST /api/drives/account/:id/cas-mirror` |
| CAS 镜像任务列表 | `GET /api/drives/cas-mirror/tasks` |
| 单账号健康检查 | `GET /api/drives/:driveType/health?accountId=` |

## 七、Casby 虚拟 Emby
| 功能 | API |
|---|---|
| 媒体库列表 | `GET /api/emby/libraries` |
| 创建媒体库 | `POST /api/emby/libraries` |
| 更新媒体库 | `PUT /api/emby/libraries/:id` |
| 用户列表 | `GET /api/emby/users` |
| 创建用户 | `POST /api/emby/users` |
| 初始化引导（默认库+用户） | `POST /api/emby/bootstrap` |

## 八、系统设置
| 功能 | API |
|---|---|
| 读取全部配置 | `GET /api/settings` |
| 保存系统配置（调度/推送/TG Bot/代理） | `POST /api/settings` |
| 配置项：任务过期/检查Cron/媒体后缀/只存媒体/自动建目录 | settings.task |
| 推送渠道：企业微信/TG/WxPusher/Bark/PushPlus/自定义推送 | settings.wecom/telegram/wxpusher/bark/pushplus/customPush |
| 代理设置 | settings.proxy |
| 系统账号密码/baseUrl/apiKey | settings.system |
| STRM 开关 | settings.strm |
| Emby 联动 | settings.emby |
| CloudSaver | settings.cloudSaver |
| TMDB 刮削 | settings.tmdb |
| OpenAI (AI 识别/重命名) | settings.openai |
| Alist | settings.alist |
| 自定义推送测试 | `POST /api/custom-push/test` |
| AI 对话助手 | `POST /api/chat` + SSE `aimessage` |

## 九、日志与监控
| 功能 | API |
|---|---|
| 实时日志 SSE 流 | `GET /api/logs/events` |
| 日志历史（100KB 回放） | 同上（type: history） |

---

# 新前端页面结构设计（Symedia 风格）

```
/login        登录页（深色渐变 + 居中卡片）
/             主应用（左侧栏 + 顶栏 + 内容区）
  ├─ 仪表盘     统计卡片 + 实时日志 + 快捷操作
  ├─ 转存任务   任务表格/搜索/筛选/新建任务向导(分享链接→目录→执行)
  ├─ 资源搜索   聚合搜索 + CloudSaver + 一键转存
  ├─ 账号管理   网盘账号卡片矩阵 + 健康巡检 + STRM 前缀配置
  ├─ 媒体库     STRM 管理 + Emby(Casby) 媒体库/用户 + TMDB 刮削配置
  ├─ CAS 实验室  秒传入库 + 虚拟播放直链 + 镜像任务 + 驱动工作台
  └─ 系统设置   任务调度/推送通知/代理/AI/OpenAI/TG Bot 全配置
```

## 设计 Token（Symedia 深色主题）
- 侧栏: `#08021e`，主区: `#0b1427`，卡片: `#191c34`，边框: `#2f3448`
- 主色: `#206bf9`，浅蓝: `#30acff`，成功: `#54ce00`，危险: `#ff5c53`
- 文字: `#ffffff` / 次要 `#8183a9`
- 日志标签: INFO 蓝 / DEBUG 灰 / WARNING 黄 / ERROR 红
