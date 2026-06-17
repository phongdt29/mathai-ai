import mongoose from "mongoose";
import {
	type ApprovalRequestRepository,
	approvalRequestRepository,
} from "../models/approval.model";
import { AssessmentModel } from "../models/assessment.model";
import {
	type IMathRubricContract,
	mathRubricContractRepository,
} from "../models/content-library.model";
import {
	AttendanceRecordModel,
	LearningRiskScoreModel,
} from "../models/engagement.model";
import { StudentProfileRepository } from "../models/student.model";
import {
	type StudentSubmissionRepository,
	studentSubmissionRepository,
	type TeacherAssignmentRepository,
	type TeacherClassRepository,
	teacherAssignmentRepository,
	teacherClassRepository,
} from "../models/teacher.model";
import { UserRepository } from "../models/user.model";
import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../utils/errors";
import {
	calculateRubricScore,
	type RubricScoreInput,
} from "../utils/rubric-grading";
import { calculatePercentage, validateEarnedPoints } from "../utils/scoring";
import { assessmentAnomalyDetectorService } from "./assessment-anomaly-detector.service";
import { type AuditActor, auditService } from "./audit.service";
import { contentLibraryService } from "./content-library.service";
import { gradebookService } from "./gradebook.service";
import { pointService } from "./point.service";
import { notificationService } from "./notification.service";

export class TeacherService {
	private classRepo: TeacherClassRepository;
	private assignmentRepo: TeacherAssignmentRepository;
	private submissionRepo: StudentSubmissionRepository;
	private profileRepo: StudentProfileRepository;
	private userRepo: UserRepository;
	private approvalRepo: ApprovalRequestRepository;

	constructor() {
		this.classRepo = teacherClassRepository;
		this.assignmentRepo = teacherAssignmentRepository;
		this.submissionRepo = studentSubmissionRepository;
		this.profileRepo = new StudentProfileRepository();
		this.userRepo = new UserRepository();
		this.approvalRepo = approvalRequestRepository;
	}

	// ── Helpers ──

	private async ensureTeacher(userId: string): Promise<void> {
		const user = await this.userRepo.findById(userId);
		if (!user || user.role !== "teacher") {
			throw new ForbiddenError(
				"Chỉ giáo viên mới có quyền thực hiện thao tác này",
			);
		}
	}

	private async ensureClassOwner(classId: string, teacherId: string) {
		const cls = await this.classRepo.findById(classId);
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");
		if (cls.teacher_id.toString() !== teacherId) {
			throw new ForbiddenError("Bạn không có quyền truy cập lớp học này");
		}
		return cls;
	}

	private async resolveRubricGrade(input: {
		assignment: { rubric_contract_id?: unknown; total_points: number };
		score: number;
		rubric_scores?: RubricScoreInput[];
	}): Promise<{
		earnedPoints: number;
		gradingMetadata: Record<string, unknown>;
		rubricScore: Record<string, unknown> | null;
	}> {
		if (
			!input.assignment.rubric_contract_id ||
			!Array.isArray(input.rubric_scores)
		) {
			return {
				earnedPoints: validateEarnedPoints(
					input.score,
					input.assignment.total_points,
				),
				gradingMetadata: { scoring_method: "legacy" },
				rubricScore: null,
			};
		}

		let contract: IMathRubricContract | null = null;
		try {
			contract = await mathRubricContractRepository.findActiveById(
				String(input.assignment.rubric_contract_id),
			);
			if (!contract) {
				throw new Error("Rubric contract is not active");
			}
			const rubricResult = calculateRubricScore(contract, input.rubric_scores);
			const scaledScore =
				input.assignment.total_points === rubricResult.total_points
					? rubricResult.earned_points
					: (rubricResult.percentage / 100) * input.assignment.total_points;
			return {
				earnedPoints: validateEarnedPoints(
					scaledScore,
					input.assignment.total_points,
				),
				gradingMetadata: {
					scoring_method: "rubric",
					rubric_contract_id: String(contract._id),
					rubric_total_points: rubricResult.total_points,
					rubric_percentage: rubricResult.percentage,
				},
				rubricScore: rubricResult as unknown as Record<string, unknown>,
			};
		} catch (error) {
			return {
				earnedPoints: validateEarnedPoints(
					input.score,
					input.assignment.total_points,
				),
				gradingMetadata: {
					scoring_method: "legacy_fallback",
					rubric_contract_id: input.assignment.rubric_contract_id
						? String(input.assignment.rubric_contract_id)
						: null,
					rubric_error:
						error instanceof Error ? error.message : "Unknown rubric error",
				},
				rubricScore: null,
			};
		}
	}

	// ── Dashboard ──

