import {
	type IStudentProfile,
	StudentProfileRepository,
} from "../models/student.model";
import {
	type IStudentSubmission,
	type IStudentSubmissionAttachment,
	type ITeacherAssignment,
	type ITeacherClass,
	type StudentSubmissionRepository,
	studentSubmissionRepository,
	type TeacherAssignmentRepository,
	type TeacherClassRepository,
	teacherAssignmentRepository,
	teacherClassRepository,
} from "../models/teacher.model";
import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../utils/errors";
import {
	notificationService,
	type NotificationService,
} from "./notification.service";

export interface StudentAssignmentSummary {
	id: string;
	title: string;
	description: string | null;
	type: string;
	status: string;
	due_date: Date | null;
	total_points: number;
	class_id: string;
	class_name: string;
	submission_id: string | null;
	submission_content: string | null;
	submitted_at: Date | null;
	score: number | null;
	feedback: string | null;
	graded_at: Date | null;
}

export type StudentAssignmentSubmissionStatus =
	| "pending"
	| "submitted"
	| "graded";

export interface StudentAssignmentListOptions {
	page?: number;
	limit?: number;
	status?: string;
	class_id?: string;
	submission_status?: StudentAssignmentSubmissionStatus;
}

export interface StudentAssignmentListResult {
	items: StudentAssignmentSummary[];
	total: number;
	page: number;
	limit: number;
	total_pages: number;
	filters: {
		status: string | null;
		class_id: string | null;
		submission_status: StudentAssignmentSubmissionStatus | null;
	};
}

export interface SubmitStudentAssignmentPayload {
	content: string;
	attachment_ids?: string[];
}

type StudentProfileRepositoryPort = Pick<
	StudentProfileRepository,
	"findByUserId"
>;
type TeacherClassRepositoryPort = Pick<
	TeacherClassRepository,
	"findClassesByStudentId" | "findById"
>;
type TeacherAssignmentRepositoryPort = Pick<
	TeacherAssignmentRepository,
	"findByClassId" | "findById"
>;
type StudentSubmissionRepositoryPort = Pick<
	StudentSubmissionRepository,
	"findByAssignmentAndStudent" | "create" | "update"
>;

export class StudentAssignmentService {
	private readonly studentProfileRepository: StudentProfileRepositoryPort;
	private readonly classRepository: TeacherClassRepositoryPort;
	private readonly assignmentRepository: TeacherAssignmentRepositoryPort;
	private readonly submissionRepository: StudentSubmissionRepositoryPort;
	private readonly notificationSvc: NotificationService;

	constructor(deps?: { notificationService?: NotificationService }) {
		this.studentProfileRepository = new StudentProfileRepository();
		this.classRepository = teacherClassRepository;
		this.assignmentRepository = teacherAssignmentRepository;
		this.submissionRepository = studentSubmissionRepository;
		this.notificationSvc = deps?.notificationService ?? notificationService;
	}

	public async listAssignments(
		userId: string,
	): Promise<StudentAssignmentSummary[]> {
		return this.collectAssignmentSummaries(userId);
	}

	public async listAssignmentsPage(
		userId: string,
		options: StudentAssignmentListOptions = {},
	): Promise<StudentAssignmentListResult> {
		const summaries = await this.collectAssignmentSummaries(userId);
		const filtered = this.filterAssignments(summaries, options);
		const limit = this.normalizeLimit(options.limit);
		const totalPages = Math.max(1, Math.ceil(filtered.length / limit));
		const page = Math.min(this.normalizePage(options.page), totalPages);
		const start = (page - 1) * limit;

		return {
			items: filtered.slice(start, start + limit),
			total: filtered.length,
			page,
			limit,
			total_pages: totalPages,
			filters: {
				status: options.status ?? null,
				class_id: options.class_id ?? null,
				submission_status: options.submission_status ?? null,
			},
		};
	}

	private async collectAssignmentSummaries(
		userId: string,
	): Promise<StudentAssignmentSummary[]> {
		const profile = await this.getStudentProfile(userId);
		const studentId = this.entityId(profile);
		const classes =
			await this.classRepository.findClassesByStudentId(studentId);
		const summaries: StudentAssignmentSummary[] = [];

		for (const teacherClass of classes) {
			const classId = this.entityId(teacherClass);
			const assignments =
				await this.assignmentRepository.findByClassId(classId);

			for (const assignment of assignments) {
				if (!this.isVisibleToStudent(assignment.status)) continue;
				const assignmentId = this.entityId(assignment);
				const submission =
					await this.submissionRepository.findByAssignmentAndStudent(
						assignmentId,
						studentId,
					);
				summaries.push(this.toSummary(assignment, teacherClass, submission));
			}
		}

		return summaries.sort((a, b) => {
			const left = a.due_date
				? new Date(a.due_date).getTime()
				: Number.MAX_SAFE_INTEGER;
			const right = b.due_date
				? new Date(b.due_date).getTime()
				: Number.MAX_SAFE_INTEGER;
			if (left !== right) return left - right;
			return a.title.localeCompare(b.title, "vi");
		});
	}

