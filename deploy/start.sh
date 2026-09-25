#!/bin/sh
set -e

# 脚本名称和版本
SCRIPT_NAME="天翼云盘转存服务Pro启动脚本"

# 日志文件
LOG_FILE="./app.log"

# 配置文件路径
CONFIG_YAML="/home/data/config.yaml"
CONFIG_JSON="/home/data/config.json"

# hosts文件路径和备份路径
HOSTS_FILE="/etc/hosts"
HOSTS_BACKUP="/etc/hosts.bak.$(date +%s)"

# 临时文件存储域名IP映射
DOMAIN_IPS_TMP="/tmp/domain_ips.$$"

# 创建域名IP映射临时文件
cat > "$DOMAIN_IPS_TMP" <<EOF
cloud.189.cn=14.18.110.142 14.116.220.47
open.e.189.cn=42.123.76.75 42.123.76.87
api.cloud.189.cn=14.116.220.228 14.116.220.84
EOF

# 日志函数
log() {
    local level="$1"
    local message="$2"
    local timestamp=$(date +"[%Y-%m-%d %H:%M:%S]")
    echo "$timestamp [$level] $message" >> "$LOG_FILE"
    [ "$level" = "ERROR" ] && echo "$timestamp [$level] $message" >&2 || echo "$timestamp [$level] $message"
}

# 检查命令是否存在
check_command() {
    command -v "$1" >/dev/null 2>&1 || { log "ERROR" "未找到命令: $1"; exit 1; }
}

# 检查是否有root权限
check_root() {
    if [ "$(id -u)" -ne 0 ]; then
        log "ERROR" "此脚本需要root权限运行。请使用sudo执行此脚本。"
        exit 1
    fi
}

# 备份hosts文件
backup_hosts() {
    cp "$HOSTS_FILE" "$HOSTS_BACKUP"
    log "INFO" "已备份hosts文件到: $HOSTS_BACKUP"
}

# 更新hosts文件
update_hosts() {
    log "INFO" "开始更新hosts文件..."
    
    # 添加脚本标记，用于识别和清理
    local script_marker="# Added by $SCRIPT_NAME"
    
    # 移除旧的脚本标记和相关条目
    if grep -q "$script_marker" "$HOSTS_FILE"; then
        log "INFO" "清理旧的hosts条目..."
        sed -i "/$script_marker/,/^# End $SCRIPT_NAME/d" "$HOSTS_FILE"
    fi
    
    # 添加新的条目
    echo "$script_marker" >> "$HOSTS_FILE"
    
    # 从临时文件读取域名IP映射并添加到hosts
    while IFS= read -r line; do
        domain=$(echo "$line" | cut -d'=' -f1)
        ips=$(echo "$line" | cut -d'=' -f2)
        
        for ip in $ips; do
            echo "$ip    $domain" >> "$HOSTS_FILE"
            log "INFO" "添加hosts条目: $ip $domain"
        done
    done < "$DOMAIN_IPS_TMP"
    
    echo "# End $SCRIPT_NAME" >> "$HOSTS_FILE"
    log "INFO" "hosts文件更新完成"
}

# 检查配置文件
check_config() {
    if [ ! -f "$CONFIG_YAML" ]; then
        log "INFO" "反代配置文件不存在，正在创建..."
        cp /home/config.yaml "$CONFIG_YAML"
        log "INFO" "反代配置文件已创建: $CONFIG_YAML"
    fi

    if [ ! -f "$CONFIG_JSON" ]; then
        log "INFO" "转存配置文件不存在，正在创建..."
        cp /home/config.json "$CONFIG_JSON"
        log "INFO" "转存配置文件已创建: $CONFIG_JSON"
    fi
}

# 清理日志
clean_logs() {
    log "INFO" "清理日志文件..."
    echo "" > "$LOG_FILE"
}

# 启动主服务
start_service() {
    log "INFO" "启动服务..."

    # 启动整理器（cd 到其目录以读取相对路径配置）
    (cd /home/organizer && ./organizer) >> "$LOG_FILE" 2>&1 &
    local organizer_pid=$!
    log "INFO" "整理器已启动"

    
    ./proxy >> "$LOG_FILE" 2>&1 &
    local proxy_pid=$!
    log "INFO" "服务已启动"
    
    # 注册退出信号处理
    trap 'log "INFO" "接收到停止信号，正在停止服务..."; kill -TERM $proxy_pid $organizer_pid 2>/dev/null; wait $proxy_pid $organizer_pid 2>/dev/null; exit 0' INT TERM
    
    # 显示日志
    log "INFO" "正在跟踪服务日志..."
    tail -f "$LOG_FILE"
}

# 主函数
main() {
    echo "========================================="
    echo "         $SCRIPT_NAME                    "
    echo "========================================="
    
    check_root
    check_command cp
    check_command sed
    check_command tail
    
    backup_hosts
    update_hosts
    check_config
    clean_logs
    start_service
}

# 执行主函数
main

# 删除临时文件
rm -f "$DOMAIN_IPS_TMP"