	public async getDashboard(teacherId: string) {
		await this.ensureTeacher(teacherId);

		const classes = await this.classRepo.findByTeacherId(teacherId);
		const classIds = classes.map((c) => c.id);

		const totalStudents = classes.reduce(
			(sum, c) => sum + (c.student_ids?.length || 0),
			0,
		);

		const assignments = await this.assignmentRepo.findByTeacherId(teacherId);
		const pendingGrading = assignments.filter(
			(a) => a.status === "grading" || a.status === "active",
		);

		// Count submissions needing grading
		let ungradedCount = 0;
		for (const a of pendingGrading) {
			const counts = await this.submissionRepo.countByAssignment(a.id);
			ungradedCount += counts.submitted - counts.graded;
		}

		// Recent student activity: get all student profiles from all classes
		const allStudentIds = [
			...new Set(
				classes.flatMap((c) => c.student_ids.map((id: any) => id.toString())),
			),
		];
		const recentProfiles = await this.profileRepo.model
			.find({ _id: { $in: allStudentIds } })
			.populate("user_id", "full_name email is_active")
			.sort({ updatedAt: -1 })
			.limit(10)
			.exec();

		// Class performance: avg scores from assessments for students in each class
		const classPerformance = await Promise.all(
			classes.map(async (cls) => {
				const studentIds = cls.student_ids.map((id: any) => id);
				const avgResult = await AssessmentModel.aggregate([
					{
						$match: {
							student_id: { $in: studentIds },
							total_score: { $ne: null },
						},
					},
					{ $group: { _id: null, avgScore: { $avg: "$total_score" } } },
				]);
				return {
					id: cls.id,
					name: cls.name,
					subject: cls.subject,
					students: cls.student_ids.length,
					avgScore:
						avgResult.length > 0
							? Math.round(avgResult[0].avgScore * 10) / 10
							: null,
					schedule: cls.schedule,
				};
			}),
		);

		return {
			stats: {
				total_students: totalStudents,
				total_classes: classes.length,
				total_assignments: assignments.length,
				ungraded_submissions: ungradedCount,
			},
			classes: classPerformance,
			recent_students: recentProfiles.map((p: any) => ({
				id: p.id,
				full_name: p.user_id?.full_name || "",
				email: p.user_id?.email || "",
				grade_level: p.grade_level,
				classification: p.initial_classification,
				updatedAt: p.updatedAt,
			})),
			pending_assignments: pendingGrading.map((a: any) => ({
				id: a.id,
				title: a.title,
				class_name: a.class_id?.name || "",
				type: a.type,
				status: a.status,
				due_date: a.due_date,
			})),
		};
	}

	// ── Classes CRUD ──

	public async getClasses(teacherId: string) {
		await this.ensureTeacher(teacherId);
		const classes = await this.classRepo.findByTeacherId(teacherId);

		return Promise.all(
			classes.map(async (cls) => {
				const studentIds = cls.student_ids.map((id: any) => id);
				const assignmentCount = await this.assignmentRepo.model.countDocuments({
					class_id: cls.id,
				});

				const avgResult = await AssessmentModel.aggregate([
					{
						$match: {
							student_id: { $in: studentIds },
							total_score: { $ne: null },
						},
					},
					{ $group: { _id: null, avgScore: { $avg: "$total_score" } } },
				]);

				return {
					...(cls.toObject ? cls.toObject() : cls),
					student_count: cls.student_ids.length,
					assignment_count: assignmentCount,
					avg_score:
						avgResult.length > 0
							? Math.round(avgResult[0].avgScore * 10) / 10
							: null,
				};
			}),
		);
	}

	// Teacher proposes creating a class (requires admin approval)
	public async requestCreateClass(
		teacherId: string,
		data: {
			name: string;
			subject: string;
			grade_level: number;
			schedule?: string;
			description?: string;
		},
	) {
		await this.ensureTeacher(teacherId);
		if (!data.name || !data.subject || !data.grade_level) {
			throw new ValidationError("Tên lớp, môn học và khối là bắt buộc");
		}
		const proposal = await this.approvalRepo.create({
			type: "create_class",
			requester_id: new mongoose.Types.ObjectId(teacherId) as any,
			status: "pending",
			data: {
				name: data.name,
				subject: data.subject,
				grade_level: data.grade_level,
				schedule: data.schedule || "",
				description: data.description || null,
			},
		} as any);
		await auditService.record({
			actor: { id: teacherId, role: "teacher" },
			action: "approval.request_create_class",
			resourceType: "approval_request",
			resourceId: String(proposal._id),
			scopeType: "teacher",
			scopeId: teacherId,
			after: proposal,
			result: "success",
		});
		return proposal.toObject ? proposal.toObject() : proposal;
	}

	// Internal: called by admin after approval
	public async createClass(
		teacherId: string,
		data: {
			name: string;
			subject: string;
			grade_level: number;
			schedule?: string;
			description?: string;
		},
		actor?: AuditActor | null,
	) {
		const cls = await this.classRepo.create({
			teacher_id: new mongoose.Types.ObjectId(teacherId) as any,
			name: data.name,
			subject: data.subject,
			grade_level: data.grade_level,
			schedule: data.schedule || "",
			description: data.description || null,
			student_ids: [],
			is_active: true,
		} as any);
		await auditService.record({
			actor: actor ?? { id: teacherId, role: "teacher" },
			action: "class.create",
			resourceType: "teacher_class",
			resourceId: String(cls._id),
			scopeType: "teacher",
			scopeId: teacherId,
			after: cls,
			result: "success",
		});
		return cls.toObject ? cls.toObject() : cls;
	}

	public async updateClass(
		teacherId: string,
		classId: string,
		data: Partial<{
			name: string;
			subject: string;
			grade_level: number;
			schedule: string;
			description: string;
		}>,
	) {
		const cls = await this.ensureClassOwner(classId, teacherId);
		const updated = await this.classRepo.update(classId, data as any);
		return updated.toObject ? updated.toObject() : updated;
	}

