import bcrypt from "bcryptjs";
import crypto from "crypto";
import {
	type NextFunction,
	type Request,
	type Response,
	Router,
} from "express";
import mongoose from "mongoose";
import { authenticate } from "../middleware/auth";
import { uploadAvatar } from "../middleware/upload";
import { AIGenerationLogModel } from "../models/ai-log.model";
import { aiTutorRepository } from "../models/ai-tutor.model";
import { approvalRequestRepository } from "../models/approval.model";
import { AssessmentModel } from "../models/assessment.model";
import { CurriculumModel } from "../models/curriculum.model";
import {
	AttendanceRecordModel,
	EngagementSessionModel,
} from "../models/engagement.model";
import { LessonModel } from "../models/lesson.model";
import { StudentProgressModel } from "../models/progress.model";
import { StudentProfileModel } from "../models/student.model";
import {
	studentSubmissionRepository,
	TeacherClassModel,
	teacherAssignmentRepository,
	teacherClassRepository,
} from "../models/teacher.model";
import { UserModel, userRepository } from "../models/user.model";
import { adminApprovalService } from "../services/admin-approval.service";
import { aiGovernanceService } from "../services/ai-governance.service";
import { aiProviderRegistryService } from "../services/ai-provider-registry.service";
import { attendanceService } from "../services/attendance.service";
import { auditService } from "../services/audit.service";
import { pointService } from "../services/point.service";
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../utils/errors";

const router = Router();
router.use(authenticate);

// ── Middleware: ensure admin/staff operational access ──
function requireAdminOrStaff(req: Request, _res: Response, next: NextFunction) {
	if (req.user?.role !== "admin" && req.user?.role !== "staff") {
		return next(
			new ForbiddenError(
				"Chỉ quản trị viên hoặc nhân viên mới có quyền truy cập",
			),
		);
	}
	next();
}

function requireAdminOnly(req: Request, _res: Response, next: NextFunction) {
	if (req.user?.role !== "admin") {
		return next(
			new ForbiddenError(
				"Chỉ quản trị viên mới có quyền thực hiện thao tác này",
			),
		);
	}
	next();
}

function requireStaffRestricted(
	req: Request,
	_res: Response,
	next: NextFunction,
) {
	if (req.user?.role === "staff") {
		return next(
			new ForbiddenError(
				"Nhân viên không có quyền thực hiện thao tác quản trị cấp cao này",
			),
		);
	}
	next();
}

router.use(requireAdminOrStaff);

const userId = (req: Request) => String(req.user!.id);
const actorRole = (req: Request) => req.user!.role;

async function resolveStudentProfileId(studentId: string): Promise<string> {
	if (!mongoose.Types.ObjectId.isValid(studentId)) {
		throw new ValidationError("studentId must be a valid ObjectId");
	}

	const profile = await StudentProfileModel.findById(studentId)
		.select("_id")
		.lean();
	if (profile?._id) return String(profile._id);

	const byUser = await StudentProfileModel.findOne({ user_id: studentId })
		.select("_id")
		.lean();
	if (byUser?._id) return String(byUser._id);

	throw new NotFoundError("Không tìm thấy hồ sơ học sinh");
}

// ── Student point ledger ──

async function findAIProviderAuditView(providerId: string) {
	const providers = await aiProviderRegistryService.listProviders();
	return providers.find((provider) => provider.id === providerId) ?? null;
}

// AI provider registry
router.get("/ai/providers", requireAdminOnly, async (_req, res, next) => {
	try {
		const data = await aiProviderRegistryService.listProviders();
		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

router.post("/ai/providers", requireAdminOnly, async (req, res, next) => {
	try {
		const data = await aiProviderRegistryService.upsertProvider(req.body);
		await auditService.recordFromRequest(req, {
			action: "ai_provider.create",
			resourceType: "ai_provider",
			resourceId: data.id,
			before: null,
			after: data,
			result: "success",
			metadata: { provider: data.provider, model: data.model },
		});
		res
			.status(201)
			.json({ success: true, data, message: "Đã tạo AI provider" });
	} catch (e) {
		next(e);
	}
});

router.put("/ai/providers/:id", requireAdminOnly, async (req, res, next) => {
	try {
		const before = await findAIProviderAuditView(req.params.id);
		const data = await aiProviderRegistryService.upsertProvider({
			...req.body,
			id: req.params.id,
		});
		await auditService.recordFromRequest(req, {
			action: "ai_provider.update",
			resourceType: "ai_provider",
			resourceId: data.id,
			before,
			after: data,
			result: "success",
			metadata: { provider: data.provider, model: data.model },
		});
		res.json({ success: true, data, message: "Đã cập nhật AI provider" });
	} catch (e) {
		next(e);
	}
});

router.post(
	"/ai/providers/:id/activate",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const before = await findAIProviderAuditView(req.params.id);
			const data = await aiProviderRegistryService.activateProvider(
				req.params.id,
			);
			await auditService.recordFromRequest(req, {
				action: "ai_provider.activate",
				resourceType: "ai_provider",
				resourceId: data.id,
				before,
				after: data,
				result: "success",
				metadata: { provider: data.provider, model: data.model },
			});
			res.json({ success: true, data, message: "Đã kích hoạt AI provider" });
		} catch (e) {
			next(e);
		}
	},
);

router.delete("/ai/providers/:id", requireAdminOnly, async (req, res, next) => {
	try {
		const before = await findAIProviderAuditView(req.params.id);
		await aiProviderRegistryService.deleteProvider(req.params.id);
		await auditService.recordFromRequest(req, {
			action: "ai_provider.delete",
			resourceType: "ai_provider",
			resourceId: req.params.id,
			before,
			after: null,
			result: "success",
			metadata: before
				? { provider: before.provider, model: before.model }
				: {},
		});
		res.json({ success: true, data: null, message: "Đã xóa AI provider" });
	} catch (e) {
		next(e);
	}
});

router.post(
	"/ai/providers/:id/test",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const data = await aiProviderRegistryService.testConnection(req.params.id);
			await auditService.recordFromRequest(req, {
				action: "ai_provider.test",
				resourceType: "ai_provider",
				resourceId: req.params.id,
				result: data.ok ? "success" : "failure",
				metadata: { latency_ms: data.latency_ms, error: data.error ?? null },
			});
			res.json({ success: true, data });
		} catch (e) {
			next(e);
		}
	},
);

