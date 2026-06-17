import mongoose, { type FilterQuery } from "mongoose";
import { config } from "../config";
import {
	type ApprovalRequestRepository,
	approvalRequestRepository,
} from "../models/approval.model";
import {
	ContentAssignmentRepository,
	type ContentAssignmentTemplateType,
	type IContentAssignment,
	StudentAssignedContentRepository,
} from "../models/content-assignment.model";
import {
	type ContentDifficultyLevel,
	type ContentTemplateStatus,
	CurriculumModuleTemplateRepository,
	type CurriculumTemplateDetail,
	CurriculumTemplateRepository,
	ExerciseTemplateRepository,
	type IExerciseTemplate,
	type ILessonTemplate,
	type LessonTemplateDetail,
	LessonTemplateRepository,
} from "../models/content-library.model";
import { StudentProfileRepository } from "../models/student.model";
import { TeacherClassRepository } from "../models/teacher.model";
import type { UserRole } from "../types";
import {
	ForbiddenError,
	NotFoundError,
	ValidationError,
} from "../utils/errors";
import { AI_PROVIDER_OPENAI, AI_SUBJECT_SCOPE_MATH } from "../constants/ai-governance";
import type {
	CreateContentAssignmentInput,
	GenerateCurriculumTemplateInput,
	GenerateLessonTemplateInput,
	ListContentAssignmentsQuery,
	ListCurriculumTemplatesQuery,
	ListLessonTemplatesQuery,
	UpdateContentAssignmentInput,
	UpdateLessonTemplateInput,
} from "../validators/content-library.validator";
import { aiService } from "./ai.service";

interface ActorContext {
	id: string;
	role: UserRole;
}

interface GeneratedExerciseTemplateDraft {
	topic?: string | null;
	difficulty_level?: ContentDifficultyLevel;
	question_text: string;
	answer_type: "multiple_choice" | "short_answer" | "essay";
	choices?: unknown;
	correct_answer: string;
	solution_steps?: unknown;
	explanation?: string | null;
	order_index?: number;
}

interface GeneratedLessonTemplateDraft {
	lesson_title: string;
	theory_content: string;
	lesson_objective?: string | null;
	topic?: string | null;
	difficulty_level?: ContentDifficultyLevel;
	estimated_minutes?: number | null;
	order_index?: number;
	exercises?: GeneratedExerciseTemplateDraft[];
}

interface GeneratedModuleTemplateDraft {
	module_title: string;
	module_description?: string | null;
	topic?: string | null;
	order_index?: number;
	estimated_sessions?: number | null;
	target_mastery?: number | null;
	lessons?: GeneratedLessonTemplateDraft[];
}

interface GeneratedCurriculumTemplateDraft {
	title: string;
	description?: string | null;
	difficulty_level?: ContentDifficultyLevel;
	target_goal?: string | null;
	estimated_total_sessions?: number | null;
	modules: GeneratedModuleTemplateDraft[];
}

const CONTENT_LIBRARY_AI_MODEL = config.openai.model || "gpt-4o-mini";
const DIFFICULTY_VALUES: ContentDifficultyLevel[] = ["easy", "medium", "hard"];
const ANSWER_TYPES = ["multiple_choice", "short_answer", "essay"] as const;

export class ContentLibraryService {
	private readonly curriculumTemplateRepo: CurriculumTemplateRepository;
	private readonly moduleTemplateRepo: CurriculumModuleTemplateRepository;
	private readonly lessonTemplateRepo: LessonTemplateRepository;
	private readonly exerciseTemplateRepo: ExerciseTemplateRepository;
	private readonly approvalRepo: ApprovalRequestRepository;
	private readonly contentAssignmentRepo: ContentAssignmentRepository;
	private readonly studentAssignedContentRepo: StudentAssignedContentRepository;
	private readonly classRepo: TeacherClassRepository;
	private readonly studentRepo: StudentProfileRepository;

	constructor() {
		this.curriculumTemplateRepo = new CurriculumTemplateRepository();
		this.moduleTemplateRepo = new CurriculumModuleTemplateRepository();
		this.lessonTemplateRepo = new LessonTemplateRepository();
		this.exerciseTemplateRepo = new ExerciseTemplateRepository();
		this.approvalRepo = approvalRequestRepository;
		this.contentAssignmentRepo = new ContentAssignmentRepository();
		this.studentAssignedContentRepo = new StudentAssignedContentRepository();
		this.classRepo = new TeacherClassRepository();
		this.studentRepo = new StudentProfileRepository();
	}

