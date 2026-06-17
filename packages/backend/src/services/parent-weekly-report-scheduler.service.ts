import { ParentNotificationModel } from "../models/engagement.model";
import { UserModel } from "../models/user.model";
import { ParentMonitoringService } from "./parent-monitoring.service";

export interface WeeklyReportParentRecipient {
	id: string;
	email?: string | null;
	full_name?: string | null;
}

export type ParentWeeklyReport = Awaited<
	ReturnType<ParentMonitoringService["getWeeklyReport"]>
>;

export interface ParentWeeklyReportDeliveryInput {
	parent: WeeklyReportParentRecipient;
	periodKey: string;
	report: ParentWeeklyReport;
}

export interface ParentWeeklyReportSchedulerDeps {
	listActiveParents: () => Promise<WeeklyReportParentRecipient[]>;
	getNotificationPreference: (
		parentUserId: string,
	) => Promise<{ notify_weekly_summary?: boolean } | null>;
	buildWeeklyReport: (
		parentUserId: string,
		rangeDays: number,
	) => Promise<ParentWeeklyReport>;
	hasExistingDelivery: (
		parentUserId: string,
		periodKey: string,
	) => Promise<boolean>;
	deliverWeeklyReport: (
		input: ParentWeeklyReportDeliveryInput,
	) => Promise<boolean>;
	logger?: ParentWeeklyReportSchedulerLogger;
}

export interface ParentWeeklyReportSchedulerLogger {
	log: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
}

export interface ParentWeeklyReportSchedulerRunOptions {
	periodKey: string;
	rangeDays?: number;
}

export interface ParentWeeklyReportSchedulerFailure {
	parentUserId: string;
	error: string;
}

export interface ParentWeeklyReportSchedulerSummary {
	periodKey: string;
	rangeDays: number;
	scanned: number;
	skippedOptOut: number;
	skippedExisting: number;
	skippedEmptyReport: number;
	delivered: number;
	failed: number;
	failures: ParentWeeklyReportSchedulerFailure[];
}

const DEFAULT_RANGE_DAYS = 7;

export class ParentWeeklyReportSchedulerService {
	private readonly deps: ParentWeeklyReportSchedulerDeps;
	private readonly logger: ParentWeeklyReportSchedulerLogger;

	constructor(deps: ParentWeeklyReportSchedulerDeps = createDefaultDeps()) {
		this.deps = deps;
		this.logger = deps.logger ?? console;
	}

	public async run(
		options: ParentWeeklyReportSchedulerRunOptions,
	): Promise<ParentWeeklyReportSchedulerSummary> {
		const rangeDays = normalizeRangeDays(options.rangeDays);
		const summary: ParentWeeklyReportSchedulerSummary = {
			periodKey: options.periodKey,
			rangeDays,
			scanned: 0,
			skippedOptOut: 0,
			skippedExisting: 0,
			skippedEmptyReport: 0,
			delivered: 0,
			failed: 0,
			failures: [],
		};

		const parents = await this.deps.listActiveParents();
		for (const parent of parents) {
			summary.scanned += 1;

			try {
				const prefs = await this.deps.getNotificationPreference(parent.id);
				if (prefs?.notify_weekly_summary === false) {
					summary.skippedOptOut += 1;
					continue;
				}

				const alreadyDelivered = await this.deps.hasExistingDelivery(
					parent.id,
					options.periodKey,
				);
				if (alreadyDelivered) {
					summary.skippedExisting += 1;
					continue;
				}

				const report = await this.deps.buildWeeklyReport(parent.id, rangeDays);
				if (report.students.length === 0) {
					summary.skippedEmptyReport += 1;
					continue;
				}

				const delivered = await this.deps.deliverWeeklyReport({
					parent,
					periodKey: options.periodKey,
					report,
				});
				if (delivered) {
					summary.delivered += 1;
				} else {
					summary.skippedExisting += 1;
				}
			} catch (error) {
				const failure = {
					parentUserId: parent.id,
					error: formatErrorMessage(error),
				};
				summary.failed += 1;
				summary.failures.push(failure);
				this.logger.warn(
					`Failed to send weekly report for parent ${parent.id}`,
					failure.error,
				);
			}
		}

		this.logger.log(
			`Weekly parent report scheduler complete: period=${summary.periodKey} scanned=${summary.scanned} delivered=${summary.delivered} skipped_opt_out=${summary.skippedOptOut} skipped_existing=${summary.skippedExisting} skipped_empty_report=${summary.skippedEmptyReport} failed=${summary.failed}`,
		);

		return summary;
	}
}

