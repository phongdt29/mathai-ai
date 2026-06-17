import type { AISafetyStatus } from '../constants/ai-governance';
import { isEnabled } from '../config/feature-flags';

export type AISafetyDecision = 'allow' | 'block' | 'flag';
export type AISafetyRiskLevel = 'low' | 'medium' | 'high';
export type AISafetyDirection = 'input' | 'output';

export interface AISafetyGuardInput {
  text: string;
  purpose?: string;
  direction?: AISafetyDirection;
}

export interface AISafetyGuardResult {
  decision: AISafetyDecision;
  safetyStatus: AISafetyStatus;
  reasons: string[];
  confidence: number;
  riskLevel: AISafetyRiskLevel;
}

interface RuleMatch {
  reason: string;
  severity: 'flag' | 'block';
}

const DEFAULT_ENABLED = isEnabled('aiSafetyGuard') && process.env.AI_SAFETY_GUARD_ENABLED !== 'false';
const MAX_TEXT_LENGTH = 12_000;

const MATH_KEYWORDS = [
  /\b(to[aá]n|đại số|hình học|giải tích|xác suất|thống kê|số học|phân số|phương trình|bất phương trình|hàm số|đạo hàm|tích phân|ma trận|vector|vectơ|tam giác|hình tròn|diện tích|chu vi|thể tích|góc|đường thẳng|parabol|logarit|lũy thừa|căn bậc|tỉ lệ|phần trăm|bài toán|đề bài|lời giải|gợi ý|chứng minh)\b/i,
  /(?:\d+\s*[+\-*/x×÷=<>≤≥]|[a-z]\s*=\s*\d|\b\d+\s*(cm|m|km|kg|lít|đồng|%)\b)/i,
  /[∑√π∞≈≠≤≥±÷×]/,
];

const OFF_SCOPE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(viết|soạn|tạo)\s+(bài văn|email|đơn xin|thơ|truyện|hợp đồng|cv|resume)\b/i, 'off_scope_non_math_writing'],
  [/\b(lịch sử|địa lý|vật lý|hóa học|sinh học|ngữ văn|tiếng anh)\b.*\b(giải|làm|trả lời|viết)\b/i, 'off_scope_non_math_subject'],
  [/\b(dự đoán|tư vấn)\s+(chứng khoán|crypto|xổ số|cá cược|bóng đá)\b/i, 'off_scope_financial_or_gambling'],
  [/\b(chẩn đoán|đơn thuốc|uống thuốc|bệnh gì|triệu chứng)\b/i, 'off_scope_medical_advice'],
];

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'pii_email_detected'],
  [/\b(?:\+?84|0)\d{8,10}\b/g, 'pii_phone_detected'],
  [/\b\d{9,12}\b/g, 'pii_identifier_like_number_detected'],
  [/\b(địa chỉ|số nhà|cccd|cmnd|căn cước|mật khẩu|password|api key|token)\b/i, 'pii_sensitive_keyword_detected'],
];

const INAPPROPRIATE_PATTERNS: Array<[RegExp, string]> = [
  [/\b(sex|porn|khiêu dâm|tình dục|18\+|ma túy|tự tử|tự hại|bạo lực|giết|hack|malware|lừa đảo|bom|vũ khí)\b/i, 'inappropriate_or_unsafe_request'],
  [/\b(bỏ qua|ignore|jailbreak|system prompt|developer message|tiết lộ prompt|bypass)\b/i, 'prompt_injection_or_policy_bypass'],
];

export class AISafetyGuardService {
  public readonly enabled: boolean;

  constructor(enabled: boolean = DEFAULT_ENABLED) {
    this.enabled = enabled;
  }

  public evaluate(input: AISafetyGuardInput): AISafetyGuardResult {
    if (!this.enabled) {
      return {
        decision: 'allow',
        safetyStatus: 'not_checked',
        reasons: ['safety_guard_disabled'],
        confidence: 0,
        riskLevel: 'low',
      };
    }

    const text = String(input.text ?? '').trim();
    if (!text) {
      return this.block(['empty_content'], 0.98);
    }

    const normalizedText = text.slice(0, MAX_TEXT_LENGTH);
    const matches: RuleMatch[] = [];

    if (!this.isLikelyMathEducation(normalizedText, input.purpose)) {
      matches.push({ reason: 'not_clearly_math_education_scope', severity: 'flag' });
    }

    for (const [pattern, reason] of OFF_SCOPE_PATTERNS) {
      if (pattern.test(normalizedText)) matches.push({ reason, severity: 'block' });
    }

    for (const [pattern, reason] of PII_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(normalizedText)) matches.push({ reason, severity: 'flag' });
    }

    for (const [pattern, reason] of INAPPROPRIATE_PATTERNS) {
      if (pattern.test(normalizedText)) matches.push({ reason, severity: 'block' });
    }

    const uniqueReasons = [...new Set(matches.map((match) => match.reason))];
    if (matches.some((match) => match.severity === 'block')) {
      return this.block(uniqueReasons, 0.94);
    }

    if (matches.length > 0) {
      return {
        decision: 'flag',
        safetyStatus: 'flagged',
        reasons: uniqueReasons,
        confidence: 0.78,
        riskLevel: 'medium',
      };
    }

    return {
      decision: 'allow',
      safetyStatus: 'passed',
      reasons: ['math_education_scope_detected'],
      confidence: 0.88,
      riskLevel: 'low',
    };
  }

  public shouldBlock(result: AISafetyGuardResult): boolean {
    return result.decision === 'block';
  }

  public toMetadata(result: AISafetyGuardResult): Record<string, unknown> {
    return {
      safetyDecision: result.decision,
      safetyReasons: result.reasons,
      safetyConfidence: result.confidence,
      safetyRiskLevel: result.riskLevel,
    };
  }

  private isLikelyMathEducation(text: string, purpose?: string): boolean {
    const purposeIsMathAI = Boolean(purpose && /solver|math|assessment|curriculum|lesson|content|chat_tutoring/i.test(purpose));
    if (MATH_KEYWORDS.some((pattern) => pattern.test(text))) return true;
    if (purposeIsMathAI && /\d/.test(text) && text.length <= 280) return true;
    return false;
  }

  private block(reasons: string[], confidence: number): AISafetyGuardResult {
    return {
      decision: 'block',
      safetyStatus: 'blocked',
      reasons: [...new Set(reasons)],
      confidence,
      riskLevel: 'high',
    };
  }
}

export const aiSafetyGuardService = new AISafetyGuardService();
export default aiSafetyGuardService;
