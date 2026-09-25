# 多阶段构建：支持CASCLOUD189全功能（Node.js + Go双引擎协同）
FROM node:18-alpine AS builder

WORKDIR /home

# 安装构建依赖
RUN apk add --no-cache python3 make g++ git

COPY package*.json yarn.lock tsconfig.json ./
COPY vender/ ./vender/

# SDK 已包含预编译的 dist/，仅安装运行时依赖
RUN if [ -d "vender/cloud189-sdk" ]; then \
        cd vender/cloud189-sdk && yarn install --production && cd ../.. ; \
    fi

# 安装项目依赖
RUN yarn install

COPY . .

RUN yarn build

# 生产运行镜像
FROM node:18-alpine AS production

WORKDIR /home

RUN apk update && \
    apk add --no-cache ca-certificates tzdata sqlite-libs curl bash libc6-compat

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -sf /usr/share/zoneinfo/$TZ /etc/localtime && \
    echo $TZ > /etc/timezone

COPY --from=builder /home/package*.json ./
COPY --from=builder /home/yarn.lock ./

RUN yarn install --production && yarn cache clean

# 复制构建好的后端代码与资源
COPY --from=builder /home/dist ./dist
COPY --from=builder /home/src/public ./dist/public
COPY --from=builder /home/vender/cloud189-sdk/dist ./vender/cloud189-sdk/dist

# 复制独立Go双引擎及编排脚本
COPY bin/proxy /home/proxy
COPY organizer/ /home/organizer/
COPY deploy/ /home/deploy/
RUN chmod +x /home/proxy /home/organizer/organizer /home/deploy/start.sh 2>/dev/null || true

# 创建必要目录
RUN mkdir -p /home/data /home/strm /home/data/cas

VOLUME ["/home/data", "/home/strm"]

# 暴露端口 (3000: Node Web & API, 8096: Go Emby Proxy)
EXPOSE 3000 8096

CMD ["/bin/sh", "-c", "node dist/index.js"]
