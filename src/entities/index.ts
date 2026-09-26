import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, PrimaryColumn, Index } from 'typeorm';

const beijingDatetimeTransformer = {
    from: (date: Date) => date && new Date(date.getTime() + (8 * 60 * 60 * 1000)),
    to: (date: Date) => date
};

@Entity()
export class Account {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    username!: string;

    @Column('text', { nullable: true })
    password!: string;

    @Column('text', { nullable: true })
    cookies!: string;

    @Column('boolean', { default: true })
    isActive!: boolean;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;

    @Column('boolean', { nullable: true, default: false })
    clearRecycle!: boolean;

    @Column('text', { nullable: true, default: '' })
    localStrmPrefix!: string;

    @Column('text', { nullable: true, default: '' })
    cloudStrmPrefix!: string;

    @Column('text', { nullable: true, default: '' })
    embyPathReplace!: string;

    @Column('boolean', { nullable: true, default: false })
    tgBotActive!: boolean;

    @Column('text', { nullable: true, default: '' })
    alias!: string;

    @Column('boolean', { nullable: true, default: false })
    isDefault!: boolean;

    @Column('boolean', { nullable: true, default: false })
    enableSystemProxy!: boolean;

    @Column('text', { nullable: true, default: '' })
    familyId!: string;

    @Column('text', { nullable: true, default: '' })
    casFamilyId!: string;

    @Column('text', { nullable: true, default: '' })
    familyRootFolderId!: string;

    /** 多网盘支持：账号所属网盘驱动类型（默认 cloud189 保持向后兼容） */
    @Column('text', { nullable: true, default: 'cloud189' })
    driveType!: string;

    /** 阿里云盘等使用 Token 认证的网盘：Access Token */
    @Column('text', { nullable: true, default: '' })
    accessToken!: string;

    /** 阿里云盘 drive_id */
    @Column('text', { nullable: true, default: '' })
    driveId!: string;

    /** 健康巡检状态：ok / invalid / unknown */
    @Column('text', { nullable: true, default: 'unknown' })
    runtimeStatus!: string;

    /** 最后一次巡检时间 */
    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastCheckedAt!: Date;

    /** 最后一次巡检错误信息 */
    @Column('text', { nullable: true })
    lastCheckError!: string;
}

@Entity()
export class Task {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    accountId!: number;

    @ManyToOne(() => Account)
    @JoinColumn({ name: 'accountId' })
    account!: Account;

    @Column('text')
    shareLink!: string;

    @Column('text', { nullable: true })
    targetFolderId!: string;

    @Column('text', { nullable: true })
    videoType!: string;

    @Column('text', { nullable: true })
    lastError!: string;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastCheckTime!: Date;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastFileUpdateTime!: Date;

    @Column('text', { nullable: true })
    resourceName!: string;

    @Column('integer', { default: 0 })
    totalEpisodes!: number;

    @Column('integer', { default: 0 })
    currentEpisodes!: number;

    @Column('text', { nullable: true })
    realFolderId!: string;

    @Column('text', { nullable: true })
    realFolderName!: string;

    @Column('text', { nullable: true })
    shareFileId!: string;

    @Column('text', { nullable: true })
    shareFolderId!: string;

    @Column('text', { nullable: true })
    shareFolderName!: string;

    @Column('text', { nullable: true })
    shareId!: string;

    @Column('text', { nullable: true, default: 'auto' })
    shareMode!: string;

    /** 任务状态: pending/processing/completed/error/disabled */
    @Column('text', { nullable: true, default: 'pending' })
    status!: string;

    @Column('text', { nullable: true, default: 'personal' })
    pathType!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;

    @Column('text', { nullable: true })
    accessCode!: string;

    @Column('text', { nullable: true })
    sourceRegex!: string;

    @Column('text', { nullable: true })
    targetRegex!: string;

    @Column('text', { nullable: true })
    matchPattern!: string;

    @Column('text', { nullable: true })
    matchOperator!: string;

    @Column('text', { nullable: true })
    matchValue!: string;

    @Column('integer', { default: 0 })
    retryCount!: number;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    nextRetryTime!: Date;

    @Column('text', { nullable: true })
    remark!: string;

    @Column('text', { nullable: true })
    cronExpression!: string;

