export function nowIso(): string {
    return new Date().toISOString();
}

export function buildPublicSystemInfo(params: { serverName: string; serverId: string; version: string; baseUrl?: string }): any {
    return {
        LocalAddress: params.baseUrl || '',
        ServerName: params.serverName,
        Version: params.version,
        ProductName: params.serverName,
        OperatingSystem: process.platform,
        Id: params.serverId,
        WanAddress: params.baseUrl || ''
    };
}

export function buildBrandingConfiguration(serverName: string): any {
    return {
        LoginDisclaimer: `Powered by ${serverName}`
    };
}

export function buildAuthenticationResult(params: { user: { id: string; username: string }; token: string; serverId: string }): any {
    return {
        AccessToken: params.token,
        ServerId: params.serverId,
        User: {
            Id: params.user.id,
            Name: params.user.username,
            ServerId: params.serverId
        },
        SessionInfo: {
            Id: params.token,
            UserId: params.user.id,
            UserName: params.user.username,
            ServerId: params.serverId
        }
    };
}

export function buildViewsResponse(items: any[]): any {
    return {
        Items: items,
        TotalRecordCount: items.length
    };
}

export function buildItemsResponse(items: any[], startIndex: number = 0, totalRecordCount: number | null = null, serverId: string | null = null): any {
    const res: any = {
        Items: items,
        TotalRecordCount: totalRecordCount !== null ? totalRecordCount : items.length,
        StartIndex: startIndex
    };
    if (serverId) {
        res.ServerId = serverId;
    }
    return res;
}