	public async requestArchiveClass(teacherId: string, classId: string) {
		const cls = await this.ensureClassOwner(classId, teacherId);
		const proposal = await this.approvalRepo.create({
			type: "archive_class",
			requester_id: new mongoose.Types.ObjectId(teacherId) as any,
			status: "pending",
			data: {
				class_id: classId,
				class_name: cls.name,
			},
		} as any);
		await auditService.record({
			actor: { id: teacherId, role: "teacher" },
			action: "approval.request_archive_class",
			resourceType: "approval_request",
			resourceId: String(proposal._id),
			scopeType: "class",
			scopeId: classId,
			after: proposal,
			result: "success",
		});
		return proposal.toObject ? proposal.toObject() : proposal;
	}

	public async deleteClass(
		teacherId: string,
		classId: string,
		actor?: AuditActor | null,
	) {
		const before = await this.ensureClassOwner(classId, teacherId);
		await this.classRepo.update(classId, { is_active: false } as any);
		await auditService.record({
			actor: actor ?? { id: teacherId, role: "teacher" },
			action: "class.archive",
			resourceType: "teacher_class",
			resourceId: classId,
			scopeType: "class",
			scopeId: classId,
			before,
			after: { is_active: false },
			result: "success",
		});
	}

	public async getClassDetail(teacherId: string, classId: string) {
		const cls = await this.ensureClassOwner(classId, teacherId);
		const populated = await this.classRepo.model
			.findById(classId)
			.populate({
				path: "student_ids",
				populate: { path: "user_id", select: "full_name email is_active" },
			})
			.exec();

		const assignments = await this.assignmentRepo.findByClassId(classId);

		return {
			...(populated?.toObject() || {}),
			assignments: assignments.map((a: any) => ({
				id: a.id,
				title: a.title,
				type: a.type,
				status: a.status,
				due_date: a.due_date,
			})),
		};
	}

	// ── Student Management ──

	public async getStudentsInClass(teacherId: string, classId: string) {
		const cls = await this.ensureClassOwner(classId, teacherId);

		const profiles = await this.profileRepo.model
			.find({ _id: { $in: cls.student_ids } })
			.populate("user_id", "full_name email is_active")
			.exec();

		return Promise.all(
			profiles.map(async (p: any) => {
				// Get avg assessment score for this student
				const avgResult = await AssessmentModel.aggregate([
					{ $match: { student_id: p._id, total_score: { $ne: null } } },
					{ $group: { _id: null, avgScore: { $avg: "$total_score" } } },
				]);

				// Count submissions for this class's assignments
				const classAssignments = await this.assignmentRepo.model
					.find({ class_id: classId })
					.select("_id")
					.exec();
				const assignmentIds = classAssignments.map((a) => a._id);
				const submissionCount = await this.submissionRepo.model.countDocuments({
					student_id: p._id,
					assignment_id: { $in: assignmentIds },
				});

				return {
					id: p.id,
					user_id: p.user_id?._id || p.user_id,
					full_name: p.user_id?.full_name || "",
					email: p.user_id?.email || "",
					grade_level: p.grade_level,
					classification: p.initial_classification,
					school_name: p.school_name,
					avg_score:
						avgResult.length > 0
							? Math.round(avgResult[0].avgScore * 10) / 10
							: null,
					submissions: submissionCount,
					total_assignments: assignmentIds.length,
				};
			}),
		);
	}

	public async getAllStudents(teacherId: string) {
		await this.ensureTeacher(teacherId);
		const classes = await this.classRepo.findByTeacherId(teacherId);

		const studentMap = new Map<string, { profile: any; classes: string[] }>();

		for (const cls of classes) {
			for (const sid of cls.student_ids) {
				const key = sid.toString();
				if (!studentMap.has(key)) {
					studentMap.set(key, { profile: null, classes: [] });
				}
				studentMap.get(key)!.classes.push(cls.name);
			}
		}

		const allIds = [...studentMap.keys()];
		if (allIds.length === 0) return [];

		const profiles = await this.profileRepo.model
			.find({ _id: { $in: allIds } })
			.populate("user_id", "full_name email is_active")
			.exec();

		for (const p of profiles) {
			const entry = studentMap.get(p.id);
			if (entry) entry.profile = p;
		}

		return Promise.all(
			[...studentMap.entries()].map(
				async ([id, { profile, classes: classNames }]) => {
					if (!profile) return null;

					const avgResult = await AssessmentModel.aggregate([
						{ $match: { student_id: profile._id, total_score: { $ne: null } } },
						{ $group: { _id: null, avgScore: { $avg: "$total_score" } } },
					]);

					return {
						id: profile.id,
						full_name: profile.user_id?.full_name || "",
						email: profile.user_id?.email || "",
						grade_level: profile.grade_level,
						classification: profile.initial_classification,
						classes: classNames,
						avg_score:
							avgResult.length > 0
								? Math.round(avgResult[0].avgScore * 10) / 10
								: null,
					};
				},
			),
		).then((results) => results.filter(Boolean));
	}

	// Teacher proposes adding a student (requires admin approval)
	public async requestAddStudent(
		teacherId: string,
		classId: string,
		studentEmail: string,
	) {
		await this.ensureClassOwner(classId, teacherId);

		const user = await this.userRepo.findByEmail(studentEmail);
		if (!user || user.role !== "student") {
			throw new NotFoundError("Không tìm thấy học sinh với email này");
		}

		const profile = await this.profileRepo.findByUserId(user.id);
		if (!profile) {
			throw new NotFoundError("Học sinh chưa có hồ sơ");
		}

		const cls = await this.classRepo.findById(classId);

		const proposal = await this.approvalRepo.create({
			type: "add_student",
			requester_id: new mongoose.Types.ObjectId(teacherId) as any,
			status: "pending",
			data: {
				class_id: classId,
				class_name: cls?.name || "",
				student_email: studentEmail,
				student_profile_id: profile.id,
				student_name: user.full_name,
			},
		} as any);
		await auditService.record({
			actor: { id: teacherId, role: "teacher" },
			action: "approval.request_add_student",
			resourceType: "approval_request",
			resourceId: String(proposal._id),
			scopeType: "class",
			scopeId: classId,
			after: proposal,
			result: "success",
		});
		return proposal.toObject ? proposal.toObject() : proposal;
	}