    @Column('boolean', { default: false })
    enableCron!: boolean;

    @Column('text', { nullable: true })
    realRootFolderId!: string;

    @Column('text', { nullable: true })
    embyId!: string;

    @Column('text', { nullable: true })
    tmdbId!: string;

    @Column('boolean', { default: false })
    enableTaskScraper!: boolean;

    @Column('boolean', { default: false })
    enableSystemProxy!: boolean;

    @Column('text', { nullable: true })
    tmdbContent!: string;

    @Column('boolean', { default: true })
    isFolder!: boolean;

    @Column('text', { nullable: true })
    batchId!: string;

    @Column('integer', { nullable: true })
    groupId!: number;

    @Column('integer', { nullable: true })
    embyLibraryId!: number;

    @Column('integer', { nullable: true })
    seasonNumber!: number;

    @Column('text', { nullable: true })
    year!: string;

    @Column('boolean', { default: false })
    enableAI!: boolean;

    @Column('boolean', { default: false })
    intelligent!: boolean;

    @Column('boolean', { default: false })
    subscribe!: boolean;
}

@Entity()
export class CommonFolder {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    accountId!: number;

    @Column('text')
    path!: string;

    @Column('text')
    name!: string;
}

@Entity()
@Index('idx_proxyfile_task_md5', ['taskId', 'md5'])
export class ProxyFile {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    taskId!: number;

    @ManyToOne(() => Task)
    @JoinColumn({ name: 'taskId' })
    task!: Task;

    @Column('text')
    name!: string;

    @Column('text', { nullable: true })
    md5!: string;

    @Column('boolean', { default: false })
    isCas!: boolean;

    @Column('text', { nullable: true })
    casContent!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @Column('text', { nullable: true })
    lastOpTime!: string;
}

@Entity()
export class TaskGroup {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    name!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;
}

@Entity()
export class ShareLinkQueue {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    shareLink!: string;

    @Column('text', { nullable: true })
    taskParams!: string;

    @Column('integer', { default: 0 })
    retryCount!: number;
}

@Entity()
export class UserSubscribe {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    uuid!: string;

    @Column('text')
    username!: string;

    @Column('text', { nullable: true })
    avatar!: string;

    @Column('boolean', { default: true })
    isActive!: boolean;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastRecordTime!: Date;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createTime!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updateTime!: Date;
}

@Entity()
export class StrmConfiguration {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text', { nullable: true })
    type!: string;

    @Column('text')
    name!: string;

    @Column('text', { nullable: true })
    paths!: string;

    @Column('text', { nullable: true })
    localPath!: string;

    @Column('text', { nullable: true })
    excludePattern!: string;

    @Column('boolean', { default: true })
    isActive!: boolean;

    @Column('boolean', { default: false })
    enableCron!: boolean;

    @Column('text', { nullable: true })
    cronExpression!: string;

    @Column('boolean', { default: false })
    overwriteExisting!: boolean;

    @Column('integer', { nullable: true })
    subscriptionId!: number;

    @Column('text', { nullable: true })
    subscriptionUuid!: string;

    @Column('text', { nullable: true })
    subscriptionUsername!: string;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastCheckTime!: Date;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class EmbyUser {
    @PrimaryGeneratedColumn('uuid')
    id!: string;

    @Column('text')
    username!: string;

    @Column('text', { nullable: true })
    passwordHash!: string;

    @Column('boolean', { default: false })
    isDisabled!: boolean;

    @Column('text', { nullable: true })
    configJson!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;
}

@Entity()
export class EmbyToken {
    @PrimaryColumn('text')
    token!: string;

    @Column('text')
    userId!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastUsedAt!: Date;
}

@Entity()
export class EmbyLibrary {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    name!: string;

    @Column('text', { default: 'movies' })
    collectionType!: string;

    @Column('text', { default: 'custom' })
    sourceType!: string;

    @Column('text', { nullable: true })
    primaryImage!: string;

    @Column('text', { nullable: true })
    backdropImage!: string;

    @Column('text', { nullable: true })
    matchKey!: string;

    @Column('boolean', { default: true })
    isActive!: boolean;

    @Column('integer', { default: 0 })
    sort!: number;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
@Index('idx_embyplayback_user_item', ['userId', 'itemId'])
export class EmbyPlaybackState {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    userId!: string;

