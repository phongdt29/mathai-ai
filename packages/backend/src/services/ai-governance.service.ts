import { AIGenerationLogModel } from '../models/ai-log.model';
import { approvalRequestRepository } from '../models/approval.model';

export interface CountBucket {
  key: string;
  count: number;
}

export interface ProviderModelBucket {
  provider: string;
  model: string;
  count: number;
  tokensInput: number;
  tokensOutput: number;
}

export interface AIGovernanceSummary {
  logs: {
    total: number;
    byPurpose: CountBucket[];
    byStatus: CountBucket[];
    bySafetyStatus: CountBucket[];
  };
  approvals: {
    pending: number;
    requiresApproval: number;
    byStatus: CountBucket[];
  };
  safety: {
    blocked: number;
    flagged: number;
    events: number;
  };
  providers: ProviderModelBucket[];
  generatedAt: string;
}

const normalizeKey = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
};

export class AIGovernanceService {
  public async getSummary(): Promise<AIGovernanceSummary> {
    const [logTotal, byPurposeRaw, byStatusRaw, bySafetyStatusRaw, pendingApprovals, requiresApproval, approvalStatusRaw, providerRaw] = await Promise.all([
      AIGenerationLogModel.countDocuments({}),
      this.groupLogsBy('$purpose', 'other'),
      this.groupLogsBy('$status', 'unknown'),
      this.groupLogsBy('$safety_status', 'not_checked'),
      approvalRequestRepository.model.countDocuments({ status: 'pending' }),
      AIGenerationLogModel.countDocuments({ requires_approval: true }),
      this.groupApprovalRequestsByStatus(),
      AIGenerationLogModel.aggregate([
        {
          $group: {
            _id: {
              provider: { $ifNull: ['$ai_provider', 'unknown'] },
              model: { $ifNull: ['$ai_model', 'unknown'] },
            },
            count: { $sum: 1 },
            tokensInput: { $sum: { $ifNull: ['$tokens_input', 0] } },
            tokensOutput: { $sum: { $ifNull: ['$tokens_output', 0] } },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 20 },
      ]).exec(),
    ]);

    const safetyBlocked = this.findCount(bySafetyStatusRaw, 'blocked');
    const safetyFlagged = this.findCount(bySafetyStatusRaw, 'flagged');

    return {
      logs: {
        total: logTotal,
        byPurpose: byPurposeRaw,
        byStatus: byStatusRaw,
        bySafetyStatus: bySafetyStatusRaw,
      },
      approvals: {
        pending: pendingApprovals,
        requiresApproval,
        byStatus: approvalStatusRaw,
      },
      safety: {
        blocked: safetyBlocked,
        flagged: safetyFlagged,
        events: safetyBlocked + safetyFlagged,
      },
      providers: providerRaw.map((item: any) => ({
        provider: normalizeKey(item._id?.provider, 'unknown'),
        model: normalizeKey(item._id?.model, 'unknown'),
        count: Number(item.count ?? 0),
        tokensInput: Number(item.tokensInput ?? 0),
        tokensOutput: Number(item.tokensOutput ?? 0),
      })),
      generatedAt: new Date().toISOString(),
    };
  }

  private async groupLogsBy(field: string, fallback: string): Promise<CountBucket[]> {
    const rows = await AIGenerationLogModel.aggregate([
      { $group: { _id: { $ifNull: [field, fallback] }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]).exec();

    return rows.map((row: any) => ({ key: normalizeKey(row._id, fallback), count: Number(row.count ?? 0) }));
  }

  private async groupApprovalRequestsByStatus(): Promise<CountBucket[]> {
    const rows = await approvalRequestRepository.model.aggregate([
      { $group: { _id: { $ifNull: ['$status', 'unknown'] }, count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]).exec();

    return rows.map((row: any) => ({ key: normalizeKey(row._id, 'unknown'), count: Number(row.count ?? 0) }));
  }

  private findCount(buckets: CountBucket[], key: string): number {
    return buckets.find((bucket) => bucket.key === key)?.count ?? 0;
  }
}

export const aiGovernanceService = new AIGovernanceService();
export default aiGovernanceService;