	// Internal: called by admin after approval
	public async addStudentToClass(
		_teacherId: string,
		classId: string,
		studentEmail: string,
		actor?: AuditActor | null,
	) {
		const user = await this.userRepo.findByEmail(studentEmail);
		if (!user || user.role !== "student") {
			throw new NotFoundError("Không tìm thấy học sinh với email này");
		}

		const profile = await this.profileRepo.findByUserId(user.id);
		if (!profile) {
			throw new NotFoundError("Học sinh chưa có hồ sơ");
		}

		const before = await this.classRepo.findById(classId);
		const updated = await this.classRepo.addStudent(classId, profile.id);
		if (updated) {
			await contentLibraryService.syncClassAssignmentsToStudent(
				classId,
				profile.id,
			);
			await auditService.record({
				actor: actor ?? { id: _teacherId, role: "teacher" },
				action: "class.student_add",
				resourceType: "teacher_class",
				resourceId: classId,
				scopeType: "class",
				scopeId: classId,
				before,
				after: updated,
				result: "success",
				metadata: {
					student_profile_id: profile.id,
					student_email: studentEmail,
				},
			});
		}
		return updated;
	}

	// Get teacher's proposals
	public async getMyProposals(teacherId: string, status?: string) {
		await this.ensureTeacher(teacherId);
		const validStatus =
			status && ["pending", "approved", "rejected"].includes(status)
				? (status as "pending" | "approved" | "rejected")
				: undefined;
		return this.approvalRepo.findByRequester(teacherId, validStatus);
	}

	public async requestRemoveStudent(
		teacherId: string,
		classId: string,
		studentProfileId: string,
	) {
		const cls = await this.ensureClassOwner(classId, teacherId);
		const studentInClass = cls.student_ids.some(
			(id: any) => id.toString() === studentProfileId,
		);
		if (!studentInClass)
			throw new ValidationError("Học sinh không thuộc lớp học này");
		const proposal = await this.approvalRepo.create({
			type: "remove_student",
			requester_id: new mongoose.Types.ObjectId(teacherId) as any,
			status: "pending",
			data: {
				class_id: classId,
				class_name: cls.name,
				student_profile_id: studentProfileId,
			},
		} as any);
		await auditService.record({
			actor: { id: teacherId, role: "teacher" },
			action: "approval.request_remove_student",
			resourceType: "approval_request",
			resourceId: String(proposal._id),
			scopeType: "class",
			scopeId: classId,
			after: proposal,
			result: "success",
		});
		return proposal.toObject ? proposal.toObject() : proposal;
	}

	public async removeStudentFromClass(
		teacherId: string,
		classId: string,
		studentProfileId: string,
		actor?: AuditActor | null,
	) {
		const before = await this.ensureClassOwner(classId, teacherId);
		const updated = await this.classRepo.removeStudent(
			classId,
			studentProfileId,
		);
		await auditService.record({
			actor: actor ?? { id: teacherId, role: "teacher" },
			action: "class.student_remove",
			resourceType: "teacher_class",
			resourceId: classId,
			scopeType: "class",
			scopeId: classId,
			before,
			after: updated,
			result: "success",
			metadata: { student_profile_id: studentProfileId },
		});
	}

	// ── Assignments CRUD ──

	public async getAssignments(
		teacherId: string,
		status?: string,
		classId?: string,
	) {
		await this.ensureTeacher(teacherId);

		let assignments: any[];
		if (classId) {
			await this.ensureClassOwner(classId, teacherId);
			assignments = await this.assignmentRepo.findByClassId(classId);
			if (status && status !== "all") {
				assignments = assignments.filter((a) => a.status === status);
			}
		} else {
			assignments = await this.assignmentRepo.findByTeacherId(
				teacherId,
				status,
			);
		}

		return Promise.all(
			assignments.map(async (a: any) => {
				const counts = await this.submissionRepo.countByAssignment(a.id);
				const avgScore = await this.submissionRepo.avgScoreByAssignment(a.id);

				// Get total students from class
				const cls = await this.classRepo.findById(
					a.class_id?._id || a.class_id,
				);
				const totalStudents = cls?.student_ids?.length || 0;

				return {
					id: a.id,
					title: a.title,
					description: a.description,
					type: a.type,
					status: a.status,
					due_date: a.due_date,
					total_points: a.total_points,
					class_id: a.class_id?._id || a.class_id,
					class_name: a.class_id?.name || cls?.name || "",
					total_students: totalStudents,
					submitted: counts.submitted,
					graded: counts.graded,
					avg_score: avgScore,
					createdAt: a.createdAt,
				};
			}),
		);
	}