	public async generateCurriculumTemplate(
		actor: ActorContext,
		options: GenerateCurriculumTemplateInput,
	): Promise<CurriculumTemplateDetail> {
		const prompt = this.buildCurriculumTemplatePrompt(options);
		const startedAt = Date.now();
		let rawResponse = "";
		let tokensInput = 0;
		let tokensOutput = 0;

		try {
			const generation =
				await aiService.generateJSON<GeneratedCurriculumTemplateDraft>(
					"Bạn là chuyên gia thiết kế chương trình học Toán phổ thông Việt Nam. Hãy tạo nội dung mẫu dùng lại cho giáo viên, không gắn với học sinh cụ thể.",
					prompt,
					{ temperature: 0.35, model: CONTENT_LIBRARY_AI_MODEL },
				);

			tokensInput = generation.tokensUsed.input;
			tokensOutput = generation.tokensUsed.output;
			const draft = this.normalizeCurriculumTemplateDraft(
				generation.data,
				options,
			);
			rawResponse = JSON.stringify(draft);

			const created = await this.curriculumTemplateRepo.transaction(
				async (session) => {
					const curriculumTemplate = await this.curriculumTemplateRepo.create(
						{
							title: draft.title,
							description: draft.description ?? null,
							grade_level: options.grade_level,
							age_group:
								options.age_group ?? this.inferAgeGroup(options.grade_level),
							subject: options.subject ?? "math",
							difficulty_level:
								draft.difficulty_level ?? options.difficulty_level,
							target_goal: draft.target_goal ?? options.target_goal ?? null,
							estimated_total_sessions: draft.estimated_total_sessions,
							status: "draft",
							created_by: actor.id,
							created_by_role: actor.role,
							source: "ai",
							ai_prompt: prompt,
							ai_model: CONTENT_LIBRARY_AI_MODEL,
							tokens_input: tokensInput,
							tokens_output: tokensOutput,
						} as any,
						session,
					);

					for (const moduleDraft of draft.modules) {
						const moduleTemplate = await this.moduleTemplateRepo.create(
							{
								curriculum_template_id: curriculumTemplate.id,
								module_title: moduleDraft.module_title,
								module_description: moduleDraft.module_description ?? null,
								topic:
									moduleDraft.topic ??
									this.extractTopic(moduleDraft.module_title),
								order_index: moduleDraft.order_index,
								estimated_sessions:
									moduleDraft.estimated_sessions ??
									moduleDraft.lessons?.length ??
									null,
								target_mastery: moduleDraft.target_mastery ?? null,
							} as any,
							session,
						);

						for (const lessonDraft of moduleDraft.lessons ?? []) {
							const lessonTemplate = await this.lessonTemplateRepo.create(
								{
									curriculum_template_id: curriculumTemplate.id,
									module_template_id: moduleTemplate.id,
									lesson_title: lessonDraft.lesson_title,
									theory_content: lessonDraft.theory_content,
									lesson_objective: lessonDraft.lesson_objective ?? null,
									grade_level: options.grade_level,
									age_group:
										options.age_group ??
										this.inferAgeGroup(options.grade_level),
									topic: lessonDraft.topic ?? moduleTemplate.topic,
									difficulty_level:
										lessonDraft.difficulty_level ??
										draft.difficulty_level ??
										options.difficulty_level,
									estimated_minutes: lessonDraft.estimated_minutes ?? 45,
									order_index: lessonDraft.order_index ?? 1,
									status: "draft",
									created_by: actor.id,
									created_by_role: actor.role,
									source: "ai",
									ai_prompt: prompt,
									ai_model: CONTENT_LIBRARY_AI_MODEL,
									tokens_input: 0,
									tokens_output: 0,
								} as any,
								session,
							);

							await this.persistExerciseDrafts(
								lessonTemplate.id,
								lessonDraft.exercises ?? [],
								lessonTemplate.topic,
								session,
							);
						}
					}

					const detail =
						await this.curriculumTemplateRepo.findWithModulesAndLessons(
							curriculumTemplate.id,
							session,
						);
					if (!detail)
						throw new NotFoundError(
							"Không tìm thấy curriculum template vừa tạo",
						);
					return detail;
				},
			);

			await this.logGenerationSafe(
				actor.id,
				"content_library_curriculum_template_generate",
				prompt,
				rawResponse,
				tokensInput,
				tokensOutput,
				Date.now() - startedAt,
				"success",
				undefined,
				{
					purpose: "content_template_generation",
					promptTemplate: "content_library_curriculum_template_generate",
					promptVersion: "v1",
					requiresApproval: true,
					approvalStatus: "draft",
					actor: { id: actor.id, role: actor.role },
					studentContext: { grade_level: options.grade_level, age_group: options.age_group ?? null },
					explanation: "AI-generated curriculum template remains draft until admin approval/publish.",
				},
			);
			return created;
		} catch (error: unknown) {
			await this.logGenerationSafe(
				actor.id,
				"content_library_curriculum_template_generate",
				prompt,
				rawResponse,
				tokensInput,
				tokensOutput,
				Date.now() - startedAt,
				"error",
				error instanceof Error ? error.message : "Unknown error",
			);
			throw error;
		}
	}

	public async listCurriculumTemplates(
		query: ListCurriculumTemplatesQuery,
		actor: ActorContext,
	) {
		const filter: FilterQuery<any> = this.buildBaseListFilter(query, actor);
		const result = await this.curriculumTemplateRepo.findWithPagination(
			filter,
			query.page,
			query.limit,
			"createdAt",
			"desc",
		);
		return result;
	}

	public async getCurriculumTemplateDetail(
		id: string,
		actor: ActorContext,
	): Promise<CurriculumTemplateDetail> {
		const detail =
			await this.curriculumTemplateRepo.findWithModulesAndLessons(id);
		if (!detail) throw new NotFoundError("Không tìm thấy curriculum template");
		this.assertCanReadTemplate(detail.status, String(detail.created_by), actor);
		return detail;
	}

	public async publishCurriculumTemplate(
		id: string,
		actor: ActorContext,
	): Promise<CurriculumTemplateDetail> {
		const existing = await this.curriculumTemplateRepo.findById(id);
		if (!existing)
			throw new NotFoundError("Không tìm thấy curriculum template");
		this.assertCanPublish(actor);

		await this.curriculumTemplateRepo.update(id, {
			status: "published",
			published_at: new Date(),
		} as any);
		const detail =
			await this.curriculumTemplateRepo.findWithModulesAndLessons(id);
		if (!detail)
			throw new NotFoundError(
				"Không tìm thấy curriculum template sau khi publish",
			);
		return detail;
	}

	public async requestPublishCurriculumTemplate(
		id: string,
		actor: ActorContext,
	) {
		const existing = await this.curriculumTemplateRepo.findById(id);
		if (!existing)
			throw new NotFoundError("Không tìm thấy curriculum template");
		this.assertCanRequestPublish(String(existing.created_by), actor);
		if (existing.status === "published")
			throw new ValidationError("Curriculum template đã published");
		await this.assertNoPendingPublishRequest("publish_curriculum_template", id);

		const proposal = await this.approvalRepo.create({
			type: "publish_curriculum_template",
			requester_id: new mongoose.Types.ObjectId(actor.id) as any,
			status: "pending",
			content_kind: "lesson",
			subject_scope: AI_SUBJECT_SCOPE_MATH,
			prompt_template: existing.ai_prompt ? "content_library_curriculum_template_generate" : null,
			prompt_version: existing.source === "ai" ? "v1" : null,
			ai_model: existing.ai_model ?? null,
			ai_provider: existing.source === "ai" ? AI_PROVIDER_OPENAI : null,
			content_status: "pending",
			data: {
				template_id: id,
				title: existing.title,
				grade_level: existing.grade_level,
				difficulty_level: existing.difficulty_level,
				subject_scope: AI_SUBJECT_SCOPE_MATH,
				content_status: "pending",
			},
		} as any);
		return proposal.toObject ? proposal.toObject() : proposal;
	}

