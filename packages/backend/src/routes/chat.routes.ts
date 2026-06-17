import { Router } from "express";
import { config } from "../config";
import { createOpenAIClient } from "../config/openai";
import {
	GRAPH_BLOCK_GUIDELINES,
	MATH_FORMAT_GUIDELINES,
} from "../constants/math-format";
import { authenticate } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { aiTutorRepository } from "../models/ai-tutor.model";
import {
	conversationRepository,
	messageRepository,
} from "../models/chat.model";
import { systemSettingRepository } from "../models/setting.model";
import { aiProviderRegistryService } from "../services/ai-provider-registry.service";
import { getStudentProfileId } from "../utils/helpers";

const router = Router();
const requireStudent = requireRole("student");

router.use(authenticate);

// GET /api/chat/teachers - Danh sách giáo viên ảo
router.get("/teachers", requireStudent, async (_req, res, next) => {
	try {
		const teachers = await aiTutorRepository.findActive();
		res.json({ success: true, data: teachers });
	} catch (err) {
		next(err);
	}
});

// GET /api/chat/teachers/:id - Chi tiết giáo viên
router.get("/teachers/:id", requireStudent, async (req, res, next) => {
	try {
		const teacher = await aiTutorRepository.findById(req.params.id);
		if (!teacher) {
			return res
				.status(404)
				.json({ success: false, error: "Không tìm thấy giáo viên" });
		}
		res.json({ success: true, data: teacher });
	} catch (err) {
		next(err);
	}
});

// POST /api/chat/conversations - Tạo hội thoại mới (cần teacher_id)
router.post("/conversations", requireStudent, async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const { teacher_id, title } = req.body;

		if (!teacher_id) {
			return res
				.status(400)
				.json({ success: false, error: "teacher_id is required" });
		}

		// Verify teacher exists
		const teacher = await aiTutorRepository.findById(teacher_id);
		if (!teacher) {
			return res
				.status(404)
				.json({ success: false, error: "Không tìm thấy giáo viên" });
		}

		const conversation = await conversationRepository.create({
			student_id: studentId as any,
			ai_tutor_id: teacher_id,
			title:
				title || `Cuộc trò chuyện với ${teacher.display_name || teacher.name}`,
			status: "active",
		});

		res.json({ success: true, data: conversation });
	} catch (err) {
		next(err);
	}
});

// GET /api/chat/conversations - Danh sách hội thoại (filter by teacher_id optional)
router.get("/conversations", requireStudent, async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const teacherId = req.query.teacher_id
			? String(req.query.teacher_id)
			: undefined;

		let conversations;
		if (teacherId) {
			conversations = await conversationRepository.findAll({
				student_id: studentId as any,
				ai_tutor_id: teacherId,
			} as any);
		} else {
			conversations = await conversationRepository.findByStudent(studentId);
		}

		res.json({ success: true, data: conversations });
	} catch (err) {
		next(err);
	}
});

// GET /api/chat/conversations/:id - Chi tiết hội thoại kèm messages
router.get("/conversations/:id", requireStudent, async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const conversationId = req.params.id;
		const conversation =
			await conversationRepository.findWithMessages(conversationId);

		if (!conversation) {
			return res
				.status(404)
				.json({ success: false, error: "Không tìm thấy hội thoại" });
		}

		// Verify ownership
		if (String(conversation.student_id) !== studentId) {
			return res
				.status(403)
				.json({ success: false, error: "Không có quyền truy cập" });
		}

		res.json({ success: true, data: conversation });
	} catch (err) {
		next(err);
	}
});

// DELETE /api/chat/conversations/:id - Xóa hội thoại
router.delete("/conversations/:id", requireStudent, async (req, res, next) => {
	try {
		const studentId = await getStudentProfileId(String(req.user!.id));
		const conversationId = req.params.id;
		const conversation = await conversationRepository.findById(conversationId);

		if (!conversation) {
			return res
				.status(404)
				.json({ success: false, error: "Không tìm thấy hội thoại" });
		}
		if (String(conversation.student_id) !== studentId) {
			return res.status(403).json({ success: false, error: "Không có quyền" });
		}

		await conversationRepository.update(conversationId, { status: "closed" });
		res.json({ success: true, message: "Đã xóa hội thoại" });
	} catch (err) {
		next(err);
	}
});