	public async getAssignment(teacherId: string, assignmentId: string) {
		const assignment = await this.assignmentRepo.findById(assignmentId);
		if (!assignment) throw new NotFoundError("Không tìm thấy bài tập");
		if (assignment.teacher_id.toString() !== teacherId) {
			throw new ForbiddenError("Bạn không có quyền xem bài tập này");
		}

		const rawAssignment = assignment as any;
		const counts = await this.submissionRepo.countByAssignment(
			rawAssignment.id,
		);
		const avgScore = await this.submissionRepo.avgScoreByAssignment(
			rawAssignment.id,
		);
		const cls = await this.classRepo.findById(
			rawAssignment.class_id?._id || rawAssignment.class_id,
		);
		const totalStudents = cls?.student_ids?.length || 0;

		return {
			id: rawAssignment.id,
			title: rawAssignment.title,
			description: rawAssignment.description,
			type: rawAssignment.type,
			status: rawAssignment.status,
			due_date: rawAssignment.due_date,
			total_points: rawAssignment.total_points,
			class_id: rawAssignment.class_id?._id || rawAssignment.class_id,
			class_name: rawAssignment.class_id?.name || cls?.name || "",
			total_students: totalStudents,
			submitted: counts.submitted,
			graded: counts.graded,
			avg_score: avgScore,
			rubric_contract_id: rawAssignment.rubric_contract_id ?? null,
			createdAt: rawAssignment.createdAt,
			updatedAt: rawAssignment.updatedAt,
		};
	}

	public async createAssignment(
		teacherId: string,
		data: {
			class_id: string;
			title: string;
			description?: string;
			type: "homework" | "quiz" | "exam";
			status?: "draft" | "active";
			due_date?: string;
			total_points?: number;
			rubric_contract_id?: string | null;
		},
	) {
		await this.ensureClassOwner(data.class_id, teacherId);

		const assignment = await this.assignmentRepo.create({
			teacher_id: new mongoose.Types.ObjectId(teacherId) as any,
			class_id: new mongoose.Types.ObjectId(data.class_id) as any,
			title: data.title,
			description: data.description || null,
			type: data.type,
			status: data.status || "draft",
			due_date: data.due_date ? new Date(data.due_date) : null,
			total_points: data.total_points || 10,
			rubric_contract_id: data.rubric_contract_id
				? new mongoose.Types.ObjectId(data.rubric_contract_id)
				: null,
		} as any);

		return assignment.toObject ? assignment.toObject() : assignment;
	}

	public async updateAssignment(
		teacherId: string,
		assignmentId: string,
		data: Partial<{
			title: string;
			description: string;
			type: string;
			status: string;
			due_date: string;
			total_points: number;
			rubric_contract_id: string | null;
		}>,
	) {
		const assignment = await this.assignmentRepo.findById(assignmentId);
		if (!assignment) throw new NotFoundError("Không tìm thấy bài tập");
		if (assignment.teacher_id.toString() !== teacherId) {
			throw new ForbiddenError("Bạn không có quyền sửa bài tập này");
		}

		const updateData: any = { ...data };
		if (data.due_date) updateData.due_date = new Date(data.due_date);
		if (data.rubric_contract_id !== undefined) {
			updateData.rubric_contract_id = data.rubric_contract_id
				? new mongoose.Types.ObjectId(data.rubric_contract_id)
				: null;
		}

		const updated = await this.assignmentRepo.update(assignmentId, updateData);
		return updated.toObject ? updated.toObject() : updated;
	}

	public async deleteAssignment(teacherId: string, assignmentId: string) {
		const assignment = await this.assignmentRepo.findById(assignmentId);
		if (!assignment) throw new NotFoundError("Không tìm thấy bài tập");
		if (assignment.teacher_id.toString() !== teacherId) {
			throw new ForbiddenError("Bạn không có quyền xóa bài tập này");
		}
		await this.assignmentRepo.delete(assignmentId);
	}

	// ── Grading ──

	public async getSubmissions(teacherId: string, assignmentId: string) {
		const assignment = await this.assignmentRepo.findById(assignmentId);
		if (!assignment) throw new NotFoundError("Không tìm thấy bài tập");
		if (assignment.teacher_id.toString() !== teacherId) {
			throw new ForbiddenError("Bạn không có quyền xem bài nộp này");
		}

		return this.submissionRepo.findByAssignment(assignmentId);
	}