	public async generateLessonTemplate(
		actor: ActorContext,
		options: GenerateLessonTemplateInput,
	): Promise<LessonTemplateDetail> {
		if (options.curriculum_template_id) {
			const curriculumTemplate = await this.curriculumTemplateRepo.findById(
				options.curriculum_template_id,
			);
			if (!curriculumTemplate)
				throw new ValidationError("curriculum_template_id không tồn tại");
			this.assertCanReadTemplate(
				curriculumTemplate.status,
				String(curriculumTemplate.created_by),
				actor,
			);
		}

		if (options.module_template_id) {
			const moduleTemplate = await this.moduleTemplateRepo.findById(
				options.module_template_id,
			);
			if (!moduleTemplate)
				throw new ValidationError("module_template_id không tồn tại");
		}

		const prompt = this.buildLessonTemplatePrompt(options);
		const startedAt = Date.now();
		let rawResponse = "";
		let tokensInput = 0;
		let tokensOutput = 0;

		try {
			const generation =
				await aiService.generateJSON<GeneratedLessonTemplateDraft>(
					"Bạn là giáo viên Toán giàu kinh nghiệm tại Việt Nam. Hãy tạo lesson template dùng lại, không gắn dữ liệu học sinh cụ thể.",
					prompt,
					{ temperature: 0.35, model: CONTENT_LIBRARY_AI_MODEL },
				);

			tokensInput = generation.tokensUsed.input;
			tokensOutput = generation.tokensUsed.output;
			const draft = this.normalizeLessonTemplateDraft(generation.data, options);
			rawResponse = JSON.stringify(draft);

			const created = await this.lessonTemplateRepo.transaction(
				async (session) => {
					const lessonTemplate = await this.lessonTemplateRepo.create(
						{
							curriculum_template_id: options.curriculum_template_id ?? null,
							module_template_id: options.module_template_id ?? null,
							lesson_title: draft.lesson_title,
							theory_content: draft.theory_content,
							lesson_objective: draft.lesson_objective ?? null,
							grade_level: options.grade_level,
							age_group:
								options.age_group ?? this.inferAgeGroup(options.grade_level),
							topic: draft.topic ?? options.topic,
							difficulty_level:
								draft.difficulty_level ?? options.difficulty_level,
							estimated_minutes:
								draft.estimated_minutes ?? options.estimated_minutes,
							order_index: draft.order_index ?? 1,
							status: "draft",
							created_by: actor.id,
							created_by_role: actor.role,
							source: "ai",
							ai_prompt: prompt,
							ai_model: CONTENT_LIBRARY_AI_MODEL,
							tokens_input: tokensInput,
							tokens_output: tokensOutput,
						} as any,
						session,
					);

					await this.persistExerciseDrafts(
						lessonTemplate.id,
						draft.exercises ?? [],
						lessonTemplate.topic,
						session,
					);
					const detail = await this.lessonTemplateRepo.findWithExercises(
						lessonTemplate.id,
						session,
					);
					if (!detail)
						throw new NotFoundError("Không tìm thấy lesson template vừa tạo");
					return detail;
				},
			);

			await this.logGenerationSafe(
				actor.id,
				"content_library_lesson_template_generate",
				prompt,
				rawResponse,
				tokensInput,
				tokensOutput,
				Date.now() - startedAt,
				"success",
				undefined,
				{
					purpose: "lesson_generation",
					promptTemplate: "content_library_lesson_template_generate",
					promptVersion: "v1",
					requiresApproval: true,
					approvalStatus: "draft",
					actor: { id: actor.id, role: actor.role },
					studentContext: { grade_level: options.grade_level, age_group: options.age_group ?? null },
					explanation: "AI-generated lesson template remains draft until admin approval/publish.",
				},
			);
			return created;
		} catch (error: unknown) {
			await this.logGenerationSafe(
				actor.id,
				"content_library_lesson_template_generate",
				prompt,
				rawResponse,
				tokensInput,
				tokensOutput,
				Date.now() - startedAt,
				"error",
				error instanceof Error ? error.message : "Unknown error",
			);
			throw error;
		}
	}

	public async listLessonTemplates(
		query: ListLessonTemplatesQuery,
		actor: ActorContext,
	) {
		const filter: FilterQuery<any> = this.buildBaseListFilter(query, actor);
		if (query.topic)
			filter.topic = new RegExp(this.escapeRegex(query.topic), "i");
		if (query.curriculum_template_id)
			filter.curriculum_template_id = query.curriculum_template_id;
		if (query.module_template_id)
			filter.module_template_id = query.module_template_id;

		return this.lessonTemplateRepo.findWithPagination(
			filter,
			query.page,
			query.limit,
			"createdAt",
			"desc",
		);
	}

	public async getLessonTemplateDetail(
		id: string,
		actor: ActorContext,
	): Promise<LessonTemplateDetail> {
		const detail = await this.lessonTemplateRepo.findWithExercises(id);
		if (!detail) throw new NotFoundError("Không tìm thấy lesson template");
		this.assertCanReadTemplate(detail.status, String(detail.created_by), actor);
		return detail;
	}

