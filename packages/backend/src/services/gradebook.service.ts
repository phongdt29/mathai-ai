import { type ClientSession, Types } from "mongoose";
import {
	type GradebookEntryRepository,
	gradebookEntryRepository,
	type IGradebookEntry,
} from "../models/gradebook.model";
import { TeacherAssignmentModel } from "../models/teacher.model";
import { calculatePercentage, roundPoints, validateEarnedPoints } from "../utils/scoring";

export interface GradebookEntryUpsertInput {
	student_id: string;
	class_id?: string | null;
	teacher_id?: string | null;
	source_type: "teacher_assignment" | "assessment" | "lesson";
	source_id: string;
	attempt_id?: string | null;
	title: string;
	earned_points: number;
	max_points: number;
	status?: "graded" | "submitted" | "missing";
	graded_at?: Date | null;
	submitted_at?: Date | null;
	metadata?: Record<string, unknown> | null;
}

export interface GradebookSummaryFilters {
	teacher_id?: string;
	class_id?: string;
	student_id?: string;
}

export interface GradebookSummaryBucket {
	earned_points: number;
	max_points: number;
	percentage: number;
	entries: number;
}

export interface StudentGradebookSummary extends GradebookSummaryBucket {
	student_id: string;
	by_source_type: Record<string, GradebookSummaryBucket>;
	gradebook_entries: IGradebookEntry[];
}

export interface GradebookSummary extends GradebookSummaryBucket {
	filters: GradebookSummaryFilters;
	students: StudentGradebookSummary[];
}

function emptyBucket(): GradebookSummaryBucket {
	return { earned_points: 0, max_points: 0, percentage: 0, entries: 0 };
}

function finalizeBucket(bucket: GradebookSummaryBucket): GradebookSummaryBucket {
	bucket.earned_points = roundPoints(bucket.earned_points);
	bucket.max_points = roundPoints(bucket.max_points);
	bucket.percentage = calculatePercentage(bucket.earned_points, bucket.max_points);
	return bucket;
}

export class GradebookService {
	constructor(private readonly entryRepo: GradebookEntryRepository = gradebookEntryRepository) {}

	public async upsertEntry(
		input: GradebookEntryUpsertInput,
		session?: ClientSession,
	): Promise<IGradebookEntry> {
		const earnedPoints = validateEarnedPoints(input.earned_points, input.max_points);
		const maxPoints = roundPoints(input.max_points);
		return this.entryRepo.upsertEntry(
			{
				student_id: new Types.ObjectId(input.student_id),
				class_id: input.class_id ? new Types.ObjectId(input.class_id) : null,
				teacher_id: input.teacher_id ? new Types.ObjectId(input.teacher_id) : null,
				source_type: input.source_type,
				source_id: String(input.source_id).trim(),
				attempt_id: input.attempt_id ? String(input.attempt_id).trim() : null,
				title: input.title,
				earned_points: earnedPoints,
				max_points: maxPoints,
				percentage: calculatePercentage(earnedPoints, maxPoints),
				status: input.status ?? "graded",
				graded_at: input.graded_at ?? null,
				submitted_at: input.submitted_at ?? null,
				metadata: input.metadata ?? null,
			},
			session,
		);
	}

	public async upsertTeacherAssignmentEntry(input: {
		teacher_id: string;
		class_id: string;
		assignment_id: string;
		submission_id: string;
		student_id: string;
		title: string;
		earned_points: number;
		max_points: number;
		graded_at?: Date | null;
		submitted_at?: Date | null;
		metadata?: Record<string, unknown> | null;
	}): Promise<IGradebookEntry> {
		return this.upsertEntry({
			student_id: input.student_id,
			class_id: input.class_id,
			teacher_id: input.teacher_id,
			source_type: "teacher_assignment",
			source_id: input.assignment_id,
			attempt_id: input.submission_id,
			title: input.title,
			earned_points: input.earned_points,
			max_points: input.max_points,
			status: "graded",
			graded_at: input.graded_at ?? null,
			submitted_at: input.submitted_at ?? null,
			metadata: input.metadata ?? null,
		});
	}

	public async regenerateTeacherAssignment(assignmentId: string): Promise<IGradebookEntry[]> {
		const rows = await TeacherAssignmentModel.aggregate([
			{ $match: { _id: new Types.ObjectId(assignmentId) } },
			{
				$lookup: {
					from: "studentsubmissions",
					localField: "_id",
					foreignField: "assignment_id",
					as: "submissions",
				},
			},
			{ $unwind: "$submissions" },
			{ $match: { "submissions.score": { $ne: null } } },
		]);

		const entries: IGradebookEntry[] = [];
		for (const row of rows) {
			entries.push(
				await this.upsertTeacherAssignmentEntry({
					teacher_id: String(row.teacher_id),
					class_id: String(row.class_id),
					assignment_id: String(row._id),
					submission_id: String(row.submissions._id),
					student_id: String(row.submissions.student_id),
					title: row.title,
					earned_points: Number(row.submissions.score),
					max_points: Number(row.total_points),
					graded_at: row.submissions.graded_at ?? null,
					submitted_at: row.submissions.submitted_at ?? null,
					metadata: { regenerated: true },
				}),
			);
		}
		return entries;
	}

	public async getSummary(filters: GradebookSummaryFilters): Promise<GradebookSummary> {
		let entries: IGradebookEntry[];
		if (filters.teacher_id) {
			entries = await this.entryRepo.findByTeacherClass(filters.teacher_id, filters.class_id);
			if (filters.student_id) {
				entries = entries.filter((entry) => String(entry.student_id) === filters.student_id);
			}
		} else if (filters.student_id) {
			entries = await this.entryRepo.findByStudent(filters.student_id);
		} else {
			entries = [];
		}

		const overall = emptyBucket();
		const studentMap = new Map<string, StudentGradebookSummary>();

		for (const entry of entries) {
			const studentId = String(entry.student_id);
			const studentSummary = studentMap.get(studentId) ?? {
				student_id: studentId,
				...emptyBucket(),
				by_source_type: {},
				gradebook_entries: [],
			};
			const sourceSummary = studentSummary.by_source_type[entry.source_type] ?? emptyBucket();
			const earned = Number(entry.earned_points ?? 0);
			const max = Number(entry.max_points ?? 0);

			overall.earned_points += earned;
			overall.max_points += max;
			overall.entries += 1;
			studentSummary.earned_points += earned;
			studentSummary.max_points += max;
			studentSummary.entries += 1;
			studentSummary.gradebook_entries.push(entry);
			sourceSummary.earned_points += earned;
			sourceSummary.max_points += max;
			sourceSummary.entries += 1;
			studentSummary.by_source_type[entry.source_type] = sourceSummary;
			studentMap.set(studentId, studentSummary);
		}

		const students = Array.from(studentMap.values()).map((student) => {
			finalizeBucket(student);
			for (const bucket of Object.values(student.by_source_type)) {
				finalizeBucket(bucket);
			}
			return student;
		});

		return {
			filters,
			...finalizeBucket(overall),
			students,
		};
	}
}

export const gradebookService = new GradebookService();
export default gradebookService;
