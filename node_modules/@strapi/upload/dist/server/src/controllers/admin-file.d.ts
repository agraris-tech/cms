import type { Context } from 'koa';
declare const _default: {
    find(ctx: Context): Promise<Context | {
        results: any;
        pagination: {
            page: number;
            pageSize: number;
            pageCount: number;
            total: number;
        };
    }>;
    findOne(ctx: Context): Promise<void>;
    destroy(ctx: Context): Promise<void>;
    getAIMetadataCount(ctx: Context): Promise<Context | undefined>;
    generateAIMetadata(ctx: Context): Promise<Context | undefined>;
    getLatestAIMetadataJob(ctx: Context): Promise<Context | undefined>;
};
export default _default;
//# sourceMappingURL=admin-file.d.ts.map