	public async gradeSubmission(
		teacherId: string,
		submissionId: string,
		data: {
			score: number;
			feedback?: string;
			rubric_scores?: RubricScoreInput[];
		},
	) {
		const submission = await this.submissionRepo.findById(submissionId);
		if (!submission) throw new NotFoundError("Không tìm thấy bài nộp");

		const assignment = await this.assignmentRepo.findById(
			submission.assignment_id.toString(),
		);
		if (!assignment || assignment.teacher_id.toString() !== teacherId) {
			throw new ForbiddenError("Bạn không có quyền chấm bài này");
		}

		if (
			!Number.isFinite(assignment.total_points) ||
			assignment.total_points < 0
		) {
			throw new ValidationError("Tổng điểm bài tập phải là số không âm");
		}

		let gradingResult: Awaited<
			ReturnType<TeacherService["resolveRubricGrade"]>
		>;
		try {
			gradingResult = await this.resolveRubricGrade({
				assignment,
				score: data.score,
				rubric_scores: data.rubric_scores,
			});
		} catch {
			throw new ValidationError(
				"Điểm phải nằm trong khoảng 0 đến tổng điểm bài tập",
			);
		}
		const earnedPoints = gradingResult.earnedPoints;
		const gradedAt = new Date();

		const updated = await this.submissionRepo.update(submissionId, {
			score: earnedPoints,
			feedback: data.feedback || null,
			rubric_score: gradingResult.rubricScore,
			graded_at: gradedAt,
		} as any);

		await pointService.recordTeacherAssignmentResult({
			student_id: submission.student_id.toString(),
			assignment_id: assignment._id.toString(),
			submission_id: submission._id.toString(),
			earned_points: earnedPoints,
			max_points: assignment.total_points,
			created_by: teacherId,
			reason: `Teacher assignment graded: ${assignment.title}`,
			metadata: {
				regrade_policy: "update_latest_grade",
				...gradingResult.gradingMetadata,
			},
		});

		await this.detectAssignmentSubmissionAnomalies({
			teacherId,
			assignment,
			submission: updated as any,
			earnedPoints,
		});

		try {
			const gradebookEntry =
				await gradebookService.upsertTeacherAssignmentEntry({
					teacher_id: teacherId,
					class_id: String(assignment.class_id),
					assignment_id: String(assignment._id),
					submission_id: String(submission._id),
					student_id: String(submission.student_id),
					title: assignment.title,
					earned_points: earnedPoints,
					max_points: assignment.total_points,
					graded_at: gradedAt,
					submitted_at: submission.submitted_at,
					metadata: {
						feedback_present: Boolean(data.feedback),
						percentage: calculatePercentage(
							earnedPoints,
							assignment.total_points,
						),
						...gradingResult.gradingMetadata,
					},
				});

			await auditService.record({
				actor: { id: teacherId, role: "teacher" },
				action: "gradebook.teacher_assignment_update",
				resourceType: "gradebook_entry",
				resourceId: String(gradebookEntry._id),
				scopeType: "class",
				scopeId: String(assignment.class_id),
				after: gradebookEntry,
				result: "success",
				metadata: {
					assignment_id: String(assignment._id),
					submission_id: String(submission._id),
					...gradingResult.gradingMetadata,
				},
			});
		} catch (error) {
			await auditService.record({
				actor: { id: teacherId, role: "teacher" },
				action: "gradebook.teacher_assignment_update",
				resourceType: "gradebook_entry",
				resourceId: String(submission._id),
				scopeType: "class",
				scopeId: String(assignment.class_id),
				result: "failure",
				errorCode: "GRADEBOOK_UPDATE_FAILED",
				metadata: {
					assignment_id: String(assignment._id),
					submission_id: String(submission._id),
					error:
						error instanceof Error ? error.message : "Unknown gradebook error",
				},
			});
		}

		// ── Dispatch notification to student about grading ────────────────
		try {
			await notificationService.send({
				type: "assignment_graded",
				recipient: {
					user_id: String(submission.student_id),
				},
				channels: ["in_app", "push"],
				payload: {
					assignment_id: String(assignment._id),
					assignment_title: assignment.title,
					score: earnedPoints,
					total_points: assignment.total_points,
					feedback: data.feedback || null,
					graded_at: gradedAt.toISOString(),
					teacher_id: teacherId,
					class_id: String(assignment.class_id),
				},
				template_id: "assignment_graded.v1",
				metadata: {
					assignment_id: String(assignment._id),
					submission_id: String(submission._id),
					student_id: String(submission.student_id),
				},
			});
		} catch {
			// Fail-soft: notification failure should not block grading response
		}

		return updated.toObject ? updated.toObject() : updated;
	}

	private async detectAssignmentSubmissionAnomalies(input: {
		teacherId: string;
		assignment: any;
		submission: any;
		earnedPoints: number;
	}): Promise<void> {
		try {
			const peerSubmissions =
				mongoose.connection.readyState === 1
					? await this.submissionRepo.findByAssignment(
							String(input.assignment._id),
						)
					: [];
			await assessmentAnomalyDetectorService.detect({
				source: "teacher_assignment_submission",
				studentId: String(input.submission.student_id),
				sourceId: String(input.submission._id),
				submission: {
					id: String(input.submission._id),
					assignment_id: String(input.assignment._id),
					student_id: String(input.submission.student_id),
					content: input.submission.content,
					score: input.earnedPoints,
					max_score: Number(input.assignment.total_points ?? 0),
					submitted_at: input.submission.submitted_at,
					graded_at: input.submission.graded_at,
					createdAt: input.submission.createdAt,
					updatedAt: input.submission.updatedAt,
				},
				peerSubmissions: peerSubmissions.map((peer: any) => ({
					id: String(peer._id),
					assignment_id: String(peer.assignment_id),
					student_id: String(peer.student_id?._id ?? peer.student_id),
					content: peer.content,
					score:
						peer.score === null || peer.score === undefined
							? null
							: Number(peer.score),
					max_score: Number(input.assignment.total_points ?? 0),
					submitted_at: peer.submitted_at,
					graded_at: peer.graded_at,
					createdAt: peer.createdAt,
					updatedAt: peer.updatedAt,
				})),
				actor: { userId: input.teacherId, role: "teacher" },
				persistSignals: true,
			});
		} catch (error) {
			console.warn("Assignment submission anomaly detection failed", {
				teacherId: input.teacherId,
				submissionId: String(input.submission?._id ?? ""),
				error,
			});
		}
	}