// POST /api/chat/conversations/:id/messages - Gửi tin nhắn + nhận AI response (streaming)
router.post(
	"/conversations/:id/messages",
	requireStudent,
	async (req, res, next) => {
		try {
			const studentId = await getStudentProfileId(String(req.user!.id));
			const conversationId = req.params.id;
			const { content } = req.body;

			if (!content) {
				return res
					.status(400)
					.json({ success: false, error: "content is required" });
			}

			// Load conversation
			const conversation =
				await conversationRepository.findById(conversationId);
			if (!conversation) {
				return res
					.status(404)
					.json({ success: false, error: "Không tìm thấy hội thoại" });
			}
			if (String(conversation.student_id) !== studentId) {
				return res
					.status(403)
					.json({ success: false, error: "Không có quyền" });
			}

			// Save user message
			await messageRepository.create({
				conversation_id: conversationId as any,
				role: "student",
				content,
				message_type: "text",
			});

			// Load teacher for system prompt
			const teacher = await aiTutorRepository.findById(
				String(conversation.ai_tutor_id),
			);
			if (!teacher) {
				return res
					.status(500)
					.json({ success: false, error: "Giáo viên không tồn tại" });
			}

			// Load recent messages for context
			const recentMessages = await messageRepository.getRecentMessages(
				conversationId,
				20,
			);
			const sortedMessages = recentMessages.sort(
				(a, b) =>
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			);

			// Build OpenAI messages — luôn kèm quy chuẩn công thức/đồ thị
			// để mọi gia sư (kể cả prompt lưu trong DB) trả lời toán chuẩn KaTeX
			const tutorSystemPrompt = [
				teacher.system_prompt || "",
				MATH_FORMAT_GUIDELINES,
				GRAPH_BLOCK_GUIDELINES,
			]
				.filter(Boolean)
				.join("\n\n");
			const openAIMessages = [
				{ role: "system" as const, content: tutorSystemPrompt },
				...sortedMessages.map((m) => ({
					role: (m.role === "student" ? "user" : "assistant") as
						| "user"
						| "assistant",
					content: m.content,
				})),
			];

			// Get AI config (provider registry preferred, legacy settings/env fallback)
			const activeProvider =
				await aiProviderRegistryService.getActiveProvider();
			const legacyConfig = await systemSettingRepository.getAIConfig();
			const client = createOpenAIClient(
				activeProvider?.base_url || legacyConfig.endpoint || undefined,
				activeProvider?.api_key || legacyConfig.apiKey || undefined,
			);
			const model =
				activeProvider?.model || legacyConfig.model || config.openai.model;

			// Stream response
			res.setHeader("Content-Type", "text/event-stream");
			res.setHeader("Cache-Control", "no-cache");
			res.setHeader("Connection", "keep-alive");

			const stream = await client.chat.completions.create({
				model,
				messages: openAIMessages,
				stream: true,
			});

			let fullContent = "";

			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta?.content;
				if (delta) {
					fullContent += delta;
					res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
				}
			}

			// Save assistant message
			await messageRepository.create({
				conversation_id: conversationId as any,
				role: "tutor",
				content: fullContent,
				message_type: "text",
				ai_model: model,
			});

			// Update conversation timestamp
			await conversationRepository.update(conversationId, {
				updatedAt: new Date(),
			} as never);

			res.write(`data: [DONE]\n\n`);
			res.end();
		} catch (err) {
			// If headers already sent (streaming started), close connection
			if (res.headersSent) {
				res.write(`data: ${JSON.stringify({ error: "AI error" })}\n\n`);
				res.end();
			} else {
				next(err);
			}
		}
	},
);

// GET /api/chat/conversations/:id/messages - Lấy tin nhắn hội thoại
router.get(
	"/conversations/:id/messages",
	requireStudent,
	async (req, res, next) => {
		try {
			const studentId = await getStudentProfileId(String(req.user!.id));
			const conversationId = req.params.id;
			const conversation =
				await conversationRepository.findById(conversationId);

			if (!conversation) {
				return res
					.status(404)
					.json({ success: false, error: "Không tìm thấy hội thoại" });
			}
			if (String(conversation.student_id) !== studentId) {
				return res
					.status(403)
					.json({ success: false, error: "Không có quyền" });
			}

			const messages =
				await messageRepository.findByConversation(conversationId);
			res.json({ success: true, data: messages });
		} catch (err) {
			next(err);
		}
	},
);

// Admin: POST /api/chat/settings - Lưu AI config
router.post("/settings", async (req, res, next) => {
	try {
		if (req.user?.role !== "admin") {
			return res.status(403).json({ error: "Admin access required" });
		}
		const { endpoint, apiKey, model } = req.body;
		if (endpoint !== undefined)
			await systemSettingRepository.set("ai_endpoint", endpoint);
		if (apiKey !== undefined)
			await systemSettingRepository.set("ai_api_key", apiKey);
		if (model !== undefined)
			await systemSettingRepository.set("ai_model", model);
		res.json({ success: true, message: "Đã lưu cài đặt AI" });
	} catch (err) {
		next(err);
	}
});

// Admin: GET /api/chat/settings - Lấy AI config
router.get("/settings", async (req, res, next) => {
	try {
		if (req.user?.role !== "admin") {
			return res.status(403).json({ error: "Admin access required" });
		}
		const aiConfig = await systemSettingRepository.getAIConfig();
		res.json({ success: true, data: aiConfig });
	} catch (err) {
		next(err);
	}
});

export default router;
