# CASCLOUD189 — 全功能天翼云盘自动转存与流媒体系统

本项目是基于开源核心扩展并深度适配 Pro 版全部核心特性的全功能自由版本。**100% 开源 TypeScript，可直接构建编译，彻底摆脱闭源 V8 字节码与商业授权限制。**

---

## 🌟 核心功能特性

### 1. ⚡ CAS 秒传与极速入库体系
* **三步秒传入库 (`Cloud189RapidUploadService`)**：
  * 对接天翼云底层 `initMultiUpload`、`checkTransSecond` 与 `commitMultiUploadFile` 接口。
  * 支持个人网盘与家庭云秒传，跨账号免下载秒级入库。
* **`.cas` 文件标准化 (`CasFileService`)**：
  * 支持生成、解析、导出包含 `fileMd5`、`sliceMd5`、`fileSize` 的 CAS 元数据清单。
* **一键秒传恢复 (`/api/cas-restore/restore`)**：
  * 支持粘贴 CAS 文本或上传 `.cas` 文件一键恢复到目标网盘目录。
* **临时文件自动回收 (`CasTempFileDeleteQueueService`)**：
  * 播放流式缓存后自动加入延时清理队列，释放网盘与本地存储空间。

### 2. 🎬 Casby 虚拟 Emby 流媒体服务 (`/emby`)
* **兼容 Emby/Jellyfin 协议**：
  * 实现 `/System/Info/Public`、`/Users/AuthenticateByName`、`/Users/:userId/Views`、`/Items` 等 API。
  * 用户可以直接使用标准的 Emby 客户端连接本系统。
* **零磁盘占用播放**：
  * 媒体资源以虚拟 Catalog 形式展现，仅在实际请求播放时由代理层动态解析直链或调度秒传入库，无需占用本地昂贵的硬盘空间。

### 3. 🚀 Go 双引擎协同架构 (`bin/proxy` & `organizer/organizer`)
* **高性能流媒体代理 (`proxy`)**：
  * 专为 Emby/Jellyfin 直链播放打造，支持 302 重定向缓存、HTTP Range 范围分片与播放加速。
* **智能媒体整理器 (`organizer`)**：
  * 自动基于 TMDB 进行影视剧分类、智能刮削、硬链接/软链接整理。

### 4. 🔍 增强搜索与多账号运维
* **全网云盘搜索 (`pansouService` / `resourceSearchService`)**：
  * 聚合本地已有任务与天翼盘搜引擎，一键检索影视资源。
* **多账号健康巡检 (`AccountHealthCheckService`)**：
  * 定期巡检天翼云盘 Token 与 Cookie 状态，发现失效即时告警。
* **任务分组管理 (`TaskGroupService`)**：
  * 支持海量转存任务分组、批量管理与灵活调度。

### 5. 💻 现代双前端架构
* **经典 UI**：访问根路径 `/` 即可使用轻量原版界面。
* **Vue 3 + Naive UI 单页应用**：访问 `/new/` 即可体验包含海报墙、订阅管理、秒传导入等功能的现代前端。

---

## 🛠️ 本地编译与构建

### 1. 环境准备
* Node.js >= 18
* Yarn 或 npm

### 2. 安装依赖并编译 TypeScript
```bash
yarn install
yarn build
```

### 3. 启动服务
```bash
yarn start
```
默认服务端口：`http://localhost:3000`

---

## 🐳 Docker 部署说明

```bash
docker build -t cascloud189:latest .

docker run -d \
  --name cascloud189 \
  -p 3000:3000 \
  -p 8096:8096 \
  -v /opt/cascloud189/data:/home/data \
  -v /opt/cascloud189/strm:/home/strm \
  --restart unless-stopped \
  cascloud189:latest
```