	private filterAssignments(
		summaries: StudentAssignmentSummary[],
		options: StudentAssignmentListOptions,
	): StudentAssignmentSummary[] {
		return summaries.filter((summary) => {
			if (options.status && summary.status !== options.status) return false;
			if (options.class_id && summary.class_id !== options.class_id)
				return false;
			if (options.submission_status === "pending") {
				return !summary.submission_id;
			}
			if (options.submission_status === "submitted") {
				return (
					Boolean(summary.submission_id) &&
					summary.score === null &&
					!summary.graded_at
				);
			}
			if (options.submission_status === "graded") {
				return summary.score !== null || Boolean(summary.graded_at);
			}
			return true;
		});
	}

	private normalizePage(value: number | undefined): number {
		return Number.isFinite(value) && value && value > 0 ? Math.floor(value) : 1;
	}

	private normalizeLimit(value: number | undefined): number {
		if (!Number.isFinite(value) || !value || value <= 0) return 10;
		return Math.min(50, Math.max(1, Math.floor(value)));
	}

	public async getAssignment(
		userId: string,
		assignmentId: string,
	): Promise<StudentAssignmentSummary> {
		const { assignment, teacherClass, studentId } =
			await this.getAccessibleAssignment(userId, assignmentId, {
				allowClosed: true,
			});
		const submission =
			await this.submissionRepository.findByAssignmentAndStudent(
				this.entityId(assignment),
				studentId,
			);
		return this.toSummary(assignment, teacherClass, submission);
	}

	public async submitAssignment(
		userId: string,
		assignmentId: string,
		payload: SubmitStudentAssignmentPayload,
	): Promise<IStudentSubmission> {
		const content = payload.content.trim();
		if (content.length === 0) {
			throw new ValidationError("Nội dung bài nộp không được để trống");
		}

		const { assignment, teacherClass, studentId } =
			await this.getAccessibleAssignment(userId, assignmentId);
		if (assignment.status !== "active") {
			throw new ValidationError("Bài tập không còn nhận bài nộp");
		}

		const submittedAt = new Date();

		// ── Determine is_late ──────────────────────────────────────────────
		const isLate =
			assignment.due_date != null && submittedAt > assignment.due_date;

		// ── Validate attachment_ids ownership ──────────────────────────────
		const attachmentIds = payload.attachment_ids ?? [];
		let validatedAttachments: IStudentSubmissionAttachment[] = [];

		if (attachmentIds.length > 0) {
			const existingSubmission =
				await this.submissionRepository.findByAssignmentAndStudent(
					this.entityId(assignment),
					studentId,
				);
			const currentAttachments = existingSubmission?.attachments ?? [];

			// Filter: only include attachments that belong to this student's submission for this assignment
			validatedAttachments = currentAttachments.filter((att) =>
				attachmentIds.includes(att.attachment_id),
			);

			// If any attachment_id was not found in the student's submission, it's invalid
			const foundIds = validatedAttachments.map((a) => a.attachment_id);
			const invalidIds = attachmentIds.filter((id) => !foundIds.includes(id));
			if (invalidIds.length > 0) {
				throw new ValidationError(
					`Attachment không hợp lệ hoặc không thuộc về bạn: ${invalidIds.join(", ")}`,
				);
			}
		}

		// ── Check for existing submission (resubmit logic) ────────────────
		const existingSubmission =
			await this.submissionRepository.findByAssignmentAndStudent(
				this.entityId(assignment),
				studentId,
			);

		if (!existingSubmission) {
			// ── First submission ───────────────────────────────────────────
			return this.submissionRepository.create({
				assignment_id: this.entityId(assignment),
				student_id: studentId,
				content,
				submitted_at: submittedAt,
				is_late: isLate,
				attachments: validatedAttachments.length > 0 ? validatedAttachments : undefined,
				resubmit_count: 0,
			} as unknown as Partial<IStudentSubmission>);
		}

		// ── Resubmit: update existing record ──────────────────────────────
		if (existingSubmission.score !== null || existingSubmission.graded_at) {
			throw new ValidationError("Bài đã được chấm nên không thể nộp lại");
		}

		const newResubmitCount = (existingSubmission.resubmit_count ?? 0) + 1;

		const updateData: Partial<IStudentSubmission> = {
			content,
			submitted_at: submittedAt,
			is_late: isLate,
			resubmit_count: newResubmitCount,
		} as Partial<IStudentSubmission>;

		// If attachment_ids provided, update attachments; otherwise keep existing
		if (attachmentIds.length > 0) {
			(updateData as any).attachments = validatedAttachments;
		}

		const updatedSubmission = await this.submissionRepository.update(
			this.entityId(existingSubmission),
			updateData,
		);

		// ── Dispatch notification to teacher about resubmission ────────────
		const teacherId = this.objectIdToString(teacherClass.teacher_id);
		try {
			await this.notificationSvc.send({
				type: "assignment_resubmitted",
				recipient: {
					user_id: teacherId,
				},
				channels: ["in_app"],
				payload: {
					assignment_id: this.entityId(assignment),
					assignment_title: assignment.title,
					student_id: studentId,
					class_id: this.entityId(teacherClass),
					class_name: teacherClass.name,
					resubmit_count: newResubmitCount,
					submitted_at: submittedAt.toISOString(),
				},
				template_id: "assignment_resubmitted.v1",
				metadata: {
					assignment_id: this.entityId(assignment),
					student_id: studentId,
				},
			});
		} catch {
			// Fail-soft: notification failure should not block submission
		}

		return updatedSubmission;
	}