function createDefaultDeps(): ParentWeeklyReportSchedulerDeps {
	const parentMonitoringService = new ParentMonitoringService();
	return {
		listActiveParents: listActiveParentRecipients,
		getNotificationPreference: (parentUserId) =>
			parentMonitoringService.getPreferences(parentUserId as any) as any,
		buildWeeklyReport: (parentUserId, rangeDays) =>
			parentMonitoringService.getWeeklyReport(parentUserId, rangeDays),
		hasExistingDelivery: hasExistingWeeklySummaryDelivery,
		deliverWeeklyReport: createWeeklySummaryNotification,
		logger: console,
	};
}

async function listActiveParentRecipients(): Promise<
	WeeklyReportParentRecipient[]
> {
	const parents = await UserModel.find({ role: "parent", is_active: true })
		.select("_id email full_name")
		.sort({ _id: 1 })
		.lean()
		.exec();

	return parents.map((parent) => ({
		id: String(parent._id),
		email: parent.email,
		full_name: parent.full_name,
	}));
}

async function hasExistingWeeklySummaryDelivery(
	parentUserId: string,
	periodKey: string,
): Promise<boolean> {
	const existing = await ParentNotificationModel.exists({
		parent_user_id: parentUserId,
		type: "weekly_summary",
		"payload.period_key": periodKey,
	}).exec();

	return existing !== null;
}

export async function createWeeklySummaryNotification({
	parent,
	periodKey,
	report,
}: ParentWeeklyReportDeliveryInput): Promise<boolean> {
	const firstStudent = report.students[0];
	if (!firstStudent) {
		return false;
	}

	const result = await ParentNotificationModel.findOneAndUpdate(
		{
			parent_user_id: parent.id,
			type: "weekly_summary",
			"payload.period_key": periodKey,
		},
		{
			$setOnInsert: {
				parent_user_id: parent.id,
				student_id: firstStudent.student_id,
				type: "weekly_summary",
				title: "Báo cáo học tập tuần",
				content: buildWeeklySummaryContent(report),
				payload: {
					period_key: periodKey,
					report,
				},
				severity: report.totals.alerts > 0 ? "warning" : "info",
				is_read: false,
				channel: "in_app",
				delivered_at: new Date(),
			},
		},
		{
			upsert: true,
			new: false,
			includeResultMetadata: true,
			setDefaultsOnInsert: true,
		},
	).exec();

	return !(result as any).lastErrorObject?.updatedExisting;
}

function buildWeeklySummaryContent(report: ParentWeeklyReport): string {
	const studentsLabel = `${report.totals.students} học sinh`;
	const sessionsLabel = `${report.totals.sessions} buổi học`;
	const minutesLabel = `${report.totals.active_minutes} phút học chủ động`;
	const alertsLabel = `${report.totals.alerts} cảnh báo`;
	return `Tổng kết ${report.range_days} ngày: ${studentsLabel}, ${sessionsLabel}, ${minutesLabel}, ${alertsLabel}.`;
}

function normalizeRangeDays(rangeDays: number | undefined): number {
	return typeof rangeDays === "number" &&
		Number.isFinite(rangeDays) &&
		rangeDays > 0
		? Math.min(Math.round(rangeDays), 30)
		: DEFAULT_RANGE_DAYS;
}

function formatErrorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export const parentWeeklyReportSchedulerService =
	new ParentWeeklyReportSchedulerService();