router.get("/students/:studentId/points", async (req, res, next) => {
	try {
		const studentProfileId = await resolveStudentProfileId(
			req.params.studentId,
		);
		const data = await pointService.getStudentPointHistory(studentProfileId);
		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

router.post(
	"/students/:studentId/points",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const studentProfileId = await resolveStudentProfileId(
				req.params.studentId,
			);
			const rawRewardPoints = req.body?.reward_points;
			if (
				rawRewardPoints === "" ||
				rawRewardPoints === null ||
				rawRewardPoints === undefined
			) {
				throw new ValidationError("reward_points must be a finite number");
			}
			const rewardPoints = Number(rawRewardPoints);
			const reason =
				typeof req.body?.reason === "string" ? req.body.reason : "";
			const metadata =
				req.body?.metadata ??
				(req.body?.note ? { note: String(req.body.note) } : undefined);
			if (!Number.isFinite(rewardPoints)) {
				throw new ValidationError("reward_points must be a finite number");
			}
			if (
				metadata !== undefined &&
				(metadata === null ||
					Array.isArray(metadata) ||
					typeof metadata !== "object")
			) {
				throw new ValidationError("metadata must be an object");
			}

			const data = await pointService.recordManualAdjustment({
				student_id: studentProfileId,
				reward_points: rewardPoints,
				reason,
				created_by: userId(req),
				metadata,
			});
			await auditService.recordFromRequest(req, {
				action: "admin.student_points.adjust",
				resourceType: "student_profile",
				resourceId: studentProfileId,
				before: null,
				after: { reward_points: rewardPoints, reason },
				result: "success",
				metadata: { student_profile_id: studentProfileId },
			});
			res
				.status(201)
				.json({ success: true, data, message: "Đã điều chỉnh điểm thưởng" });
		} catch (e) {
			next(e);
		}
	},
);

// ── Proposals ──
router.get("/proposals", async (req, res, next) => {
	try {
		const { status, type } = req.query;
		const data = await adminApprovalService.getProposals(
			userId(req),
			status as string,
			type as string,
		);
		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

router.post(
	"/proposals/ai-content",
	requireStaffRestricted,
	async (req, res, next) => {
		try {
			const {
				content_kind,
				content,
				ai_log_id,
				prompt_template,
				prompt_version,
				ai_model,
				ai_provider,
				title,
				criteria,
				explanation,
			} = req.body;
			if (!content_kind || !content || typeof content !== "object") {
				throw new ValidationError("content_kind và content là bắt buộc");
			}
			const data = await adminApprovalService.createAIContentApprovalRequest({
				requesterId: userId(req),
				contentKind: content_kind,
				content,
				aiLogId: ai_log_id ?? null,
				promptTemplate: prompt_template ?? null,
				promptVersion: prompt_version ?? "v1",
				aiModel: ai_model ?? null,
				aiProvider: ai_provider ?? null,
				title: title ?? null,
				criteria: criteria ?? null,
				explanation: explanation ?? null,
			});
			await auditService.recordFromRequest(req, {
				action: "admin.proposal.create",
				resourceType: "approval_request",
				resourceId: String(data._id ?? data.id ?? null),
				before: null,
				after: { content_kind, title },
				result: "success",
				metadata: { content_kind },
			});
			res.status(201).json({
				success: true,
				data,
				message: "Đã tạo yêu cầu duyệt nội dung AI",
			});
		} catch (e) {
			next(e);
		}
	},
);

router.get("/proposals/pending-count", async (req, res, next) => {
	try {
		const count = await adminApprovalService.getPendingCount(userId(req));
		res.json({ success: true, data: { count } });
	} catch (e) {
		next(e);
	}
});

router.put(
	"/proposals/:id/approve",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const data = await adminApprovalService.approve(
				userId(req),
				req.params.id,
			);
			await auditService.recordFromRequest(req, {
				action: "admin.proposal.approve",
				resourceType: "approval_request",
				resourceId: req.params.id,
				before: null,
				after: { status: "approved" },
				result: "success",
			});
			res.json({ success: true, data, message: "Đã duyệt đề xuất" });
		} catch (e) {
			next(e);
		}
	},
);

router.put(
	"/proposals/:id/reject",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const { reason } = req.body;
			const data = await adminApprovalService.reject(
				userId(req),
				req.params.id,
				reason,
			);
			await auditService.recordFromRequest(req, {
				action: "admin.proposal.reject",
				resourceType: "approval_request",
				resourceId: req.params.id,
				before: null,
				after: { status: "rejected", reason },
				result: "success",
			});
			res.json({ success: true, data, message: "Đã từ chối đề xuất" });
		} catch (e) {
			next(e);
		}
	},
);

