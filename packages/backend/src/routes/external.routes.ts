import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
	GRAPH_BLOCK_GUIDELINES,
	MATH_FORMAT_GUIDELINES,
} from '../constants/math-format';
import { authenticateApiKey } from '../middleware/api-key';
import { aiService } from '../services/ai.service';
import { solverService } from '../services/solver.service';
import { ValidationError } from '../utils/errors';
import { successResponse } from '../utils/response';

/**
 * Cổng API tích hợp ngoài (server-to-server) — xác thực bằng X-API-Key.
 *
 * Mount tại /api/external và /api/v1/external. Đây là bề mặt ổn định,
 * không phụ thuộc phiên đăng nhập người dùng, dành cho đối tác đấu nối.
 */
const router = Router();

const externalRateLimit = rateLimit({
	windowMs: 60 * 1000,
	max: 120, // 120 req/phút cho mỗi IP đối tác
	message: {
		success: false,
		message: 'Quá nhiều yêu cầu, vui lòng thử lại sau.',
		data: null,
	},
	standardHeaders: true,
	legacyHeaders: false,
});

router.use(externalRateLimit);
router.use(authenticateApiKey);

// GET /api/v1/external/ping — kiểm tra kết nối và API key
router.get('/ping', (_req, res) => {
	successResponse(res, {
		service: 'mathai-external-api',
		version: process.env.npm_package_version ?? '0.1.0',
		time: new Date().toISOString(),
	});
});

// POST /api/v1/external/math/solve — giải/gợi ý một bài toán (stateless)
// Body: { problem: string, stage?: "hint" | "detailed_hint" | "full_solution" }
router.post('/math/solve', async (req, res, next) => {
	try {
		const problem = typeof req.body?.problem === 'string' ? req.body.problem.trim() : '';
		const stage = ['hint', 'detailed_hint', 'full_solution'].includes(req.body?.stage)
			? (req.body.stage as 'hint' | 'detailed_hint' | 'full_solution')
			: 'full_solution';

		if (!problem) {
			throw new ValidationError('problem là bắt buộc');
		}
		if (problem.length > 4000) {
			throw new ValidationError('problem tối đa 4000 ký tự');
		}

		const stageInstruction =
			stage === 'hint'
				? 'CHỈ đưa gợi ý nhẹ 2-3 câu, KHÔNG đưa đáp án.'
				: stage === 'detailed_hint'
					? 'Đưa gợi ý chi tiết về phương pháp giải nhưng KHÔNG đưa đáp án cuối cùng.'
					: 'Đưa lời giải đầy đủ từng bước, giải thích tại sao, cuối cùng nêu lỗi thường gặp.';

		const systemPrompt = [
			'Bạn là gia sư toán cho học sinh Việt Nam.',
			MATH_FORMAT_GUIDELINES,
			stage === 'full_solution' ? GRAPH_BLOCK_GUIDELINES : '',
			stageInstruction,
		]
			.filter(Boolean)
			.join('\n');

		const result = await aiService.generateCompletion(
			systemPrompt,
			`Bài toán: ${problem}`,
			{ temperature: 0.3 },
		);

		successResponse(res, {
			stage,
			content: result.content,
			tokens_used: result.tokensUsed,
		});
	} catch (err) {
		next(err);
	}
});

// POST /api/v1/external/math/examples — sinh đề toán mẫu theo lớp
// Body: { grade_level: number (1-12), count?: number (1-10) }
router.post('/math/examples', async (req, res, next) => {
	try {
		const gradeLevel = Number(req.body?.grade_level);
		const count = Math.min(Math.max(Number(req.body?.count) || 5, 1), 10);

		if (!Number.isInteger(gradeLevel) || gradeLevel < 1 || gradeLevel > 12) {
			throw new ValidationError('grade_level phải là số nguyên từ 1 đến 12');
		}

		const examples = await solverService.generateExamples(gradeLevel, count);
		successResponse(res, { grade_level: gradeLevel, examples });
	} catch (err) {
		next(err);
	}
});

export default router;
