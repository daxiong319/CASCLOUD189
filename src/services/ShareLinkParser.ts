/**
 * 多网盘分享链接识别器：
 *  - 识别天翼/夸克/UC/阿里分享链接（URL + 提取码文本组合均支持）
 *  - 供 Telegram Bot 与 REST API 统一调用，按网盘类型分派驱动
 */

export type ShareDriveType = 'cloud189' | 'quark' | 'uc' | 'aliyun' | 'unknown';

export interface ParsedShareLink {
    driveType: ShareDriveType;
    /** 规范化后的分享 URL */
    shareUrl: string;
    /** 提取码（如有） */
    accessCode?: string;
}

const PATTERNS: { driveType: ShareDriveType; regex: RegExp }[] = [
    // 天翼云盘: https://cloud.189.cn/web/share?code=XXXX 或 /t/XXXX
    { driveType: 'cloud189', regex: /https?:\/\/cloud\.189\.cn\/(?:web\/share\?code=|t\/)([A-Za-z0-9]+)/i },
    // 夸克: https://pan.quark.cn/s/XXXX
    { driveType: 'quark', regex: /https?:\/\/pan\.quark\.cn\/s\/([A-Za-z0-9_-]+)/i },
    // UC: https://drive.uc.cn/s/XXXX
    { driveType: 'uc', regex: /https?:\/\/drive\.uc\.cn\/s\/([A-Za-z0-9_-]+)/i },
    // 阿里: https://www.alipan.com/s/XXXX 或旧版 aliyundrive.com
    { driveType: 'aliyun', regex: /https?:\/\/(?:www\.)?(?:alipan\.com|aliyundrive\.com)\/s\/([A-Za-z0-9_-]+)/i }
];

export class ShareLinkParser {
    /** 识别分享链接的网盘类型并规范化 */
    public static parse(text: string): ParsedShareLink | null {
        if (!text) return null;
        const trimmed = String(text).trim();

        for (const { driveType, regex } of PATTERNS) {
            const m = trimmed.match(regex);
            if (m) {
                // 提取码: "提取码: xxxx" / "访问码: xxxx" / "pwd=xxxx" / "passcode=xxxx"
                const codeMatch = trimmed.match(/(?:提取码|访问码|密码)[::]\s*([A-Za-z0-9]{4,8})/)
                    || trimmed.match(/[?&](?:pwd|passcode|code)=([A-Za-z0-9]{4,8})/);
                return {
                    driveType,
                    shareUrl: m[0],
                    accessCode: codeMatch?.[1]
                };
            }
        }
        return null;
    }

    /** 是否为受支持的分享链接 */
    public static isSupportedShare(text: string): boolean {
        return this.parse(text) !== null;
    }

    /** 各网盘显示名 */
    public static displayName(driveType: ShareDriveType): string {
        return {
            cloud189: '天翼云盘',
            quark: '夸克网盘',
            uc: 'UC 网盘',
            aliyun: '阿里云盘',
            unknown: '未知网盘'
        }[driveType];
    }
}