// ── AI Tutors CRUD ──
router.get("/ai-tutors", async (_req, res, next) => {
	try {
		const data = await aiTutorRepository.model
			.find()
			.sort({ createdAt: -1 })
			.exec();
		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

router.get("/ai-tutors/:id", async (req, res, next) => {
	try {
		const tutor = await aiTutorRepository.findById(req.params.id);
		if (!tutor) throw new NotFoundError("Không tìm thấy AI Tutor");
		res.json({ success: true, data: tutor });
	} catch (e) {
		next(e);
	}
});

router.post(
	"/ai-tutors",
	requireStaffRestricted,
	uploadAvatar,
	async (req, res, next) => {
		try {
			const body = req.body;
			// Auto-generate code
			body.code = `tutor_${crypto.randomBytes(4).toString("hex")}`;
			// Avatar URL from uploaded file
			if (req.file) {
				body.avatar_url = `/uploads/avatars/${req.file.filename}`;
			}
			const data = await aiTutorRepository.create(body);
			await auditService.recordFromRequest(req, {
				action: "admin.ai_tutor.create",
				resourceType: "ai_tutor",
				resourceId: String(data._id),
				before: null,
				after: { code: body.code, name: body.name },
				result: "success",
			});
			res.status(201).json({ success: true, data });
		} catch (e) {
			next(e);
		}
	},
);

router.put(
	"/ai-tutors/:id",
	requireStaffRestricted,
	uploadAvatar,
	async (req, res, next) => {
		try {
			const tutor = await aiTutorRepository.findById(req.params.id);
			if (!tutor) throw new NotFoundError("Không tìm thấy AI Tutor");
			const before = tutor.toObject ? tutor.toObject() : tutor;
			const body = req.body;
			// Don't allow changing code
			delete body.code;
			// Avatar URL from uploaded file
			if (req.file) {
				body.avatar_url = `/uploads/avatars/${req.file.filename}`;
			}
			const updated = await aiTutorRepository.update(req.params.id, body);
			await auditService.recordFromRequest(req, {
				action: "admin.ai_tutor.update",
				resourceType: "ai_tutor",
				resourceId: req.params.id,
				before,
				after: updated,
				result: "success",
			});
			res.json({ success: true, data: updated });
		} catch (e) {
			next(e);
		}
	},
);

router.delete(
	"/ai-tutors/:id",
	requireStaffRestricted,
	async (req, res, next) => {
		try {
			const tutor = await aiTutorRepository.findById(req.params.id);
			if (!tutor) throw new NotFoundError("Không tìm thấy AI Tutor");
			const before = tutor.toObject ? tutor.toObject() : tutor;
			await aiTutorRepository.delete(req.params.id);
			await auditService.recordFromRequest(req, {
				action: "admin.ai_tutor.delete",
				resourceType: "ai_tutor",
				resourceId: req.params.id,
				before,
				after: null,
				result: "success",
			});
			res.json({ success: true, message: "Đã xóa AI Tutor" });
		} catch (e) {
			next(e);
		}
	},
);

router.put(
	"/ai-tutors/:id/toggle",
	requireStaffRestricted,
	async (req, res, next) => {
		try {
			const tutor = await aiTutorRepository.findById(req.params.id);
			if (!tutor) throw new NotFoundError("Không tìm thấy AI Tutor");
			const before = { is_active: tutor.is_active };
			const updated = await aiTutorRepository.update(req.params.id, {
				is_active: !tutor.is_active,
			} as any);
			await auditService.recordFromRequest(req, {
				action: "admin.ai_tutor.toggle",
				resourceType: "ai_tutor",
				resourceId: req.params.id,
				before,
				after: { is_active: !tutor.is_active },
				result: "success",
			});
			res.json({ success: true, data: updated });
		} catch (e) {
			next(e);
		}
	},
);

// ── Teacher Management ──

// List all teachers with stats
router.get("/teachers", async (_req, res, next) => {
	try {
		const teachers = await UserModel.find({ role: "teacher" })
			.sort({ createdAt: -1 })
			.lean();

		const data = await Promise.all(
			teachers.map(async (t: any) => {
				const classes = await teacherClassRepository.model
					.find({ teacher_id: t._id, is_active: true })
					.lean();
				const classIds = classes.map((c: any) => c._id);
				const totalStudents = classes.reduce(
					(sum: number, c: any) => sum + (c.student_ids?.length || 0),
					0,
				);
				const totalAssignments =
					classIds.length > 0
						? await teacherAssignmentRepository.model.countDocuments({
								class_id: { $in: classIds },
							})
						: 0;
				const pendingProposals =
					await approvalRequestRepository.model.countDocuments({
						requester_id: t._id,
						status: "pending",
					});

				return {
					_id: t._id,
					email: t.email,
					full_name: t.full_name,
					is_active: t.is_active,
					createdAt: t.createdAt,
					stats: {
						total_classes: classes.length,
						total_students: totalStudents,
						total_assignments: totalAssignments,
						pending_proposals: pendingProposals,
					},
				};
			}),
		);

		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

// Get teacher detail
router.get("/teachers/:id", async (req, res, next) => {
	try {
		const teacher = await UserModel.findOne({
			_id: req.params.id,
			role: "teacher",
		}).lean();
		if (!teacher) throw new NotFoundError("Không tìm thấy giáo viên");

		const t: any = teacher;
		const classes = await teacherClassRepository.model
			.find({ teacher_id: t._id, is_active: true })
			.populate({
				path: "student_ids",
				populate: { path: "user_id", select: "full_name email" },
			})
			.lean();

		const classIds = classes.map((c: any) => c._id);
		const assignments =
			classIds.length > 0
				? await teacherAssignmentRepository.model
						.find({ class_id: { $in: classIds } })
						.sort({ createdAt: -1 })
						.limit(20)
						.lean()
				: [];

		const proposals = await approvalRequestRepository.model
			.find({ requester_id: t._id })
			.sort({ createdAt: -1 })
			.limit(20)
			.lean();

		// Submission stats
		let totalSubmissions = 0;
		let gradedSubmissions = 0;
		if (classIds.length > 0) {
			const assignmentIds = assignments.map((a: any) => a._id);
			if (assignmentIds.length > 0) {
				totalSubmissions =
					await studentSubmissionRepository.model.countDocuments({
						assignment_id: { $in: assignmentIds },
					});
				gradedSubmissions =
					await studentSubmissionRepository.model.countDocuments({
						assignment_id: { $in: assignmentIds },
						score: { $ne: null },
					});
			}
		}

		const totalStudents = classes.reduce(
			(sum: number, c: any) => sum + (c.student_ids?.length || 0),
			0,
		);

		res.json({
			success: true,
			data: {
				_id: t._id,
				email: t.email,
				full_name: t.full_name,
				is_active: t.is_active,
				createdAt: t.createdAt,
				stats: {
					total_classes: classes.length,
					total_students: totalStudents,
					total_assignments: assignments.length,
					total_submissions: totalSubmissions,
					graded_submissions: gradedSubmissions,
				},
				classes: classes.map((c: any) => ({
					_id: c._id,
					name: c.name,
					subject: c.subject,
					grade_level: c.grade_level,
					schedule: c.schedule,
					student_count: c.student_ids?.length || 0,
				})),
				recent_assignments: assignments.map((a: any) => ({
					_id: a._id,
					title: a.title,
					type: a.type,
					status: a.status,
					due_date: a.due_date,
					createdAt: a.createdAt,
				})),
				proposals: proposals.map((p: any) => ({
					_id: p._id,
					type: p.type,
					status: p.status,
					data: p.data,
					rejection_reason: p.rejection_reason,
					createdAt: p.createdAt,
				})),
			},
		});
	} catch (e) {
		next(e);
	}
});

// Create teacher account
router.post("/teachers", requireStaffRestricted, async (req, res, next) => {
	try {
		const { email, full_name, password } = req.body;
		if (!email || !full_name || !password) {
			throw new ValidationError("Email, họ tên và mật khẩu là bắt buộc");
		}
		if (password.length < 6) {
			throw new ValidationError("Mật khẩu phải có ít nhất 6 ký tự");
		}

		const existing = await userRepository.findByEmail(email);
		if (existing) throw new ConflictError("Email đã tồn tại");

		const password_hash = await bcrypt.hash(password, 12);
		const teacher = await userRepository.create({
			email,
			full_name,
			password_hash,
			role: "teacher",
			is_active: true,
		} as any);

		const { password_hash: _, ...safe } = teacher.toObject();
		await auditService.recordFromRequest(req, {
			action: "admin.teacher.create",
			resourceType: "user",
			resourceId: String(teacher._id),
			before: null,
			after: { email, full_name, role: "teacher" },
			result: "success",
		});
		res.status(201).json({ success: true, data: safe });
	} catch (e) {
		next(e);
	}
});

// Update teacher info
router.put("/teachers/:id", async (req, res, next) => {
	try {
		const teacher = await UserModel.findOne({
			_id: req.params.id,
			role: "teacher",
		});
		if (!teacher) throw new NotFoundError("Không tìm thấy giáo viên");

		const before = { full_name: teacher.full_name, email: teacher.email };
		const { full_name, email, password } = req.body;
		const update: any = {};
		if (full_name) update.full_name = full_name;
		if (email && email !== teacher.email) {
			const existing = await userRepository.findByEmail(email);
			if (existing) throw new ConflictError("Email đã tồn tại");
			update.email = email;
		}
		if (password && password.length >= 6) {
			update.password_hash = await bcrypt.hash(password, 12);
		}

		const updated = await userRepository.update(req.params.id, update);
		const { password_hash: _, ...safe } = updated.toObject();
		await auditService.recordFromRequest(req, {
			action: "admin.teacher.update",
			resourceType: "user",
			resourceId: req.params.id,
			before,
			after: { full_name: updated.full_name, email: updated.email },
			result: "success",
		});
		res.json({ success: true, data: safe });
	} catch (e) {
		next(e);
	}
});

// Toggle teacher active/inactive
router.put("/teachers/:id/toggle", requireAdminOnly, async (req, res, next) => {
	try {
		const teacher = await UserModel.findOne({
			_id: req.params.id,
			role: "teacher",
		});
		if (!teacher) throw new NotFoundError("Không tìm thấy giáo viên");

		const before = { is_active: teacher.is_active };
		const updated = await userRepository.update(req.params.id, {
			is_active: !teacher.is_active,
		} as any);
		const { password_hash: _, ...safe } = updated.toObject();
		await auditService.recordFromRequest(req, {
			action: "admin.teacher.toggle",
			resourceType: "user",
			resourceId: req.params.id,
			before,
			after: { is_active: updated.is_active },
			result: "success",
		});
		res.json({
			success: true,
			data: safe,
			message: updated.is_active
				? "Đã kích hoạt tài khoản"
				: "Đã khóa tài khoản",
		});
	} catch (e) {
		next(e);
	}
});

// Delete teacher (soft: deactivate + remove from classes)
router.delete("/teachers/:id", requireAdminOnly, async (req, res, next) => {
	try {
		const teacher = await UserModel.findOne({
			_id: req.params.id,
			role: "teacher",
		});
		if (!teacher) throw new NotFoundError("Không tìm thấy giáo viên");

		// Deactivate all classes
		await teacherClassRepository.model.updateMany(
			{ teacher_id: teacher._id },
			{ $set: { is_active: false } },
		);

		// Deactivate teacher
		await userRepository.update(req.params.id, { is_active: false } as any);

		await auditService.recordFromRequest(req, {
			action: "admin.teacher.deactivate",
			resourceType: "user",
			resourceId: req.params.id,
			before: { is_active: true },
			after: { is_active: false },
			result: "success",
			metadata: { soft_delete: true, classes_deactivated: true },
		});
		res.json({
			success: true,
			message: "Đã vô hiệu hóa giáo viên và tất cả lớp học",
		});
	} catch (e) {
		next(e);
	}
});

// ── Dashboard Stats ──
router.get("/stats", async (_req, res, next) => {
	try {
		const [
			totalUsers,
			activeUsers,
			totalLessons,
			totalAIRequests,
			recentUsers,
		] = await Promise.all([
			UserModel.countDocuments(),
			UserModel.countDocuments({ is_active: true }),
			LessonModel.countDocuments(),
			AIGenerationLogModel.countDocuments(),
			UserModel.find()
				.sort({ createdAt: -1 })
				.limit(10)
				.select("full_name email role createdAt")
				.lean(),
		]);

		// Count new users this month
		const startOfMonth = new Date();
		startOfMonth.setDate(1);
		startOfMonth.setHours(0, 0, 0, 0);
		const newUsersThisMonth = await UserModel.countDocuments({
			createdAt: { $gte: startOfMonth },
		});

		// Count AI requests this week
		const startOfWeek = new Date();
		startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
		startOfWeek.setHours(0, 0, 0, 0);
		const aiRequestsThisWeek = await AIGenerationLogModel.countDocuments({
			createdAt: { $gte: startOfWeek },
		});

		res.json({
			success: true,
			data: {
				stats: {
					totalUsers,
					activeUsers,
					totalLessons,
					totalAIRequests,
					newUsersThisMonth,
					aiRequestsThisWeek,
				},
				recentUsers: recentUsers.map((u: any) => ({
					_id: u._id,
					full_name: u.full_name,
					email: u.email,
					role: u.role,
					createdAt: u.createdAt,
				})),
			},
		});
	} catch (e) {
		next(e);
	}
});

// ── Activity Log ──
router.get("/activity", async (_req, res, next) => {
	try {
		// Combine recent events from multiple sources
		const [recentUsers, recentLessons, recentAssessments, recentAILogs] =
			await Promise.all([
				UserModel.find()
					.sort({ createdAt: -1 })
					.limit(5)
					.select("full_name email role createdAt")
					.lean(),
				LessonModel.find()
					.sort({ createdAt: -1 })
					.limit(5)
					.populate("student_id")
					.lean(),
				AssessmentModel.find()
					.sort({ createdAt: -1 })
					.limit(5)
					.populate("student_id")
					.lean(),
				AIGenerationLogModel.find()
					.sort({ createdAt: -1 })
					.limit(5)
					.populate("student_id")
					.lean(),
			]);

		const activities: any[] = [];

		for (const u of recentUsers) {
			activities.push({
				action:
					u.role === "student"
						? "Đăng ký mới"
						: u.role === "teacher"
							? "Giáo viên mới"
							: "Người dùng mới",
				user: (u as any).email,
				time: (u as any).createdAt,
				type: "👤",
			});
		}

		for (const l of recentLessons) {
			const student = (l as any).student_id;
			activities.push({
				action: `Bài học: ${(l as any).lesson_title}`,
				user: student?.full_name || student?.email || "Unknown",
				time: (l as any).createdAt,
				type: "📚",
			});
		}

		for (const a of recentAssessments) {
			const student = (a as any).student_id;
			activities.push({
				action: `Đánh giá: ${(a as any).title}`,
				user: student?.full_name || student?.email || "Unknown",
				time: (a as any).createdAt,
				type: "✅",
			});
		}

		for (const log of recentAILogs) {
			const student = (log as any).student_id;
			activities.push({
				action: `AI: ${(log as any).generation_type}`,
				user: student?.full_name || student?.email || "Unknown",
				time: (log as any).createdAt,
				type: "🤖",
			});
		}

		// Sort by time descending and take top 20
		activities.sort(
			(a, b) => new Date(b.time).getTime() - new Date(a.time).getTime(),
		);

		res.json({ success: true, data: activities.slice(0, 20) });
	} catch (e) {
		next(e);
	}
});

// ── User Management (all roles) ──
router.get("/users", async (req, res, next) => {
	try {
		const { role, status, search } = req.query;
		const filter: any = {};
		if (role && role !== "all") filter.role = role;
		if (status === "active") filter.is_active = true;
		if (status === "locked") filter.is_active = false;
		if (search) {
			filter.$or = [
				{ full_name: { $regex: search, $options: "i" } },
				{ email: { $regex: search, $options: "i" } },
			];
		}

		const users = await UserModel.find(filter)
			.sort({ createdAt: -1 })
			.select("-password_hash")
			.lean();

		res.json({ success: true, data: users });
	} catch (e) {
		next(e);
	}
});

// Toggle any user active/inactive
router.put("/users/:id/toggle", requireAdminOnly, async (req, res, next) => {
	try {
		const user = await UserModel.findById(req.params.id);
		if (!user) throw new NotFoundError("Không tìm thấy người dùng");

		// Don't allow deactivating yourself
		if (String(user._id) === userId(req)) {
			throw new ValidationError("Không thể khóa tài khoản của chính bạn");
		}

		const before = { is_active: user.is_active };
		// Soft toggle: only set is_active flag, preserve ALL related data
		// (engagement_session, attendance_record, parent_notification,
		//  notification_delivery, payment_transaction, subscription)
		const updated = await userRepository.update(req.params.id, {
			is_active: !user.is_active,
		} as any);
		const { password_hash: _, ...safe } = updated.toObject();
		await auditService.recordFromRequest(req, {
			action: "admin.user.toggle",
			resourceType: "user",
			resourceId: req.params.id,
			before,
			after: { is_active: updated.is_active },
			result: "success",
			metadata: { soft_delete: true, data_preserved: true },
		});
		res.json({ success: true, data: safe });
	} catch (e) {
		next(e);
	}
});

// ── Content Overview ──
router.get("/content", async (_req, res, next) => {
	try {
		const [curricula, lessons, assessments] = await Promise.all([
			CurriculumModel.find()
				.sort({ createdAt: -1 })
				.limit(50)
				.populate("student_id")
				.lean(),
			LessonModel.find().sort({ createdAt: -1 }).limit(50).lean(),
			AssessmentModel.find().sort({ createdAt: -1 }).limit(50).lean(),
		]);

		const content: any[] = [];

		for (const c of curricula) {
			content.push({
				_id: (c as any)._id,
				title: (c as any).title,
				type: "Giáo trình",
				status: (c as any).status || "active",
				createdAt: (c as any).createdAt,
			});
		}

		for (const l of lessons) {
			content.push({
				_id: (l as any)._id,
				title: (l as any).lesson_title,
				type: "Bài học",
				status: (l as any).status || "pending",
				createdAt: (l as any).createdAt,
			});
		}

		for (const a of assessments) {
			content.push({
				_id: (a as any)._id,
				title: (a as any).title,
				type: "Đánh giá",
				status: (a as any).status || "pending",
				createdAt: (a as any).createdAt,
			});
		}

		content.sort(
			(a, b) =>
				new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
		);

		res.json({ success: true, data: content.slice(0, 100) });
	} catch (e) {
		next(e);
	}
});

// ── Reports / Analytics ──
router.get("/reports", async (_req, res, next) => {
	try {
		// Active users today
		const startOfDay = new Date();
		startOfDay.setHours(0, 0, 0, 0);

		const [
			dau,
			totalUsers,
			totalLessons,
			completedLessons,
			avgStudyTime,
			totalSessions,
		] = await Promise.all([
			EngagementSessionModel.distinct("student_id", {
				started_at: { $gte: startOfDay },
			}).then((ids: any[]) => ids.length),
			UserModel.countDocuments(),
			LessonModel.countDocuments(),
			LessonModel.countDocuments({ status: "completed" }),
			StudentProgressModel.aggregate([
				{ $group: { _id: null, avg: { $avg: "$total_study_time_minutes" } } },
			]),
			EngagementSessionModel.countDocuments(),
		]);

		// MAU - active users this month
		const startOfMonth = new Date();
		startOfMonth.setDate(1);
		startOfMonth.setHours(0, 0, 0, 0);
		const mau = await EngagementSessionModel.distinct("student_id", {
			started_at: { $gte: startOfMonth },
		}).then((ids: any[]) => ids.length);

		const completionRate =
			totalLessons > 0
				? Math.round((completedLessons / totalLessons) * 100)
				: 0;
		const avgTime = avgStudyTime[0]?.avg ? Math.round(avgStudyTime[0].avg) : 0;

		res.json({
			success: true,
			data: {
				dau,
				mau,
				totalUsers,
				totalLessons,
				completedLessons,
				completionRate,
				avgStudyTimeMinutes: avgTime,
				totalSessions,
			},
		});
	} catch (e) {
		next(e);
	}
});

// ── AI Generation Logs ──
router.get(
	"/ai-governance/summary",
	requireStaffRestricted,
	async (_req, res, next) => {
		try {
			const summary = await aiGovernanceService.getSummary();
			res.json({ success: true, data: summary });
		} catch (e) {
			next(e);
		}
	},
);

router.get("/ai-logs", async (req, res, next) => {
	try {
		const { status, type, limit: limitStr } = req.query;
		const filter: any = {};
		if (status) filter.status = status;
		if (type) filter.generation_type = type;
		const limit = Math.min(Number(limitStr) || 50, 200);

		const logs = await AIGenerationLogModel.find(filter)
			.sort({ createdAt: -1 })
			.limit(limit)
			.populate("student_id")
			.lean();

		const data = logs.map((l: any) => ({
			_id: l._id,
			user: l.student_id?.full_name || l.student_id?.email || "Unknown",
			generation_type: l.generation_type,
			purpose: l.purpose ?? l.metadata?.purpose ?? null,
			subject_scope: l.subject_scope ?? l.metadata?.subjectScope ?? "math",
			prompt_template: l.prompt_template,
			prompt_version: l.prompt_version,
			ai_provider: l.ai_provider,
			ai_model: l.ai_model,
			confidence: l.confidence ?? null,
			safety_status: l.safety_status ?? null,
			requires_approval: l.requires_approval ?? false,
			approval_id: l.approval_id ?? null,
			approval_status: l.approval_status ?? "not_required",
			tokens_input: l.tokens_input,
			tokens_output: l.tokens_output,
			total_tokens: (l.tokens_input || 0) + (l.tokens_output || 0),
			response_time_ms: l.response_time_ms,
			status: l.status,
			error_message: l.error_message,
			createdAt: l.createdAt,
		}));

		// Summary stats
		const totalTokens = data.reduce(
			(sum: number, l: any) => sum + l.total_tokens,
			0,
		);
		const avgResponseTime =
			data.length > 0
				? Math.round(
						data.reduce(
							(sum: number, l: any) => sum + (l.response_time_ms || 0),
							0,
						) / data.length,
					)
				: 0;
		const errorCount = data.filter((l: any) => l.status !== "success").length;

		res.json({
			success: true,
			data: {
				logs: data,
				summary: {
					totalTokens,
					avgResponseTime,
					errorCount,
					total: data.length,
				},
			},
		});
	} catch (e) {
		next(e);
	}
});

// ── Class Management ──

// List all classes with teacher info and stats
router.get("/classes", async (req, res, next) => {
	try {
		const { teacher_id, status, search } = req.query;
		const filter: any = {};
		if (teacher_id) filter.teacher_id = teacher_id;
		if (status === "active") filter.is_active = true;
		if (status === "inactive") filter.is_active = false;

		let classes = await TeacherClassModel.find(filter)
			.populate("teacher_id", "full_name email is_active")
			.populate({
				path: "student_ids",
				populate: { path: "user_id", select: "full_name email" },
			})
			.sort({ createdAt: -1 })
			.lean();

		if (search) {
			const s = (search as string).toLowerCase();
			classes = classes.filter(
				(c: any) =>
					c.name.toLowerCase().includes(s) ||
					c.subject.toLowerCase().includes(s) ||
					c.teacher_id?.full_name?.toLowerCase().includes(s),
			);
		}

		// Enrich with assignment stats
		const data = await Promise.all(
			classes.map(async (c: any) => {
				const [totalAssignments, activeAssignments] = await Promise.all([
					teacherAssignmentRepository.model.countDocuments({ class_id: c._id }),
					teacherAssignmentRepository.model.countDocuments({
						class_id: c._id,
						status: "active",
					}),
				]);
				return {
					_id: c._id,
					name: c.name,
					subject: c.subject,
					grade_level: c.grade_level,
					schedule: c.schedule,
					description: c.description,
					is_active: c.is_active,
					createdAt: c.createdAt,
					teacher: c.teacher_id
						? {
								_id: c.teacher_id._id,
								full_name: c.teacher_id.full_name,
								email: c.teacher_id.email,
								is_active: c.teacher_id.is_active,
							}
						: null,
					student_count: c.student_ids?.length || 0,
					students: (c.student_ids || []).map((s: any) => ({
						_id: s._id,
						full_name: s.user_id?.full_name || "",
						email: s.user_id?.email || "",
					})),
					stats: {
						total_assignments: totalAssignments,
						active_assignments: activeAssignments,
					},
				};
			}),
		);

		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

// Get class detail
router.get("/classes/:id", async (req, res, next) => {
	try {
		const cls = await TeacherClassModel.findById(req.params.id)
			.populate("teacher_id", "full_name email is_active")
			.populate({
				path: "student_ids",
				populate: { path: "user_id", select: "full_name email is_active" },
			})
			.lean();
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const c: any = cls;
		const assignments = await teacherAssignmentRepository.model
			.find({ class_id: c._id })
			.sort({ createdAt: -1 })
			.lean();

		// Get submission stats per assignment
		const assignmentsWithStats = await Promise.all(
			assignments.map(async (a: any) => {
				const [submitted, graded] = await Promise.all([
					studentSubmissionRepository.model.countDocuments({
						assignment_id: a._id,
					}),
					studentSubmissionRepository.model.countDocuments({
						assignment_id: a._id,
						score: { $ne: null },
					}),
				]);
				return {
					_id: a._id,
					title: a.title,
					description: a.description,
					type: a.type,
					status: a.status,
					due_date: a.due_date,
					total_points: a.total_points,
					createdAt: a.createdAt,
					submissions: { submitted, graded },
				};
			}),
		);

		res.json({
			success: true,
			data: {
				_id: c._id,
				name: c.name,
				subject: c.subject,
				grade_level: c.grade_level,
				schedule: c.schedule,
				description: c.description,
				is_active: c.is_active,
				createdAt: c.createdAt,
				teacher: c.teacher_id
					? {
							_id: c.teacher_id._id,
							full_name: c.teacher_id.full_name,
							email: c.teacher_id.email,
						}
					: null,
				students: (c.student_ids || []).map((s: any) => ({
					_id: s._id,
					full_name: s.user_id?.full_name || "",
					email: s.user_id?.email || "",
					is_active: s.user_id?.is_active ?? true,
				})),
				assignments: assignmentsWithStats,
			},
		});
	} catch (e) {
		next(e);
	}
});

// Get enriched class detail (attendance + scores per student)
router.get("/classes/:id/full-detail", async (req, res, next) => {
	try {
		const cls = await TeacherClassModel.findById(req.params.id)
			.populate("teacher_id", "full_name email is_active")
			.populate({
				path: "student_ids",
				populate: { path: "user_id", select: "full_name email is_active" },
			})
			.lean();
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const c: any = cls;
		const studentProfileIds = (c.student_ids || []).map((s: any) => s._id);

		// Assignments with submissions
		const assignments = await teacherAssignmentRepository.model
			.find({ class_id: c._id })
			.sort({ createdAt: -1 })
			.lean();

		const assignmentIds = assignments.map((a: any) => a._id);

		// All submissions for this class's assignments
		const allSubmissions =
			assignmentIds.length > 0
				? await studentSubmissionRepository.model
						.find({ assignment_id: { $in: assignmentIds } })
						.lean()
				: [];

		// Attendance records for students in this class (last 90 days)
		const since = new Date();
		since.setDate(since.getDate() - 90);
		const sinceStr = since.toISOString().split("T")[0];
		const attendanceRecords =
			studentProfileIds.length > 0
				? await AttendanceRecordModel.find({
						student_id: { $in: studentProfileIds },
						scheduled_date: { $gte: sinceStr },
					}).lean()
				: [];

		// Build per-student data
		const students = (c.student_ids || []).map((s: any) => {
			const sid = String(s._id);

			// Submissions for this student
			const studentSubs = allSubmissions.filter(
				(sub: any) => String(sub.student_id) === sid,
			);
			const gradedSubs = studentSubs.filter((sub: any) => sub.score !== null);
			const avgScore =
				gradedSubs.length > 0
					? Math.round(
							(gradedSubs.reduce(
								(sum: number, sub: any) => sum + sub.score,
								0,
							) /
								gradedSubs.length) *
								10,
						) / 10
					: null;

			// Attendance for this student
			const studentAttendance = attendanceRecords.filter(
				(a: any) => String(a.student_id) === sid,
			);
			const presentCount = studentAttendance.filter(
				(a: any) => a.status === "present",
			).length;
			const absentCount = studentAttendance.filter(
				(a: any) => a.status === "absent",
			).length;
			const partialCount = studentAttendance.filter(
				(a: any) => a.status === "partial",
			).length;

			return {
				_id: s._id,
				full_name: s.user_id?.full_name || "",
				email: s.user_id?.email || "",
				is_active: s.user_id?.is_active ?? true,
				submissions: {
					total: studentSubs.length,
					graded: gradedSubs.length,
					avg_score: avgScore,
				},
				attendance: {
					total: studentAttendance.length,
					present: presentCount,
					absent: absentCount,
					partial: partialCount,
					rate:
						studentAttendance.length > 0
							? Math.round(
									((presentCount + partialCount) / studentAttendance.length) *
										100,
								)
							: null,
				},
			};
		});

		// Assignments with per-assignment stats
		const enrichedAssignments = assignments.map((a: any) => {
			const subs = allSubmissions.filter(
				(sub: any) => String(sub.assignment_id) === String(a._id),
			);
			const graded = subs.filter((sub: any) => sub.score !== null);
			const avgScore =
				graded.length > 0
					? Math.round(
							(graded.reduce((sum: number, sub: any) => sum + sub.score, 0) /
								graded.length) *
								10,
						) / 10
					: null;
			return {
				_id: a._id,
				title: a.title,
				description: a.description,
				type: a.type,
				status: a.status,
				due_date: a.due_date,
				total_points: a.total_points,
				createdAt: a.createdAt,
				submissions: {
					submitted: subs.length,
					graded: graded.length,
					avg_score: avgScore,
					details: subs.map((sub: any) => ({
						student_id: sub.student_id,
						score: sub.score,
						feedback: sub.feedback,
						submitted_at: sub.submitted_at,
						graded_at: sub.graded_at,
					})),
				},
			};
		});

		// Overall class stats
		const totalSubs = allSubmissions.length;
		const totalGraded = allSubmissions.filter(
			(s: any) => s.score !== null,
		).length;
		const classAvgScore =
			totalGraded > 0
				? Math.round(
						(allSubmissions
							.filter((s: any) => s.score !== null)
							.reduce((sum: number, s: any) => sum + s.score, 0) /
							totalGraded) *
							10,
					) / 10
				: null;
		const totalAttendance = attendanceRecords.length;
		const totalPresent = attendanceRecords.filter(
			(a: any) => a.status === "present" || a.status === "partial",
		).length;
		const attendanceRate =
			totalAttendance > 0
				? Math.round((totalPresent / totalAttendance) * 100)
				: null;

		res.json({
			success: true,
			data: {
				_id: c._id,
				name: c.name,
				subject: c.subject,
				grade_level: c.grade_level,
				schedule: c.schedule,
				description: c.description,
				is_active: c.is_active,
				createdAt: c.createdAt,
				teacher: c.teacher_id
					? {
							_id: c.teacher_id._id,
							full_name: c.teacher_id.full_name,
							email: c.teacher_id.email,
						}
					: null,
				students,
				assignments: enrichedAssignments,
				stats: {
					student_count: students.length,
					total_assignments: assignments.length,
					active_assignments: assignments.filter(
						(a: any) => a.status === "active",
					).length,
					total_submissions: totalSubs,
					graded_submissions: totalGraded,
					class_avg_score: classAvgScore,
					attendance_rate: attendanceRate,
				},
			},
		});
	} catch (e) {
		next(e);
	}
});

// Create class directly (admin bypass approval)
router.post("/classes", async (req, res, next) => {
	try {
		const { teacher_id, name, subject, grade_level, schedule, description } =
			req.body;
		if (!teacher_id || !name || !subject || !grade_level) {
			throw new ValidationError(
				"Giáo viên, tên lớp, môn học và khối là bắt buộc",
			);
		}
		const teacher = await UserModel.findOne({
			_id: teacher_id,
			role: "teacher",
		});
		if (!teacher) throw new NotFoundError("Không tìm thấy giáo viên");

		const cls = await teacherClassRepository.create({
			teacher_id,
			name,
			subject,
			grade_level: Number(grade_level),
			schedule: schedule || "",
			description: description || null,
			student_ids: [],
			is_active: true,
		} as any);

		await auditService.recordFromRequest(req, {
			action: "admin.class.create",
			resourceType: "teacher_class",
			resourceId: String(cls._id),
			before: null,
			after: { name, subject, grade_level, teacher_id },
			result: "success",
		});
		res.status(201).json({ success: true, data: cls });
	} catch (e) {
		next(e);
	}
});

// Update class
router.put("/classes/:id", async (req, res, next) => {
	try {
		const cls = await teacherClassRepository.findById(req.params.id);
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const before = cls.toObject ? cls.toObject() : cls;
		const { name, subject, grade_level, schedule, description, teacher_id } =
			req.body;
		const update: any = {};
		if (name) update.name = name;
		if (subject) update.subject = subject;
		if (grade_level) update.grade_level = Number(grade_level);
		if (schedule !== undefined) update.schedule = schedule;
		if (description !== undefined) update.description = description;
		if (teacher_id) {
			const teacher = await UserModel.findOne({
				_id: teacher_id,
				role: "teacher",
			});
			if (!teacher) throw new NotFoundError("Không tìm thấy giáo viên");
			update.teacher_id = teacher_id;
		}

		const updated = await teacherClassRepository.update(req.params.id, update);
		await auditService.recordFromRequest(req, {
			action: "admin.class.update",
			resourceType: "teacher_class",
			resourceId: req.params.id,
			before,
			after: updated,
			result: "success",
		});
		res.json({ success: true, data: updated });
	} catch (e) {
		next(e);
	}
});

// Toggle class active/inactive
router.put("/classes/:id/toggle", async (req, res, next) => {
	try {
		const cls = await teacherClassRepository.findById(req.params.id);
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const before = { is_active: cls.is_active };
		const updated = await teacherClassRepository.update(req.params.id, {
			is_active: !cls.is_active,
		} as any);
		await auditService.recordFromRequest(req, {
			action: "admin.class.toggle",
			resourceType: "teacher_class",
			resourceId: req.params.id,
			before,
			after: { is_active: !cls.is_active },
			result: "success",
		});
		res.json({ success: true, data: updated });
	} catch (e) {
		next(e);
	}
});

// Delete class (soft: deactivate)
router.delete("/classes/:id", async (req, res, next) => {
	try {
		const cls = await teacherClassRepository.findById(req.params.id);
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		await teacherClassRepository.update(req.params.id, {
			is_active: false,
		} as any);
		await auditService.recordFromRequest(req, {
			action: "admin.class.deactivate",
			resourceType: "teacher_class",
			resourceId: req.params.id,
			before: { is_active: cls.is_active },
			after: { is_active: false },
			result: "success",
			metadata: { soft_delete: true },
		});
		res.json({ success: true, message: "Đã vô hiệu hóa lớp học" });
	} catch (e) {
		next(e);
	}
});

// Add student to class (admin bypass)
router.post("/classes/:id/students", async (req, res, next) => {
	try {
		const cls = await teacherClassRepository.findById(req.params.id);
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const { student_id } = req.body;
		if (!student_id) throw new ValidationError("student_id là bắt buộc");

		const student = await StudentProfileModel.findById(student_id);
		if (!student) throw new NotFoundError("Không tìm thấy học sinh");

		// Check if already in class
		if (cls.student_ids.some((id: any) => String(id) === String(student_id))) {
			throw new ValidationError("Học sinh đã có trong lớp");
		}

		const before = cls.toObject ? cls.toObject() : cls;
		const updated = await teacherClassRepository.addStudent(
			req.params.id,
			student_id,
		);
		await auditService.record({
			actor: { id: userId(req), role: actorRole(req) },
			action: "class.student_add",
			resourceType: "teacher_class",
			resourceId: req.params.id,
			scopeType: "class",
			scopeId: req.params.id,
			before,
			after: updated,
			result: "success",
			metadata: {
				student_profile_id: String(student_id),
				bypass_approval: true,
			},
		});
		res.json({ success: true, message: "Đã thêm học sinh vào lớp" });
	} catch (e) {
		next(e);
	}
});

// Remove student from class
router.delete("/classes/:id/students/:studentId", async (req, res, next) => {
	try {
		const cls = await teacherClassRepository.findById(req.params.id);
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const before = cls.toObject ? cls.toObject() : cls;
		const updated = await teacherClassRepository.removeStudent(
			req.params.id,
			req.params.studentId,
		);
		await auditService.record({
			actor: { id: userId(req), role: actorRole(req) },
			action: "class.student_remove",
			resourceType: "teacher_class",
			resourceId: req.params.id,
			scopeType: "class",
			scopeId: req.params.id,
			before,
			after: updated,
			result: "success",
			metadata: {
				student_profile_id: String(req.params.studentId),
				bypass_approval: true,
			},
		});
		res.json({ success: true, message: "Đã xóa học sinh khỏi lớp" });
	} catch (e) {
		next(e);
	}
});

// Batch update attendance for a class
router.post("/classes/:id/attendance", async (req, res, next) => {
	try {
		const cls = await teacherClassRepository.findById(req.params.id);
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const { date, records } = req.body;
		// records: [{ student_id, status: 'present'|'absent'|'partial', status_reason? }]
		if (!date || !records || !Array.isArray(records)) {
			throw new ValidationError("date và records là bắt buộc");
		}

		const classStudentIds = cls.student_ids.map((id: any) => String(id));
		const results = await attendanceService.applyClassAttendanceUpdate({
			classId: req.params.id,
			studentIdsInClass: classStudentIds,
			date,
			records,
			actor: { id: userId(req), role: actorRole(req) },
		});

		await auditService.recordFromRequest(req, {
			action: "admin.attendance.update",
			resourceType: "teacher_class",
			resourceId: req.params.id,
			before: null,
			after: { date, record_count: records.length },
			result: "success",
			metadata: { class_id: req.params.id, date },
		});
		res.json({
			success: true,
			data: results,
			message: "Đã cập nhật điểm danh",
		});
	} catch (e) {
		next(e);
	}
});

// Get attendance for a class on a specific date
router.get("/classes/:id/attendance", async (req, res, next) => {
	try {
		const cls = await TeacherClassModel.findById(req.params.id)
			.populate({
				path: "student_ids",
				populate: { path: "user_id", select: "full_name email" },
			})
			.lean();
		if (!cls) throw new NotFoundError("Không tìm thấy lớp học");

		const { date } = req.query;
		if (!date) throw new ValidationError("date là bắt buộc");

		const c: any = cls;
		const studentIds = (c.student_ids || []).map((s: any) => s._id);

		const records = await AttendanceRecordModel.find({
			student_id: { $in: studentIds },
			scheduled_date: date,
		}).lean();

		const data = (c.student_ids || []).map((s: any) => {
			const record = records.find(
				(r: any) => String(r.student_id) === String(s._id),
			);
			return {
				student_id: s._id,
				full_name: s.user_id?.full_name || "",
				email: s.user_id?.email || "",
				status: record?.status || "unmarked",
				status_reason: record?.status_reason || null,
			};
		});

		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

// List all teachers (for dropdown in class form)
router.get("/teachers-list", async (_req, res, next) => {
	try {
		const teachers = await UserModel.find({ role: "teacher", is_active: true })
			.select("full_name email")
			.sort({ full_name: 1 })
			.lean();
		res.json({ success: true, data: teachers });
	} catch (e) {
		next(e);
	}
});

// List all students (for adding to class)
router.get("/students-list", async (_req, res, next) => {
	try {
		const students = await StudentProfileModel.find()
			.populate("user_id", "full_name email is_active")
			.lean();
		const data = students
			.filter((s: any) => s.user_id?.is_active)
			.map((s: any) => ({
				_id: s._id,
				full_name: s.user_id?.full_name || "",
				email: s.user_id?.email || "",
				grade_level: s.grade_level,
				school_name: s.school_name,
			}));
		res.json({ success: true, data });
	} catch (e) {
		next(e);
	}
});

// ── Scheduler Admin Routes ──

router.get("/scheduler/jobs", requireAdminOnly, async (_req, res, next) => {
	try {
		const { schedulerService } = await import(
			"../services/scheduler.service"
		);
		const jobs = await schedulerService.listJobs();
		res.json({ success: true, data: jobs });
	} catch (e) {
		next(e);
	}
});

router.post(
	"/scheduler/jobs/:name/run",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const { schedulerService } = await import(
				"../services/scheduler.service"
			);
			const jobName = req.params.name;
			const adminUserId = userId(req);

			const summary = await schedulerService.runNow(jobName, adminUserId);

			await auditService.recordFromRequest(req, {
				action: "scheduler.job.run_manual",
				resourceType: "scheduled_job",
				resourceId: jobName,
				before: null,
				after: { trigger: "manual", triggered_by: adminUserId, summary },
				result: summary.ok ? "success" : "failure",
				metadata: { job_name: jobName },
			});

			res.json({ success: true, data: summary });
		} catch (e) {
			next(e);
		}
	},
);

router.get(
	"/scheduler/jobs/:name/runs",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const { schedulerService } = await import(
				"../services/scheduler.service"
			);
			const jobName = req.params.name;
			const limit = Math.min(Number(req.query.limit) || 20, 100);

			const runs = await schedulerService.getRecentRuns(jobName, limit);
			res.json({ success: true, data: runs });
		} catch (e) {
			next(e);
		}
	},
);

// ── Audit Logs ──
router.get("/audit-logs", requireAdminOnly, async (req, res, next) => {
	try {
		const { AuditLogModel } = await import("../models/audit-log.model");

		const page = Math.max(Number(req.query.page) || 1, 1);
		const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
		const skip = (page - 1) * limit;

		// Build filter
		const filter: Record<string, unknown> = {};

		if (req.query.actor_id && typeof req.query.actor_id === "string") {
			if (mongoose.Types.ObjectId.isValid(req.query.actor_id)) {
				filter.actorUserId = new mongoose.Types.ObjectId(req.query.actor_id);
			}
		}

		if (req.query.action && typeof req.query.action === "string") {
			filter.action = { $regex: req.query.action, $options: "i" };
		}

		if (req.query.resource_type && typeof req.query.resource_type === "string") {
			filter.resourceType = { $regex: req.query.resource_type, $options: "i" };
		}

		if (req.query.result && typeof req.query.result === "string") {
			const validResults = ["success", "failure", "denied"];
			if (validResults.includes(req.query.result)) {
				filter.result = req.query.result;
			}
		}

		// Date range filter
		if (req.query.date_from || req.query.date_to) {
			const dateFilter: Record<string, Date> = {};
			if (req.query.date_from && typeof req.query.date_from === "string") {
				dateFilter.$gte = new Date(req.query.date_from);
			}
			if (req.query.date_to && typeof req.query.date_to === "string") {
				const toDate = new Date(req.query.date_to);
				toDate.setHours(23, 59, 59, 999);
				dateFilter.$lte = toDate;
			}
			if (Object.keys(dateFilter).length > 0) {
				filter.createdAt = dateFilter;
			}
		}

		const [total, logs] = await Promise.all([
			AuditLogModel.countDocuments(filter),
			AuditLogModel.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean(),
		]);

		res.json({
			success: true,
			data: {
				logs: logs.map((log: any) => ({
					_id: log._id,
					actorUserId: log.actorUserId,
					actorRole: log.actorRole,
					action: log.action,
					resourceType: log.resourceType,
					resourceId: log.resourceId,
					result: log.result,
					ipAddress: log.ipAddress,
					errorCode: log.errorCode,
					createdAt: log.createdAt,
				})),
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			},
		});
	} catch (e) {
		next(e);
	}
});

// ── Notification Templates Admin ──

router.get("/notifications/templates", requireAdminOnly, async (_req, res, next) => {
	try {
		const { NotificationTemplateModel } = await import(
			"../models/notification-template.model"
		);
		const templates = await NotificationTemplateModel.find()
			.sort({ template_id: 1 })
			.lean();

		res.json({
			success: true,
			data: templates.map((t: any) => ({
				_id: t._id,
				template_id: t.template_id,
				type: t.type,
				version: t.version,
				channels: t.channels,
				variables: t.variables,
				is_active: t.is_active,
				createdAt: t.createdAt,
				updatedAt: t.updatedAt,
			})),
		});
	} catch (e) {
		next(e);
	}
});

router.put(
	"/notifications/templates/:id/toggle-active",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const { NotificationTemplateModel } = await import(
				"../models/notification-template.model"
			);
			const templateId = req.params.id;

			if (!mongoose.Types.ObjectId.isValid(templateId)) {
				throw new ValidationError("Invalid template ID");
			}

			const template = await NotificationTemplateModel.findById(templateId);
			if (!template) {
				throw new NotFoundError("Template not found");
			}

			template.is_active = !template.is_active;
			await template.save();

			await auditService.recordFromRequest(req, {
				action: "admin.notification_template.toggle_active",
				resourceType: "notification_template",
				resourceId: template.template_id,
				result: "success",
				metadata: { is_active: template.is_active },
			});

			res.json({
				success: true,
				data: {
					_id: template._id,
					template_id: template.template_id,
					is_active: template.is_active,
				},
			});
		} catch (e) {
			next(e);
		}
	},
);

// ── Notification Deliveries Admin ──

router.get("/notifications/deliveries", requireAdminOnly, async (req, res, next) => {
	try {
		const { NotificationDeliveryModel } = await import(
			"../models/notification-delivery.model"
		);

		const page = Math.max(Number(req.query.page) || 1, 1);
		const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
		const skip = (page - 1) * limit;

		// Build filter
		const filter: Record<string, unknown> = {};

		if (req.query.type && typeof req.query.type === "string") {
			filter.type = { $regex: req.query.type, $options: "i" };
		}

		if (req.query.status && typeof req.query.status === "string") {
			const validStatuses = ["queued", "sent", "failed", "skipped"];
			if (validStatuses.includes(req.query.status)) {
				filter.status = req.query.status;
			}
		}

		if (req.query.recipient && typeof req.query.recipient === "string") {
			const recipientSearch = req.query.recipient;
			filter.$or = [
				{ "recipient.email": { $regex: recipientSearch, $options: "i" } },
				{ "recipient.phone": { $regex: recipientSearch, $options: "i" } },
			];
			// Also try matching user_id if it looks like an ObjectId
			if (mongoose.Types.ObjectId.isValid(recipientSearch)) {
				(filter.$or as any[]).push({
					"recipient.user_id": new mongoose.Types.ObjectId(recipientSearch),
				});
			}
		}

		const [total, deliveries] = await Promise.all([
			NotificationDeliveryModel.countDocuments(filter),
			NotificationDeliveryModel.find(filter)
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.lean(),
		]);

		res.json({
			success: true,
			data: {
				deliveries: deliveries.map((d: any) => ({
					_id: d._id,
					type: d.type,
					recipient: d.recipient,
					channels: d.channels,
					channel_results: d.channel_results,
					status: d.status,
					template_id: d.template_id,
					retry_count: d.retry_count,
					createdAt: d.createdAt,
				})),
				pagination: {
					page,
					limit,
					total,
					totalPages: Math.ceil(total / limit),
				},
			},
		});
	} catch (e) {
		next(e);
	}
});

router.post(
	"/notifications/deliveries/:id/retry",
	requireAdminOnly,
	async (req, res, next) => {
		try {
			const { notificationService } = await import(
				"../services/notification.service"
			);
			const deliveryId = req.params.id;

			if (!mongoose.Types.ObjectId.isValid(deliveryId)) {
				throw new ValidationError("Invalid delivery ID");
			}

			const result = await notificationService.retryFailed(deliveryId);

			if (!result) {
				throw new NotFoundError(
					"Delivery not found or max retries exceeded",
				);
			}

			await auditService.recordFromRequest(req, {
				action: "admin.notification_delivery.retry",
				resourceType: "notification_delivery",
				resourceId: deliveryId,
				result: "success",
			});

			res.json({ success: true, data: result });
		} catch (e) {
			next(e);
		}
	},
);

export default router;