	public async updateLessonTemplate(
		id: string,
		actor: ActorContext,
		input: UpdateLessonTemplateInput,
	): Promise<LessonTemplateDetail> {
		const existing = await this.lessonTemplateRepo.findById(id);
		if (!existing) throw new NotFoundError("Khong tim thay lesson template");
		this.assertCanUpdateTemplate(String(existing.created_by), actor);
		if (existing.status === "published")
			throw new ValidationError("Published templates cannot be edited");

		const updates: Partial<ILessonTemplate> = {};
		if (input.lesson_title !== undefined)
			updates.lesson_title = input.lesson_title;
		if (input.lesson_objective !== undefined)
			updates.lesson_objective = input.lesson_objective;
		if (input.theory_content !== undefined)
			updates.theory_content = input.theory_content;
		if (input.topic !== undefined) updates.topic = input.topic;
		if (input.difficulty_level !== undefined)
			updates.difficulty_level = input.difficulty_level;
		if (input.estimated_minutes !== undefined)
			updates.estimated_minutes = input.estimated_minutes;
		if (input.age_group !== undefined) updates.age_group = input.age_group;

		if (Object.keys(updates).length > 0) {
			await this.lessonTemplateRepo.update(id, updates);
		}

		return this.getLessonTemplateDetail(id, actor);
	}

	public async publishLessonTemplate(
		id: string,
		actor: ActorContext,
	): Promise<LessonTemplateDetail> {
		const existing = await this.lessonTemplateRepo.findById(id);
		if (!existing) throw new NotFoundError("Không tìm thấy lesson template");
		this.assertCanPublish(actor);

		await this.lessonTemplateRepo.update(id, {
			status: "published",
			published_at: new Date(),
		} as any);
		const detail = await this.lessonTemplateRepo.findWithExercises(id);
		if (!detail)
			throw new NotFoundError("Không tìm thấy lesson template sau khi publish");
		return detail;
	}

	public async requestPublishLessonTemplate(id: string, actor: ActorContext) {
		const existing = await this.lessonTemplateRepo.findById(id);
		if (!existing) throw new NotFoundError("Không tìm thấy lesson template");
		this.assertCanRequestPublish(String(existing.created_by), actor);
		if (existing.status === "published")
			throw new ValidationError("Lesson template đã published");
		await this.assertNoPendingPublishRequest("publish_lesson_template", id);

		const proposal = await this.approvalRepo.create({
			type: "publish_lesson_template",
			requester_id: new mongoose.Types.ObjectId(actor.id) as any,
			status: "pending",
			content_kind: "lesson",
			subject_scope: AI_SUBJECT_SCOPE_MATH,
			prompt_template: existing.ai_prompt ? "content_library_lesson_template_generate" : null,
			prompt_version: existing.source === "ai" ? "v1" : null,
			ai_model: existing.ai_model ?? null,
			ai_provider: existing.source === "ai" ? AI_PROVIDER_OPENAI : null,
			content_status: "pending",
			data: {
				template_id: id,
				title: existing.lesson_title,
				grade_level: existing.grade_level,
				difficulty_level: existing.difficulty_level,
				topic: existing.topic,
				subject_scope: AI_SUBJECT_SCOPE_MATH,
				content_status: "pending",
			},
		} as any);
		return proposal.toObject ? proposal.toObject() : proposal;
	}

	public async createAssignment(
		actor: ActorContext,
		input: CreateContentAssignmentInput,
	): Promise<any> {
		const template = await this.getPublishedTemplateForAssignment(
			input.template_type,
			input.template_id,
			actor,
		);
		const studentIds = await this.resolveAssignmentRecipients(
			input.target_type,
			input.target_id,
			actor,
		);
		const classId = input.target_type === "class" ? input.target_id : null;

		const created = await this.contentAssignmentRepo.transaction(
			async (session) => {
				const assignment = await this.contentAssignmentRepo.create(
					{
						template_type: input.template_type,
						template_id: new mongoose.Types.ObjectId(input.template_id) as any,
						target_type: input.target_type,
						target_id: new mongoose.Types.ObjectId(input.target_id) as any,
						assigned_by: new mongoose.Types.ObjectId(actor.id) as any,
						assigned_by_role: actor.role,
						status: "active",
						auto_apply_new_students:
							input.target_type === "class"
								? (input.auto_apply_new_students ?? true)
								: false,
						materialization_strategy: "on_demand",
						template_snapshot: this.buildTemplateSnapshot(
							input.template_type,
							template,
						),
						recipient_mapping: {
							class_id: classId ? new mongoose.Types.ObjectId(classId) : null,
							student_ids: studentIds.map(
								(id) => new mongoose.Types.ObjectId(id),
							),
							applied_student_ids: studentIds.map(
								(id) => new mongoose.Types.ObjectId(id),
							),
						},
					} as any,
					session,
				);

				for (const studentId of studentIds) {
					await this.upsertStudentAssignedContent(
						assignment,
						studentId,
						classId,
						session,
					);
				}

				return assignment;
			},
		);

		return this.getAssignmentDetail(created.id, actor);
	}

	public async listAssignments(
		actor: ActorContext,
		query: ListContentAssignmentsQuery,
	) {
		const filter: FilterQuery<IContentAssignment> = {};
		if (actor.role === "teacher") filter.assigned_by = actor.id as any;
		if (query.status) filter.status = query.status;
		if (query.template_type) filter.template_type = query.template_type;
		if (query.target_type) filter.target_type = query.target_type;
		if (query.target_id) filter.target_id = query.target_id as any;

		return this.contentAssignmentRepo.findWithPagination(
			filter,
			query.page,
			query.limit,
			"createdAt",
			"desc",
		);
	}