    @Column('text')
    itemId!: string;

    @Column('bigint', { default: 0 })
    positionTicks!: number;

    @Column('integer', { default: 0 })
    playCount!: number;

    @Column('boolean', { default: false })
    isPlayed!: boolean;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastPlayedAt!: Date;
}

@Entity()
export class CasbyTmdbTitle {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer', { nullable: true })
    embyLibraryId!: number;

    @Column('boolean', { default: false })
    isLibraryManual!: boolean;

    @Column('text')
    tmdbType!: string; // 'movie' | 'tv'

    @Column('text')
    tmdbId!: string;

    @Column('text')
    name!: string;

    @Column('text', { nullable: true })
    originalName!: string;

    @Column('text', { nullable: true })
    overview!: string;

    @Column('text', { nullable: true })
    year!: string;

    @Column('text', { nullable: true })
    releaseDate!: string;

    @Column('text', { nullable: true })
    posterPath!: string;

    @Column('text', { nullable: true })
    backdropPath!: string;

    @Column('text', { nullable: true })
    logoPath!: string;

    @Column('integer', { nullable: true })
    runtime!: number;

    @Column('float', { nullable: true })
    voteAverage!: number;

    @Column('text', { nullable: true })
    tvStatus!: string;

    @Column('integer', { nullable: true })
    preferredSourceId!: number;

    @Column('text', { nullable: true })
    alternativeNames!: string;