	public async getGradebookSummary(
		teacherId: string,
		classId?: string,
		studentId?: string,
	) {
		await this.ensureTeacher(teacherId);
		if (classId) {
			await this.ensureClassOwner(classId, teacherId);
		}
		if (studentId) {
			const classes = classId
				? [await this.ensureClassOwner(classId, teacherId)]
				: await this.classRepo.findByTeacherId(teacherId);
			const studentInScope = classes.some((cls) =>
				cls.student_ids.some((id: any) => id.toString() === studentId),
			);
			if (!studentInScope)
				throw new ForbiddenError("Bạn không có quyền xem học sinh này");
		}
		return gradebookService.getSummary({
			teacher_id: teacherId,
			class_id: classId,
			student_id: studentId,
		});
	}

	// ── Analytics ──

	public async getAnalytics(teacherId: string) {
		await this.ensureTeacher(teacherId);
		const classes = await this.classRepo.findByTeacherId(teacherId);

		const allStudentIds = [
			...new Set(classes.flatMap((c) => c.student_ids.map((id: any) => id))),
		];

		// Overall stats
		const totalAssignments = await this.assignmentRepo.model.countDocuments({
			teacher_id: new mongoose.Types.ObjectId(teacherId),
		});

		const overallAvg = await AssessmentModel.aggregate([
			{
				$match: {
					student_id: { $in: allStudentIds },
					total_score: { $ne: null },
				},
			},
			{ $group: { _id: null, avgScore: { $avg: "$total_score" } } },
		]);

		// Attendance rate (last 30 days)
		const thirtyDaysAgo = new Date();
		thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
		const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split("T")[0];

		const attendanceAgg = await AttendanceRecordModel.aggregate([
			{
				$match: {
					student_id: { $in: allStudentIds.map((id: any) => new mongoose.Types.ObjectId(id.toString())) },
					scheduled_date: { $gte: thirtyDaysAgoStr },
				},
			},
			{
				$group: {
					_id: null,
					total: { $sum: 1 },
					present: {
						$sum: { $cond: [{ $in: ["$status", ["present", "partial"]] }, 1, 0] },
					},
				},
			},
		]);

		const avgAttendanceRate =
			attendanceAgg.length > 0 && attendanceAgg[0].total > 0
				? Math.round((attendanceAgg[0].present / attendanceAgg[0].total) * 100)
				: null;

		// ── Trends: weekly avg scores (last 8 weeks) ──
		const eightWeeksAgo = new Date();
		eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56);

		const weeklyScores = await this.submissionRepo.model.aggregate([
			{
				$match: {
					student_id: { $in: allStudentIds.map((id: any) => new mongoose.Types.ObjectId(id.toString())) },
					graded_at: { $gte: eightWeeksAgo },
					score: { $ne: null },
				},
			},
			{
				$group: {
					_id: {
						year: { $isoWeekYear: "$graded_at" },
						week: { $isoWeek: "$graded_at" },
					},
					avg_score: { $avg: "$score" },
					count: { $sum: 1 },
				},
			},
			{ $sort: { "_id.year": 1, "_id.week": 1 } },
			{ $limit: 8 },
		]);

		const weekly_avg_scores = weeklyScores.map((w: any) => ({
			week: `${w._id.year}-W${String(w._id.week).padStart(2, "0")}`,
			avg_score: Math.round(w.avg_score * 10) / 10,
			count: w.count,
		}));

		// ── Trends: weekly attendance rate (last 8 weeks) ──
		const weeklyAttendance = await AttendanceRecordModel.aggregate([
			{
				$match: {
					student_id: { $in: allStudentIds.map((id: any) => new mongoose.Types.ObjectId(id.toString())) },
					scheduled_date: { $gte: eightWeeksAgo.toISOString().split("T")[0] },
				},
			},
			{
				$addFields: {
					parsed_date: { $dateFromString: { dateString: "$scheduled_date", format: "%Y-%m-%d" } },
				},
			},
			{
				$group: {
					_id: {
						year: { $isoWeekYear: "$parsed_date" },
						week: { $isoWeek: "$parsed_date" },
					},
					total: { $sum: 1 },
					present: {
						$sum: { $cond: [{ $in: ["$status", ["present", "partial"]] }, 1, 0] },
					},
				},
			},
			{ $sort: { "_id.year": 1, "_id.week": 1 } },
			{ $limit: 8 },
		]);

		const weekly_attendance_rate = weeklyAttendance.map((w: any) => ({
			week: `${w._id.year}-W${String(w._id.week).padStart(2, "0")}`,
			rate: w.total > 0 ? Math.round((w.present / w.total) * 100) : 0,
			total: w.total,
		}));

		// ── Risk distribution ──
		const riskDistribution = await LearningRiskScoreModel.aggregate([
			{
				$match: {
					student_id: { $in: allStudentIds.map((id: any) => new mongoose.Types.ObjectId(id.toString())) },
				},
			},
			{ $sort: { student_id: 1, score_date: -1 } },
			{
				$group: {
					_id: "$student_id",
					latest_risk_level: { $first: "$risk_level" },
				},
			},
			{
				$group: {
					_id: "$latest_risk_level",
					count: { $sum: 1 },
				},
			},
		]);

		const risk_distribution = { low: 0, medium: 0, high: 0 };
		for (const r of riskDistribution) {
			const level = r._id as string;
			if (level === "low" || level === "medium" || level === "high") {
				risk_distribution[level] = r.count;
			}
		}