	public async getAssignmentDetail(
		id: string,
		actor: ActorContext,
	): Promise<any> {
		const assignment = await this.contentAssignmentRepo.model
			.findById(id)
			.populate("assigned_by", "full_name email role")
			.populate("recipient_mapping.class_id", "name grade_level subject")
			.populate({
				path: "recipient_mapping.student_ids",
				populate: { path: "user_id", select: "full_name email" },
			})
			.exec();
		if (!assignment)
			throw new NotFoundError("Không tìm thấy content assignment");
		this.assertCanAccessAssignment(assignment, actor);

		const student_contents = await this.studentAssignedContentRepo.model
			.find({ assignment_id: assignment._id })
			.populate({
				path: "student_id",
				populate: { path: "user_id", select: "full_name email" },
			})
			.sort({ createdAt: -1 })
			.exec();

		return {
			...(assignment.toObject ? assignment.toObject() : assignment),
			student_contents,
		};
	}

	public async updateAssignment(
		id: string,
		actor: ActorContext,
		input: UpdateContentAssignmentInput,
	): Promise<any> {
		const assignment = await this.ensureAssignmentMutable(id, actor);
		if (input.auto_apply_new_students !== undefined) {
			await this.contentAssignmentRepo.update(assignment.id, {
				auto_apply_new_students: input.auto_apply_new_students,
			} as any);
		}
		return this.getAssignmentDetail(id, actor);
	}

	public async pauseAssignment(id: string, actor: ActorContext) {
		const assignment = await this.ensureAssignmentMutable(id, actor);
		const updated = await this.contentAssignmentRepo.update(assignment.id, {
			status: "paused",
		} as any);
		await this.studentAssignedContentRepo.model
			.updateMany(
				{ assignment_id: assignment._id },
				{ $set: { status: "paused" } },
			)
			.exec();
		return updated.toObject ? updated.toObject() : updated;
	}

	public async activateAssignment(id: string, actor: ActorContext) {
		const assignment = await this.ensureAssignmentMutable(id, actor);
		if (assignment.status === "archived")
			throw new ValidationError("Archived assignments cannot be reactivated");
		const updated = await this.contentAssignmentRepo.update(assignment.id, {
			status: "active",
		} as any);
		await this.studentAssignedContentRepo.model
			.updateMany(
				{ assignment_id: assignment._id, status: "paused" },
				{ $set: { status: "active" } },
			)
			.exec();
		return updated.toObject ? updated.toObject() : updated;
	}

	public async archiveAssignment(id: string, actor: ActorContext) {
		const assignment = await this.ensureAssignmentMutable(id, actor);
		const updated = await this.contentAssignmentRepo.update(assignment.id, {
			status: "archived",
		} as any);
		await this.studentAssignedContentRepo.model
			.updateMany(
				{ assignment_id: assignment._id },
				{ $set: { status: "archived" } },
			)
			.exec();
		return updated.toObject ? updated.toObject() : updated;
	}

	public async syncClassAssignmentsToStudent(
		classId: string,
		studentId: string,
	): Promise<void> {
		const cls = await this.classRepo.findById(classId);
		if (!cls || !cls.student_ids.some((id: any) => id.toString() === studentId))
			return;

		const assignments =
			await this.contentAssignmentRepo.findActiveClassAutoApply(classId);
		for (const assignment of assignments) {
			await this.upsertStudentAssignedContent(assignment, studentId, classId);
			await this.contentAssignmentRepo.model
				.updateOne(
					{ _id: assignment._id },
					{
						$addToSet: {
							"recipient_mapping.student_ids": new mongoose.Types.ObjectId(
								studentId,
							),
							"recipient_mapping.applied_student_ids":
								new mongoose.Types.ObjectId(studentId),
						},
					},
				)
				.exec();
		}
	}

	private buildCurriculumTemplatePrompt(
		options: GenerateCurriculumTemplateInput,
	): string {
		const ageGroup =
			options.age_group ?? this.inferAgeGroup(options.grade_level);
		return [
			`Tạo curriculum template môn ${options.subject ?? "Toán"} cho học sinh lớp ${options.grade_level} (${ageGroup}).`,
			`Độ khó: ${this.renderDifficulty(options.difficulty_level)}.`,
			options.title ? `Tiêu đề mong muốn: ${options.title}.` : undefined,
			options.target_goal ? `Mục tiêu: ${options.target_goal}.` : undefined,
			options.topics?.length
				? `Chủ đề ưu tiên: ${options.topics.join(", ")}.`
				: undefined,
			options.teaching_style
				? `Phong cách dạy: ${options.teaching_style}.`
				: "Phong cách dạy thân thiện, rõ ràng, phù hợp lứa tuổi.",
			`Cấu trúc bắt buộc: ${options.total_modules} modules, mỗi module ${options.lessons_per_module} lessons, mỗi lesson ${options.exercises_per_lesson} exercises.`,
			"Chuẩn ký hiệu toán: dùng LaTeX trong nội dung hiển thị, ví dụ \\(x^2\\), \\(\\frac{3}{4}\\), \\(\\sqrt{x}\\); tránh dạng thô x^2, 3/4, sqrt(x).",
			"Nội dung phải đúng cấp lớp/chương trình Toán Việt Nam. Nếu ôn kiến thức lớp dưới, ghi rõ là phần ôn nền tảng và không để lấn át mục tiêu chính của lớp hiện tại.",
			"Mỗi module cần thể hiện lộ trình rõ: mục tiêu, thứ tự bài học, số buổi ước tính, tiêu chí hoàn thành và mức độ tăng dần.",
			"Mỗi lesson cần có theory_content đủ dùng để tự học: mục tiêu, mở bài gợi hứng thú, kiến thức trọng tâm, ví dụ mẫu từng bước, lỗi sai thường gặp, luyện tập và tóm tắt.",
			"estimated_minutes/estimated_sessions phải hợp lý với độ khó và số lượng hoạt động, không để trống hoặc ước lượng quá thấp.",
			"Trả về JSON với shape: { title, description, difficulty_level, target_goal, estimated_total_sessions, modules: [{ module_title, module_description, topic, order_index, estimated_sessions, target_mastery, lessons: [{ lesson_title, theory_content, lesson_objective, topic, difficulty_level, estimated_minutes, order_index, exercises: [{ topic, difficulty_level, question_text, answer_type, choices, correct_answer, solution_steps, explanation, order_index }] }] }] }.",
			"Nội dung tiếng Việt, ví dụ gần gũi với học sinh Việt Nam, không chứa dữ liệu học sinh cụ thể.",
		]
			.filter(Boolean)
			.join("\n");
	}