    @Column('text', { nullable: true })
    tmdbJson!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class CasbyTmdbSeason {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    titleId!: number;

    @Column('text', { nullable: true })
    tmdbTvId!: string;

    @Column('text', { nullable: true })
    tmdbSeasonId!: string;

    @Column('integer')
    seasonNumber!: number;

    @Column('text')
    name!: string;

    @Column('text', { nullable: true })
    overview!: string;

    @Column('text', { nullable: true })
    airDate!: string;

    @Column('integer', { default: 0 })
    episodeCount!: number;

    @Column('text', { nullable: true })
    posterPath!: string;

    @Column('text', { nullable: true })
    tmdbJson!: string;

    @Column('boolean', { default: true })
    isEnabled!: boolean;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class CasbyTmdbEpisode {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    titleId!: number;

    @Column('integer', { nullable: true })
    seasonId!: number;

    @Column('text', { nullable: true })
    tmdbTvId!: string;

    @Column('text', { nullable: true })
    tmdbEpisodeId!: string;

    @Column('integer')
    seasonNumber!: number;

    @Column('integer')
    episodeNumber!: number;

    @Column('text')
    name!: string;

    @Column('text', { nullable: true })
    overview!: string;

    @Column('text', { nullable: true })
    airDate!: string;

    @Column('integer', { nullable: true })
    runtime!: number;

    @Column('text', { nullable: true })
    stillPath!: string;

    @Column('text', { nullable: true })
    tmdbJson!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class CasbyTmdbPerson {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    tmdbPersonId!: string;

    @Column('text')
    name!: string;

    @Column('text', { nullable: true })
    originalName!: string;

    @Column('text', { nullable: true })
    knownForDepartment!: string;

    @Column('text', { nullable: true })
    profilePath!: string;

    @Column('text', { nullable: true })
    tmdbJson!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class CasbyTmdbCredit {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    titleId!: number;

    @Column('integer', { nullable: true })
    personId!: number;

    @Column('text')
    creditType!: string; // 'cast' | 'crew'

    @Column('text', { nullable: true })
    department!: string;

    @Column('text', { nullable: true })
    job!: string;

    @Column('text', { nullable: true })
    character!: string;

    @Column('integer', { default: 0 })
    order!: number;

    @Column('text', { nullable: true })
    tmdbJson!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class CasbyTmdbSource {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    titleId!: number;

    @Column('text', { default: 'share' })
    sourceType!: string;

    @Column('text')
    name!: string;

    @Column('text', { nullable: true })
    shareLink!: string;

    @Column('text', { nullable: true })
    shareCode!: string;

    @Column('text', { nullable: true })
    shareId!: string;

    @Column('text', { nullable: true })
    accessCode!: string;

    @Column('text', { nullable: true })
    shareMode!: string;

    @Column('text', { nullable: true })
    rootFileId!: string;

    @Column('text', { nullable: true })
    rootFileName!: string;

    @Column('boolean', { default: true })
    isFolder!: boolean;

    @Column('text', { nullable: true })
    lastError!: string;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastSyncAt!: Date;

    @Column('text', { nullable: true })
    metaJson!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class CasbyTmdbCasCache {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer', { nullable: true })
    sourceId!: number;

    @Column('integer')
    titleId!: number;

    @Column('text', { nullable: true })
    fileId!: string;

    @Column('text', { nullable: true })
    shareId!: string;

    @Column('text')
    fileName!: string;

    @Column('text', { nullable: true })
    casFileName!: string;

    @Column('text', { nullable: true })
    fullPath!: string;

    @Column('text', { nullable: true })
    lastOpTime!: string;

    @Column('text', { nullable: true })
    localPath!: string;

    @Column('text', { nullable: true })
    manifestJson!: string;

    @Column('text', { nullable: true })
    manifestMetaJson!: string;

    @Column('text', { nullable: true })
    lastError!: string;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastFetchedAt!: Date;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class CasbyTmdbBinding {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('integer')
    titleId!: number;

    @Column('integer', { nullable: true })
    episodeId!: number;

    @Column('text', { default: 'share' })
    targetType!: string;

    @Column('integer', { nullable: true })
    taskId!: number;

    @Column('text', { nullable: true })
    fileId!: string;

    @Column('text', { nullable: true })
    shareId!: string;

    @Column('text', { nullable: true })
    strmPath!: string;

    @Column('text', { nullable: true })
    url!: string;

    @Column('text', { nullable: true })
    fileName!: string;

    @Column('float', { default: 1 })
    confidence!: number;

    @Column('boolean', { default: false })
    isManual!: boolean;

    @Column('datetime', { nullable: true, transformer: beijingDatetimeTransformer })
    lastVerifiedAt!: Date;

    @Column('text', { nullable: true })
    matchJson!: string;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class OrganizeHistory {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text', { nullable: true })
    mediaType!: string;

    @Column('text', { nullable: true })
    category!: string;

    @Column('text')
    title!: string;

    @Column('text', { nullable: true })
    originalTitle!: string;

    @Column('text', { nullable: true })
    year!: string;

    @Column('text', { nullable: true })
    tmdbId!: string;

    @Column('text', { nullable: true })
    sourcePath!: string;

    @Column('text', { nullable: true })
    targetPath!: string;

    @Column('text', { nullable: true })
    sourceName!: string;

    @Column('text', { nullable: true })
    targetName!: string;

    @Column('text', { nullable: true })
    error!: string;

    @Column('text', { nullable: true })
    sourceType!: string;

    @Column('integer', { nullable: true })
    profileId!: number;

    @Column('text', { nullable: true })
    jobId!: string;

    @Column('float', { nullable: true })
    matchScore!: number;

    @Column('float', { nullable: true })
    voteAverage!: number;

    @Column('integer', { default: 0 })
    totalEpisodes!: number;

    @Column('integer', { nullable: true })
    season!: number;

    @Column('integer', { nullable: true })
    episode!: number;

    @Column('boolean', { default: false })
    scraped!: boolean;

    @Column('boolean', { default: false })
    strmGenerated!: boolean;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}

@Entity()
export class OrganizeProfile {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column('text')
    name!: string;

    @Column('boolean', { default: true })
    enabled!: boolean;

    @Column('text', { default: 'manual' })
    sourceType!: string;

    @Column('text', { nullable: true })
    watchDir!: string;

    @Column('text', { nullable: true })
    targetDir!: string;

    @Column('boolean', { default: false })
    enableWatch!: boolean;

    @Column('boolean', { default: true })
    enableScrape!: boolean;

    @Column('boolean', { default: true })
    enableCategory!: boolean;

    @Column('integer', { nullable: true, default: -1 })
    fileOperation!: number;

    @Column('boolean', { nullable: true })
    syncDelete!: boolean;

    @Column('boolean', { nullable: true })
    overwrite!: boolean;

    @CreateDateColumn({ transformer: beijingDatetimeTransformer })
    createdAt!: Date;

    @UpdateDateColumn({ transformer: beijingDatetimeTransformer })
    updatedAt!: Date;
}