	private async getStudentProfile(userId: string): Promise<IStudentProfile> {
		const profile = await this.studentProfileRepository.findByUserId(userId);
		if (!profile) {
			throw new NotFoundError("Không tìm thấy hồ sơ học sinh");
		}
		return profile as IStudentProfile;
	}

	private async getAccessibleAssignment(
		userId: string,
		assignmentId: string,
		options: { allowClosed?: boolean } = {},
	): Promise<{
		assignment: ITeacherAssignment;
		teacherClass: ITeacherClass;
		studentId: string;
	}> {
		const profile = await this.getStudentProfile(userId);
		const studentId = this.entityId(profile);
		const assignment = await this.assignmentRepository.findById(assignmentId);
		if (!assignment) {
			throw new NotFoundError("Không tìm thấy bài tập");
		}

		if (!options.allowClosed && assignment.status !== "active") {
			throw new ValidationError("Bài tập không còn nhận bài nộp");
		}

		const classId = this.objectIdToString(assignment.class_id);
		const teacherClass = await this.classRepository.findById(classId);
		if (!teacherClass) {
			throw new NotFoundError("Không tìm thấy lớp của bài tập");
		}

		const enrolled = (teacherClass.student_ids ?? []).some(
			(value) => this.objectIdToString(value) === studentId,
		);
		if (!enrolled) {
			throw new ForbiddenError("Bạn không thuộc lớp được giao bài tập này");
		}

		return { assignment, teacherClass, studentId };
	}

	/**
	 * Returns the submission history timeline for a student's assignment.
	 * Includes submitted_at, content, attachments, score, feedback, resubmit_count.
	 * Validates: Requirements 2.7, 2.8
	 */
	public async getSubmissionHistory(
		userId: string,
		assignmentId: string,
	): Promise<{
		assignment_id: string;
		assignment_title: string;
		submissions: Array<{
			submitted_at: Date;
			content: string;
			attachments: IStudentSubmissionAttachment[];
			score: number | null;
			feedback: string | null;
			graded_at: Date | null;
			is_late: boolean;
			resubmit_count: number;
		}>;
	}> {
		const { assignment, studentId } = await this.getAccessibleAssignment(
			userId,
			assignmentId,
			{ allowClosed: true },
		);

		const submission =
			await this.submissionRepository.findByAssignmentAndStudent(
				this.entityId(assignment),
				studentId,
			);

		const submissions = submission
			? [
					{
						submitted_at: submission.submitted_at,
						content: submission.content,
						attachments: submission.attachments ?? [],
						score: submission.score ?? null,
						feedback: submission.feedback ?? null,
						graded_at: submission.graded_at ?? null,
						is_late: submission.is_late ?? false,
						resubmit_count: submission.resubmit_count ?? 0,
					},
				]
			: [];

		return {
			assignment_id: this.entityId(assignment),
			assignment_title: assignment.title,
			submissions,
		};
	}

	private toSummary(
		assignment: ITeacherAssignment,
		teacherClass: ITeacherClass,
		submission: IStudentSubmission | null,
	): StudentAssignmentSummary {
		return {
			id: this.entityId(assignment),
			title: assignment.title,
			description: assignment.description,
			type: assignment.type,
			status: assignment.status,
			due_date: assignment.due_date,
			total_points: assignment.total_points,
			class_id: this.entityId(teacherClass),
			class_name: teacherClass.name,
			submission_id: submission ? this.entityId(submission) : null,
			submission_content: submission?.content ?? null,
			submitted_at: submission?.submitted_at ?? null,
			score: submission?.score ?? null,
			feedback: submission?.feedback ?? null,
			graded_at: submission?.graded_at ?? null,
		};
	}

	private isVisibleToStudent(status: string): boolean {
		return status === "active" || status === "grading" || status === "closed";
	}

	private entityId(entity: { id?: unknown; _id?: unknown }): string {
		return String(entity.id ?? entity._id);
	}

	private objectIdToString(value: unknown): string {
		if (value && typeof value === "object" && "_id" in value) {
			return String((value as { _id: unknown })._id);
		}
		return String(value);
	}
}

export const studentAssignmentService = new StudentAssignmentService();
export default studentAssignmentService;