	private buildLessonTemplatePrompt(
		options: GenerateLessonTemplateInput,
	): string {
		const ageGroup =
			options.age_group ?? this.inferAgeGroup(options.grade_level);
		return [
			`Tạo lesson template môn Toán cho học sinh lớp ${options.grade_level} (${ageGroup}).`,
			`Chủ đề: ${options.topic}. Độ khó: ${this.renderDifficulty(options.difficulty_level)}.`,
			options.lesson_title
				? `Tiêu đề mong muốn: ${options.lesson_title}.`
				: undefined,
			`Thời lượng khoảng ${options.estimated_minutes} phút.`,
			options.learning_objectives?.length
				? `Mục tiêu học tập: ${options.learning_objectives.join("; ")}.`
				: undefined,
			options.teaching_style
				? `Phong cách dạy: ${options.teaching_style}.`
				: "Phong cách dạy từng bước, khuyến khích tư duy, phù hợp lứa tuổi.",
			`Tạo ${options.exercises_count} bài tập luyện tập.`,
			"Chuẩn ký hiệu toán: dùng LaTeX trong nội dung hiển thị, ví dụ \\(x^2\\), \\(\\frac{3}{4}\\), \\(\\sqrt{x}\\); tránh dạng thô x^2, 3/4, sqrt(x).",
			"Bài học phải đúng cấp lớp/chương trình Toán Việt Nam. Với lớp cao, không dùng nội dung lớp 5-7 làm trọng tâm trừ khi ghi rõ là ôn nền tảng.",
			"theory_content phải có cấu trúc rõ: mục tiêu, mở bài gợi hứng thú, kiến thức trọng tâm, ví dụ mẫu từng bước, lỗi sai thường gặp, luyện tập và tóm tắt cuối bài.",
			"estimated_minutes phải hợp lý với độ khó và số hoạt động; bài cơ bản thường 30-45 phút, bài nâng cao 45-60 phút.",
			"Trả về JSON với shape: { lesson_title, theory_content, lesson_objective, topic, difficulty_level, estimated_minutes, order_index, exercises: [{ topic, difficulty_level, question_text, answer_type, choices, correct_answer, solution_steps, explanation, order_index }] }.",
			"Nội dung tiếng Việt, không chứa dữ liệu học sinh cụ thể.",
		]
			.filter(Boolean)
			.join("\n");
	}

	private normalizeCurriculumTemplateDraft(
		input: GeneratedCurriculumTemplateDraft,
		options: GenerateCurriculumTemplateInput,
	): GeneratedCurriculumTemplateDraft {
		if (!input || typeof input !== "object" || !Array.isArray(input.modules)) {
			throw new ValidationError("AI output curriculum template sai schema", {
				expected: "modules array",
			});
		}

		const modules = input.modules
			.slice(0, options.total_modules)
			.map((module, moduleIndex) => {
				if (!module?.module_title || typeof module.module_title !== "string") {
					throw new ValidationError("AI output module template sai schema", {
						moduleIndex,
					});
				}

				const lessons = (module.lessons ?? [])
					.slice(0, options.lessons_per_module)
					.map((lesson, lessonIndex) =>
						this.normalizeLessonTemplateDraft(lesson, {
							grade_level: options.grade_level,
							age_group: options.age_group,
							topic: lesson.topic ?? module.topic ?? module.module_title,
							difficulty_level: this.normalizeDifficulty(
								lesson.difficulty_level ?? input.difficulty_level,
								options.difficulty_level,
							),
							estimated_minutes: lesson.estimated_minutes ?? 45,
							exercises_count: options.exercises_per_lesson,
						}),
					);

				return {
					...module,
					module_title: module.module_title.trim(),
					module_description: this.nullableTrim(module.module_description),
					topic:
						this.nullableTrim(module.topic) ??
						this.extractTopic(module.module_title),
					order_index: this.normalizePositiveInt(
						module.order_index,
						moduleIndex + 1,
					),
					estimated_sessions: this.normalizePositiveInt(
						module.estimated_sessions,
						lessons.length,
					),
					target_mastery:
						typeof module.target_mastery === "number"
							? Math.min(100, Math.max(0, module.target_mastery))
							: null,
					lessons,
				};
			});

		if (modules.length === 0) {
			throw new ValidationError(
				"AI output curriculum template không có module hợp lệ",
			);
		}

		return {
			title: this.requiredString(
				input.title,
				options.title ?? `Giáo trình Toán lớp ${options.grade_level}`,
			),
			description: this.nullableTrim(input.description),
			difficulty_level: this.normalizeDifficulty(
				input.difficulty_level,
				options.difficulty_level,
			),
			target_goal:
				this.nullableTrim(input.target_goal) ?? options.target_goal ?? null,
			estimated_total_sessions: this.normalizePositiveInt(
				input.estimated_total_sessions,
				modules.reduce((sum, module) => sum + (module.lessons?.length ?? 0), 0),
			),
			modules,
		};
	}