		// ── Top progress: students with highest avg scores ──
		const studentScores = await Promise.all(
			allStudentIds.slice(0, 100).map(async (sid: any) => {
				const avg = await AssessmentModel.aggregate([
					{ $match: { student_id: sid, total_score: { $ne: null } } },
					{ $group: { _id: null, avgScore: { $avg: "$total_score" } } },
				]);
				if (avg.length === 0) return null;

				const profile = await this.profileRepo.model
					.findById(sid)
					.populate("user_id", "full_name email")
					.exec();
				if (!profile) return null;

				const studentClasses = classes.filter((c) =>
					c.student_ids.some((id: any) => id.toString() === sid.toString()),
				);

				return {
					id: profile.id,
					full_name: (profile as any).user_id?.full_name || "",
					class_names: studentClasses.map((c) => c.name),
					avg_score: Math.round(avg[0].avgScore * 10) / 10,
				};
			}),
		).then((r) => r.filter(Boolean));

		const sortedByScore = [...studentScores].sort(
			(a: any, b: any) => b.avg_score - a.avg_score,
		);
		const top_progress = sortedByScore.slice(0, 10);
		const attention_needed = sortedByScore
			.filter((s: any) => s.avg_score < 5)
			.slice(0, 10);

		return {
			overall: {
				total_students: allStudentIds.length,
				total_classes: classes.length,
				total_assignments: totalAssignments,
				avg_class_score:
					overallAvg.length > 0
						? Math.round(overallAvg[0].avgScore * 10) / 10
						: null,
				avg_attendance_rate: avgAttendanceRate,
			},
			trends: {
				weekly_avg_scores,
				weekly_attendance_rate,
			},
			risk_distribution,
			top_progress,
			attention_needed,
		};
	}
	// ── Submission Attachments (scoped) ──

	public async getSubmissionAttachments(teacherId: string, submissionId: string) {
		const submission = await this.submissionRepo.findById(submissionId);
		if (!submission) throw new NotFoundError("Không tìm thấy bài nộp");

		const assignment = await this.assignmentRepo.findById(
			submission.assignment_id.toString(),
		);
		if (!assignment || assignment.teacher_id.toString() !== teacherId) {
			throw new ForbiddenError("Bạn không có quyền xem file đính kèm này");
		}

		return submission.attachments || [];
	}

	// ── Gradebook Drill-Down (per student) ──

	public async getStudentGradebookDetail(teacherId: string, studentId: string) {
		await this.ensureTeacher(teacherId);

		// Verify student is in one of teacher's classes
		const classes = await this.classRepo.findByTeacherId(teacherId);
		const studentInScope = classes.some((cls) =>
			cls.student_ids.some((id: any) => id.toString() === studentId),
		);
		if (!studentInScope) {
			throw new ForbiddenError("Bạn không có quyền xem học sinh này");
		}

		// Student profile
		const profile = await this.profileRepo.model
			.findById(studentId)
			.populate("user_id", "full_name email")
			.exec();
		if (!profile) throw new NotFoundError("Không tìm thấy học sinh");

		// Assignment scores: all submissions for this student in teacher's classes
		const classIds = classes.map((c) => c.id);
		const teacherAssignments = await this.assignmentRepo.model
			.find({ class_id: { $in: classIds } })
			.select("_id title type total_points due_date class_id")
			.exec();
		const assignmentIds = teacherAssignments.map((a) => a._id);

		const submissions = await this.submissionRepo.model
			.find({
				student_id: new mongoose.Types.ObjectId(studentId),
				assignment_id: { $in: assignmentIds },
			})
			.sort({ submitted_at: -1 })
			.exec();

		const assignmentScores = submissions.map((sub: any) => {
			const assignment = teacherAssignments.find(
				(a) => a._id.toString() === sub.assignment_id.toString(),
			);
			return {
				assignment_id: sub.assignment_id.toString(),
				title: (assignment as any)?.title || "",
				type: (assignment as any)?.type || "",
				total_points: (assignment as any)?.total_points || 0,
				score: sub.score,
				is_late: sub.is_late || false,
				submitted_at: sub.submitted_at,
				graded_at: sub.graded_at,
				feedback: sub.feedback,
			};
		});

		// Attendance history (last 60 days)
		const attendanceRecords = await AttendanceRecordModel.find({
			student_id: new mongoose.Types.ObjectId(studentId),
		})
			.sort({ scheduled_date: -1 })
			.limit(60)
			.exec();

		const attendance_history = attendanceRecords.map((r: any) => ({
			date: r.scheduled_date,
			status: r.status,
			active_duration_seconds: r.active_duration_seconds,
			focus_ratio: r.focus_ratio,
		}));

		// Risk-score history (last 30 days)
		const riskScores = await LearningRiskScoreModel.find({
			student_id: new mongoose.Types.ObjectId(studentId),
		})
			.sort({ score_date: -1 })
			.limit(30)
			.exec();

		const risk_history = riskScores.map((r: any) => ({
			date: r.score_date,
			risk_score: r.risk_score,
			risk_level: r.risk_level,
		}));

		// Student's classes
		const studentClasses = classes
			.filter((c) =>
				c.student_ids.some((id: any) => id.toString() === studentId),
			)
			.map((c) => ({ id: c.id, name: c.name }));

		return {
			student: {
				id: profile.id,
				full_name: (profile as any).user_id?.full_name || "",
				email: (profile as any).user_id?.email || "",
				grade_level: (profile as any).grade_level,
				classes: studentClasses,
			},
			assignment_scores: assignmentScores,
			attendance_history,
			risk_history,
		};
	}
}

export const teacherService = new TeacherService();