	private normalizeLessonTemplateDraft(
		input: GeneratedLessonTemplateDraft,
		options: Pick<
			GenerateLessonTemplateInput,
			| "grade_level"
			| "age_group"
			| "topic"
			| "difficulty_level"
			| "estimated_minutes"
			| "exercises_count"
			| "lesson_title"
		>,
	): GeneratedLessonTemplateDraft {
		if (!input || typeof input !== "object") {
			throw new ValidationError("AI output lesson template sai schema");
		}

		const lessonTitle = this.requiredString(
			input.lesson_title,
			options.lesson_title ?? `Bài học: ${options.topic}`,
		);
		const theoryContent = this.requiredString(
			input.theory_content,
			`Nội dung lý thuyết về ${options.topic}`,
		);
		const exercises = (input.exercises ?? [])
			.slice(0, options.exercises_count)
			.map((exercise, index) =>
				this.normalizeExerciseDraft(
					exercise,
					options.topic,
					options.difficulty_level,
					index,
				),
			);

		if (options.exercises_count > 0 && exercises.length === 0) {
			throw new ValidationError(
				"AI output lesson template không có bài tập hợp lệ",
			);
		}

		return {
			lesson_title: lessonTitle,
			theory_content: theoryContent,
			lesson_objective: this.nullableTrim(input.lesson_objective),
			topic: this.nullableTrim(input.topic) ?? options.topic,
			difficulty_level: this.normalizeDifficulty(
				input.difficulty_level,
				options.difficulty_level,
			),
			estimated_minutes: this.normalizePositiveInt(
				input.estimated_minutes,
				options.estimated_minutes,
			),
			order_index: this.normalizePositiveInt(input.order_index, 1),
			exercises,
		};
	}

	private normalizeExerciseDraft(
		input: GeneratedExerciseTemplateDraft,
		fallbackTopic: string,
		fallbackDifficulty: ContentDifficultyLevel,
		index: number,
	): GeneratedExerciseTemplateDraft {
		if (!input || typeof input !== "object") {
			throw new ValidationError("AI output exercise template sai schema", {
				exerciseIndex: index,
			});
		}

		const answerType = ANSWER_TYPES.includes(input.answer_type as any)
			? input.answer_type
			: "short_answer";
		const choices =
			answerType === "multiple_choice" ? (input.choices ?? []) : null;

		return {
			topic: this.nullableTrim(input.topic) ?? fallbackTopic,
			difficulty_level: this.normalizeDifficulty(
				input.difficulty_level,
				fallbackDifficulty,
			),
			question_text: this.requiredString(input.question_text, ""),
			answer_type: answerType,
			choices,
			correct_answer: this.requiredString(input.correct_answer, ""),
			solution_steps: input.solution_steps ?? null,
			explanation: this.nullableTrim(input.explanation),
			order_index: this.normalizePositiveInt(input.order_index, index + 1),
		};
	}

	private async persistExerciseDrafts(
		lessonTemplateId: string,
		exercises: GeneratedExerciseTemplateDraft[],
		fallbackTopic: string | null,
		session: mongoose.ClientSession,
	): Promise<IExerciseTemplate[]> {
		const created: IExerciseTemplate[] = [];
		for (const [index, exercise] of exercises.entries()) {
			const createdExercise = await this.exerciseTemplateRepo.create(
				{
					lesson_template_id: lessonTemplateId,
					topic: exercise.topic ?? fallbackTopic,
					difficulty_level: exercise.difficulty_level ?? "medium",
					question_text: exercise.question_text,
					answer_type: exercise.answer_type,
					choices: exercise.choices ?? null,
					correct_answer: exercise.correct_answer,
					solution_steps: exercise.solution_steps ?? null,
					explanation: exercise.explanation ?? null,
					order_index: exercise.order_index ?? index + 1,
				} as any,
				session,
			);
			created.push(createdExercise);
		}
		return created;
	}

	private buildBaseListFilter(
		query: ListCurriculumTemplatesQuery | ListLessonTemplatesQuery,
		actor: ActorContext,
	): FilterQuery<any> {
		const filter: FilterQuery<any> = {};
		if (query.status) {
			filter.status = query.status;
			// Teacher non-published status filters must stay scoped to owned templates.
			if (actor.role === "teacher" && query.status !== "published") {
				filter.created_by = actor.id;
			}
		} else if (actor.role === "teacher" && !query.own) {
			filter.$or = [{ status: "published" }, { created_by: actor.id }];
		}

		if (query.own) filter.created_by = actor.id;
		if (query.grade_level) filter.grade_level = query.grade_level;
		if (query.difficulty_level)
			filter.difficulty_level = query.difficulty_level;
		if (query.search) filter.$text = { $search: query.search };
		return filter;
	}

	private assertCanReadTemplate(
		status: ContentTemplateStatus,
		ownerId: string,
		actor: ActorContext,
	): void {
		if (actor.role === "admin") return;
		if (status === "published" || ownerId === actor.id) return;
		throw new ForbiddenError("Bạn không có quyền xem template này");
	}

	private assertCanPublish(actor: ActorContext): void {
		if (actor.role === "admin") return;
		throw new ForbiddenError(
			"Teacher không được publish trực tiếp, hãy gửi request-publish để admin duyệt",
		);
	}

	private assertCanRequestPublish(ownerId: string, actor: ActorContext): void {
		if (actor.role === "admin") return;
		if (actor.role === "teacher" && ownerId === actor.id) return;
		throw new ForbiddenError("Bạn không có quyền yêu cầu publish template này");
	}

	private assertCanUpdateTemplate(ownerId: string, actor: ActorContext): void {
		if (actor.role === "admin") return;
		if (actor.role === "teacher" && ownerId === actor.id) return;
		throw new ForbiddenError("Ban khong co quyen cap nhat template nay");
	}

	private async assertNoPendingPublishRequest(
		type: "publish_curriculum_template" | "publish_lesson_template",
		templateId: string,
	): Promise<void> {
		const existing = await this.approvalRepo.model
			.findOne({
				type,
				status: "pending",
				"data.template_id": templateId,
			})
			.exec();
		if (existing)
			throw new ValidationError(
				"Đã tồn tại yêu cầu publish pending cho template này",
			);
	}

	private async getPublishedTemplateForAssignment(
		templateType: ContentAssignmentTemplateType,
		templateId: string,
		actor: ActorContext,
	) {
		const template =
			templateType === "curriculum_template"
				? await this.curriculumTemplateRepo.findById(templateId)
				: await this.lessonTemplateRepo.findById(templateId);
		if (!template) throw new NotFoundError("Không tìm thấy template");
		this.assertCanReadTemplate(
			template.status,
			String(template.created_by),
			actor,
		);
		if (template.status !== "published")
			throw new ValidationError("Chỉ được assign template đã published");
		return template;
	}

	private async resolveAssignmentRecipients(
		targetType: "class" | "student",
		targetId: string,
		actor: ActorContext,
	): Promise<string[]> {
		if (targetType === "class") {
			const cls = await this.classRepo.findById(targetId);
			if (!cls || !cls.is_active)
				throw new NotFoundError("Không tìm thấy lớp học");
			if (actor.role === "teacher" && cls.teacher_id.toString() !== actor.id) {
				throw new ForbiddenError("Teacher chỉ được assign lớp mình sở hữu");
			}
			return cls.student_ids.map((id: any) => id.toString());
		}

		const student = await this.studentRepo.findById(targetId);
		if (!student) throw new NotFoundError("Không tìm thấy học sinh");
		if (actor.role === "teacher") {
			const ownedClass = await this.classRepo.model
				.findOne({
					teacher_id: actor.id,
					student_ids: targetId,
					is_active: true,
				})
				.exec();
			if (!ownedClass)
				throw new ForbiddenError(
					"Teacher chỉ được assign học sinh thuộc lớp mình",
				);
		}
		return [targetId];
	}

	private buildTemplateSnapshot(
		templateType: ContentAssignmentTemplateType,
		template: any,
	) {
		if (templateType === "curriculum_template") {
			return {
				title: template.title,
				description: template.description ?? null,
				grade_level: template.grade_level ?? null,
				difficulty_level: template.difficulty_level ?? null,
				topic: null,
				status: template.status,
				published_at: template.published_at ?? null,
			};
		}

		return {
			title: template.lesson_title,
			description: template.lesson_objective ?? null,
			grade_level: template.grade_level ?? null,
			difficulty_level: template.difficulty_level ?? null,
			topic: template.topic ?? null,
			status: template.status,
			published_at: template.published_at ?? null,
		};
	}

	private async upsertStudentAssignedContent(
		assignment: IContentAssignment,
		studentId: string,
		classId: string | null,
		session?: mongoose.ClientSession,
	): Promise<void> {
		await this.studentAssignedContentRepo.upsertForAssignment(
			{
				assignment_id: assignment._id as any,
				student_id: new mongoose.Types.ObjectId(studentId) as any,
				class_id: classId
					? (new mongoose.Types.ObjectId(classId) as any)
					: null,
				template_type: assignment.template_type,
				template_id: assignment.template_id,
				status:
					assignment.status === "paused"
						? "paused"
						: assignment.status === "archived"
							? "archived"
							: "active",
				materialization_strategy: assignment.materialization_strategy,
				assigned_by: assignment.assigned_by,
				assigned_at: new Date(),
				template_snapshot: assignment.template_snapshot,
			} as any,
			session,
		);
	}

	private assertCanAccessAssignment(
		assignment: IContentAssignment,
		actor: ActorContext,
	): void {
		if (actor.role === "admin") return;
		const assignedBy = assignment.assigned_by as any;
		const assignedById = assignedBy?._id ? String(assignedBy._id) : String(assignedBy);
		if (assignedById === actor.id) return;
		throw new ForbiddenError(
			"Bạn không có quyền truy cập content assignment này",
		);
	}

	private async ensureAssignmentMutable(
		id: string,
		actor: ActorContext,
	): Promise<IContentAssignment> {
		const assignment = await this.contentAssignmentRepo.findById(id);
		if (!assignment)
			throw new NotFoundError("Không tìm thấy content assignment");
		this.assertCanAccessAssignment(assignment, actor);
		return assignment;
	}

	private async logGenerationSafe(
		actorId: string,
		type: string,
		prompt: string,
		response: string,
		tokensInput: number,
		tokensOutput: number,
		durationMs: number,
		status: "success" | "error",
		errorMessage?: string,
		metadata?: Parameters<typeof aiService.logGeneration>[10],
	): Promise<void> {
		try {
			await aiService.logGeneration(
				actorId,
				type,
				prompt,
				response,
				CONTENT_LIBRARY_AI_MODEL,
				tokensInput,
				tokensOutput,
				durationMs,
				status,
				errorMessage,
				metadata,
			);
		} catch {
			// Logging must not break content generation/publishing flow.
		}
	}

	private normalizeDifficulty(
		value: unknown,
		fallback: ContentDifficultyLevel,
	): ContentDifficultyLevel {
		return DIFFICULTY_VALUES.includes(value as ContentDifficultyLevel)
			? (value as ContentDifficultyLevel)
			: fallback;
	}

	private normalizePositiveInt(value: unknown, fallback: number): number {
		return typeof value === "number" && Number.isFinite(value) && value > 0
			? Math.floor(value)
			: fallback;
	}

	private requiredString(value: unknown, fallback: string): string {
		const normalized = typeof value === "string" ? value.trim() : "";
		if (normalized) return normalized;
		if (fallback) return fallback;
		throw new ValidationError("AI output thiếu chuỗi bắt buộc");
	}

	private nullableTrim(value: unknown): string | null {
		if (typeof value !== "string") return null;
		const trimmed = value.trim();
		return trimmed || null;
	}

	private inferAgeGroup(gradeLevel: number): string {
		const minAge = Math.max(6, gradeLevel + 5);
		return `${minAge}-${minAge + 1} tuổi`;
	}

	private renderDifficulty(difficulty: ContentDifficultyLevel): string {
		const map: Record<ContentDifficultyLevel, string> = {
			easy: "cơ bản",
			medium: "trung bình",
			hard: "nâng cao",
		};
		return map[difficulty];
	}

	private extractTopic(text: string): string {
		return text.split(":").pop()?.trim() || text.trim();
	}

	private escapeRegex(value: string): string {
		return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}
}

export const contentLibraryService = new ContentLibraryService();
export default contentLibraryService;
