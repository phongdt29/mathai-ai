'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Lightbulb,
  Search,
  BookOpen,
  CheckCircle,
  ArrowRight,
  RotateCcw,
  Loader2,
  RefreshCw,
  Copy,
  Image as ImageIcon,
  Type,
  Upload,
  X,
} from 'lucide-react';
import { useAgeTheme } from '@/contexts/AgeThemeContext';
import { apiClient, solveProblem, uploadSolverImage, type SolverResponse, type SolverSimilarProblem } from '@/lib/api';
import MathMarkdown from '@/components/MathMarkdown';

type SolverStage = 'hint' | 'detailed_hint' | 'full_solution';
type SolverInputMode = 'text' | 'image';

const stageConfig: Record<SolverStage, { icon: typeof Lightbulb; label: string; labelElementary: string; color: string; bg: string; border: string }> = {
  hint: {
    icon: Lightbulb,
    label: 'Gợi ý',
    labelElementary: 'Gợi ý nhẹ',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  detailed_hint: {
    icon: Search,
    label: 'Gợi ý chi tiết',
    labelElementary: 'Gợi ý thêm nè!',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  full_solution: {
    icon: BookOpen,
    label: 'Lời giải đầy đủ',
    labelElementary: 'Lời giải cho con!',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
};

const stageOrder: SolverStage[] = ['hint', 'detailed_hint', 'full_solution'];

export default function SolverPage() {
  const { theme, ageGroup } = useAgeTheme();
  const [inputMode, setInputMode] = useState<SolverInputMode>('text');
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const [responses, setResponses] = useState<SolverResponse[]>([]);
  const [dependencyWarning, setDependencyWarning] = useState(false);
  const [examples, setExamples] = useState<string[]>([]);
  const [loadingExamples, setLoadingExamples] = useState(false);
  const [error, setError] = useState('');
  const [imageError, setImageError] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [uploadedImageUrl, setUploadedImageUrl] = useState('');
  const [ocrStatus, setOcrStatus] = useState<'parsed' | 'manual_required' | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<number | null>(null);
  const [remainingQuota, setRemainingQuota] = useState<number | null>(null);
  const [ocrMessage, setOcrMessage] = useState('');
  const [similarProblems, setSimilarProblems] = useState<SolverSimilarProblem[]>([]);
  const [similarProblemsMessage, setSimilarProblemsMessage] = useState('');
  const [copiedProblem, setCopiedProblem] = useState('');

  const isElementary = ageGroup === 'elementary';
  const isHigh = ageGroup === 'high';

  const resetResponsesForProblemChange = () => {
    if (responses.length > 0) {
      setResponses([]);
      setDependencyWarning(false);
      setError('');
      setSimilarProblems([]);
      setSimilarProblemsMessage('');
      setCopiedProblem('');
    }
  };

  const fetchExamples = useCallback(async () => {
    setLoadingExamples(true);
    try {
      const gradeLevel = Number(localStorage.getItem('mathai-student-grade')) || 10;
      const res = await apiClient<{ data?: string[] }>(`/solver/examples?grade_level=${gradeLevel}&count=4`);
      if (res?.data && Array.isArray(res.data)) {
        setExamples(res.data);
      }
    } catch {
      // Silently fail — examples are non-critical
    } finally {
      setLoadingExamples(false);
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchExamples);
  }, [fetchExamples]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  const currentStage: SolverStage | null =
    responses.length === 0 ? null : responses[responses.length - 1].stage;
  const canRequestMore = responses.length === 0 || responses[responses.length - 1].can_request_more;

  const nextStage: SolverStage =
    currentStage === null
      ? 'hint'
      : currentStage === 'hint'
        ? 'detailed_hint'
        : 'full_solution';

  const handleImageSelected = async (file: File | null) => {
    if (!file || imageLoading) return;

    setImageError('');
    setError('');
    setOcrStatus(null);
    setOcrConfidence(null);
    setRemainingQuota(null);
    setOcrMessage('');
    setUploadedImageUrl('');
    resetResponsesForProblemChange();

    if (!file.type.startsWith('image/')) {
      setImageError('Vui lòng chọn file ảnh hợp lệ.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError('Ảnh tối đa 5MB. Vui lòng chọn ảnh nhỏ hơn.');
      return;
    }

    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageLoading(true);

    try {
      const result = await uploadSolverImage(file);
      setUploadedImageUrl(result.image_url);
      setOcrStatus(result.ocr_status);
      setOcrConfidence(result.confidence);
      setRemainingQuota(result.remaining_quota);
      setOcrMessage(result.message);
      setProblem(result.parsed_text || '');
      if (!result.parsed_text) {
        setImageError('AI chưa đọc được đề từ ảnh. Em hãy nhập lại đề ở ô bên dưới rồi xin gợi ý.');
      }
    } catch (err: unknown) {
      setOcrStatus('manual_required');
      setOcrConfidence(null);
      setOcrMessage('Đã chọn ảnh nhưng chưa thể OCR qua backend. Em hãy nhập đề thủ công ở ô bên dưới.');
      setImageError(err instanceof Error ? err.message : 'Không thể xử lý ảnh. Vui lòng nhập đề thủ công.');
    } finally {
      setImageLoading(false);
    }
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl('');
    setUploadedImageUrl('');
    setOcrStatus(null);
    setOcrConfidence(null);
    setRemainingQuota(null);
    setOcrMessage('');
    setImageError('');
    setProblem('');
    resetResponsesForProblemChange();
  };

  const handleSolve = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!problem.trim() || loading) return;

    // First request resets responses
    if (responses.length === 0) {
      setError('');
    }

    setLoading(true);
    try {
      const gradeLevel = Number(localStorage.getItem('mathai-student-grade')) || 10;
      const previousHints = responses.map((r) => r.content);
      const stage = responses.length === 0 ? 'hint' : nextStage;

      const data = await solveProblem({
        problem_text: problem,
        grade_level: gradeLevel,
        stage,
        previous_hints: previousHints,
        input_type: inputMode,
        image_url: uploadedImageUrl || undefined,
      });
      setResponses((prev) => [...prev, data]);
      setSimilarProblems(data.similar_problems ?? []);
      setSimilarProblemsMessage(data.similar_problems_meta?.message ?? '');
      if (data.dependency_warning) setDependencyWarning(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setProblem('');
    setResponses([]);
    setDependencyWarning(false);
    setError('');
    setImageError('');
    setSimilarProblems([]);
    setSimilarProblemsMessage('');
    setCopiedProblem('');
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl('');
    setUploadedImageUrl('');
    setOcrStatus(null);
    setOcrConfidence(null);
    setRemainingQuota(null);
    setOcrMessage('');
  };

  const handleSelectSimilarProblem = (similar: SolverSimilarProblem) => {
    setProblem(similar.problem);
    setInputMode('text');
    setResponses([]);
    setDependencyWarning(false);
    setError('');
    setSimilarProblems([]);
    setSimilarProblemsMessage('');
    setCopiedProblem('');
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImagePreviewUrl('');
    setUploadedImageUrl('');
    setOcrStatus(null);
    setOcrConfidence(null);
    setRemainingQuota(null);
    setOcrMessage('');
    setImageError('');
  };

  const handleCopySimilarProblem = async (similar: SolverSimilarProblem) => {
    try {
      await navigator.clipboard.writeText(similar.problem);
      setCopiedProblem(similar.problem);
      window.setTimeout(() => setCopiedProblem(''), 1500);
    } catch {
      setCopiedProblem('');
    }
  };

  const nextStageLabel = () => {
    if (!canRequestMore) return '';
    const cfg = stageConfig[nextStage];
    return isElementary ? cfg.labelElementary : cfg.label;
  };

  return (
    <div className={`max-w-3xl mx-auto ${theme.sectionGap}`}>
      <div>
        <h1 className={`text-2xl ${theme.fontWeight} text-gray-900`}>
          {isElementary ? 'Giải toán cùng Robot AI' : 'Giải toán AI'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {isElementary
            ? 'Nhập hoặc chụp ảnh bài toán — Robot sẽ gợi ý từng bước để con tự giải nhé!'
            : 'Nhập đề bằng text hoặc ảnh, kiểm tra lại đề trước khi nhận gợi ý từng bước'}
        </p>
      </div>

      {/* Input form */}
      <form
        onSubmit={handleSolve}
        className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm space-y-4`}
      >
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
          <button
            type="button"
            onClick={() => setInputMode('text')}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
              inputMode === 'text' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Type className="w-4 h-4" />
            Nhập text
          </button>
          <button
            type="button"
            onClick={() => setInputMode('image')}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition ${
              inputMode === 'image' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            Ảnh / OCR
          </button>
        </div>

        {inputMode === 'image' && (
          <div className="space-y-3 rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-gray-800">Tải ảnh đề toán</p>
                <p className="text-sm text-gray-500">
                  Backend sẽ thử OCR bằng AI multimodal nếu có cấu hình. Nếu chưa đọc được, em xác nhận/chỉnh đề thủ công trước khi giải.
                </p>
              </div>
              {imagePreviewUrl && (
                <button
                  type="button"
                  onClick={clearImage}
                  className="rounded-full border border-gray-200 bg-white p-2 text-gray-500 hover:text-red-500"
                  aria-label="Xóa ảnh đã chọn"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <label className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-blue-200 bg-white px-4 py-6 text-center transition hover:border-blue-400 ${imageLoading ? 'opacity-60' : ''}`}>
              {imageLoading ? <Loader2 className="mb-2 h-8 w-8 animate-spin text-blue-600" /> : <Upload className="mb-2 h-8 w-8 text-blue-600" />}
              <span className="font-semibold text-blue-700">
                {imageLoading ? 'Đang tải ảnh và OCR...' : 'Chọn ảnh từ máy'}
              </span>
              <span className="mt-1 text-xs text-gray-400">JPG, PNG, GIF, WEBP tối đa 5MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                disabled={imageLoading}
                onChange={(e) => handleImageSelected(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>

            {imagePreviewUrl && (
              <div className="overflow-hidden rounded-2xl border border-blue-100 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imagePreviewUrl} alt="Ảnh đề toán đã chọn" className="max-h-72 w-full object-contain" />
              </div>
            )}

            {ocrMessage && (
              <div className={`rounded-xl border p-3 text-sm ${ocrStatus === 'parsed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                {ocrMessage}
              </div>
            )}

            {/* Confidence warning banner — Requirement 4.9 */}
            {ocrStatus === 'parsed' && ocrConfidence !== null && ocrConfidence < 0.85 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-800 flex items-center gap-2">
                <span>⚠️</span>
                <span>Hãy kiểm tra lại đề</span>
              </div>
            )}

            {/* Remaining quota display — Requirement 4.10 */}
            {remainingQuota !== null && (
              <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                Lượt OCR còn lại hôm nay: <span className="font-semibold text-gray-800">{remainingQuota}</span>
              </div>
            )}

            {imageError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                {imageError}
              </div>
            )}
          </div>
        )}

        <div>
          <label className="block text-sm font-bold text-gray-700 mb-2">
            {inputMode === 'image'
              ? (isElementary ? 'Con kiểm tra lại đề Robot đọc được nhé!' : 'Xác nhận/chỉnh đề đã OCR')
              : (isElementary ? 'Viết bài toán vào đây nè!' : 'Nhập bài toán')}
          </label>
          <textarea
            value={problem}
            onChange={(e) => {
              setProblem(e.target.value);
              resetResponsesForProblemChange();
            }}
            placeholder={
              inputMode === 'image'
                ? 'Nếu OCR chưa có hoặc chưa đúng, nhập/chỉnh lại đề toán ở đây trước khi xin gợi ý'
                : isElementary
                  ? 'Ví dụ: 2 + 3 = ? hoặc Giải phương trình x + 5 = 10'
                  : 'Ví dụ: Giải phương trình x² - 5x + 6 = 0'
            }
            rows={isElementary ? 5 : 4}
            className={`w-full ${theme.buttonRadius} border border-blue-200 bg-white ${
              isElementary ? 'px-4 py-4 text-lg' : 'px-4 py-3 text-base'
            } outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 resize-none`}
          />
          {inputMode === 'image' && (
            <p className="mt-2 text-xs text-gray-500">
              Solver chỉ dùng phần text đã xác nhận ở ô này để xin gợi ý/lời giải, nhằm tránh giải sai do OCR nhầm.
            </p>
          )}
        </div>

        {responses.length === 0 && inputMode === 'text' && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base font-semibold text-gray-400">
                {isElementary ? 'Chọn thử một bài nè:' : 'Ví dụ thử nhanh:'}
              </span>
              <button
                type="button"
                onClick={fetchExamples}
                disabled={loadingExamples}
                className="text-gray-400 hover:text-blue-500 transition disabled:opacity-50"
                title="Tải ví dụ mới"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingExamples ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {loadingExamples && examples.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                Đang tạo ví dụ...
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {examples.map((ex) => (
                  <button
                    key={ex}
                    type="button"
                    onClick={() => setProblem(ex)}
                    className={`text-sm font-medium px-3 py-1.5 rounded-full transition ${
                      isElementary
                        ? 'bg-blue-500 text-white hover:bg-blue-600'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                    }`}
                  >
                    {ex}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Primary action button */}
        {responses.length === 0 ? (
          <button
            type="submit"
            disabled={loading || imageLoading || !problem.trim()}
            className={`w-full ${theme.buttonRadius} bg-blue-600 ${
              isElementary ? 'px-6 py-4 text-xl' : 'px-6 py-3 text-base'
            } font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {isElementary ? 'Robot đang suy nghĩ...' : 'Đang xử lý...'}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Lightbulb className="w-5 h-5" />
                {inputMode === 'image'
                  ? (isElementary ? 'Đã kiểm tra đề, xin gợi ý!' : 'Xác nhận đề và xin gợi ý')
                  : (isElementary ? 'Xin gợi ý nào!' : 'Xin gợi ý')}
              </span>
            )}
          </button>
        ) : null}
      </form>

      {/* Dependency warning */}
      {dependencyWarning && (
        <div className={`${theme.cardRadius} bg-orange-50 border border-orange-200 p-4`}>
          <p className="text-sm text-orange-700 font-medium">
            {isElementary
              ? '🤔 Con ơi, hãy thử tự giải trước khi xem đáp án nhé! Con sẽ giỏi hơn đấy!'
              : '⚠️ Bạn đang có xu hướng xem lời giải đầy đủ quá nhiều. Hãy thử tự giải với gợi ý trước!'}
          </p>
        </div>
      )}

      {/* Progressive responses */}
      {responses.length > 0 && (
        <div className="space-y-3">
          {/* Stage progress indicator */}
          <div className="flex items-center gap-2 px-1">
            {stageOrder.map((stage, i) => {
              const reached = responses.some((r) => r.stage === stage);
              const cfg = stageConfig[stage];
              const Icon = cfg.icon;
              return (
                <div key={stage} className="flex items-center gap-2">
                  {i > 0 && (
                    <div className={`w-8 h-px ${reached ? 'bg-blue-300' : 'bg-gray-200'}`} />
                  )}
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition ${
                      reached ? `${cfg.bg} ${cfg.color} ${cfg.border} border` : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {isElementary ? cfg.labelElementary : cfg.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Response cards */}
          {responses.map((resp, i) => {
            const cfg = stageConfig[resp.stage];
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className={`${theme.cardRadius} ${cfg.bg} border ${cfg.border} ${theme.cardPadding} shadow-sm`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center ${cfg.bg} ${cfg.color}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <span className={`text-base font-bold ${cfg.color}`}>
                    {isElementary ? cfg.labelElementary : cfg.label}
                  </span>
                  {resp.stage === 'full_solution' && (
                    <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto" />
                  )}
                </div>
                <MathMarkdown
                  content={resp.content}
                  className={`text-base ${isHigh ? 'text-gray-700' : 'text-gray-600'} leading-relaxed`}
                />
              </div>
            );
          })}

          {/* Similar practice problems */}
          {responses.some((resp) => resp.stage === 'full_solution') && (
            <div className={`${theme.cardRadius} bg-white border border-purple-100 ${theme.cardPadding} shadow-sm space-y-3`}>
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">
                    {isElementary ? 'Bài luyện thêm giống bài này' : 'Bài tương tự / luyện thêm'}
                  </h2>
                  {similarProblemsMessage && (
                    <p className="mt-1 text-sm text-gray-500">{similarProblemsMessage}</p>
                  )}
                </div>
              </div>

              {similarProblems.length > 0 ? (
                <div className="space-y-3">
                  {similarProblems.map((similar, index) => (
                    <div key={`${similar.problem}-${index}`} className="rounded-2xl border border-purple-100 bg-purple-50/40 p-4">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-white px-2.5 py-1 text-purple-700">{similar.topic}</span>
                        <span className="rounded-full bg-white px-2.5 py-1 text-gray-500">{similar.difficulty}</span>
                      </div>
                      <p className="font-semibold text-gray-900">{similar.problem}</p>
                      <p className="mt-2 text-sm text-gray-600">
                        <span className="font-semibold text-purple-700">Gợi ý:</span> {similar.hint}
                      </p>
                      {(similar.answer || similar.solution_outline) && (
                        <p className="mt-2 text-sm text-gray-500">
                          <span className="font-semibold">Đáp án/ý chính:</span> {similar.answer || similar.solution_outline}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleSelectSimilarProblem(similar)}
                          className="rounded-xl bg-purple-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-purple-700"
                        >
                          {isElementary ? 'Luyện bài này' : 'Đưa vào solver'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopySimilarProblem(similar)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-purple-100 bg-white px-3 py-2 text-sm font-semibold text-purple-700 transition hover:bg-purple-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copiedProblem === similar.problem ? 'Đã copy' : 'Copy đề'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
                  Chưa có bài luyện thêm. Hệ thống không dùng bài mẫu giả nếu AI chưa tạo được.
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-3">
            {canRequestMore && (
              <button
                type="button"
                onClick={() => handleSolve()}
                disabled={loading}
                className={`flex items-center gap-2 ${theme.buttonRadius} ${
                  isElementary ? 'px-5 py-3 text-lg' : 'px-4 py-2.5 text-sm'
                } font-semibold bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50`}
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowRight className="w-4 h-4" />
                )}
                {loading
                  ? (isElementary ? 'Đang suy nghĩ...' : 'Đang xử lý...')
                  : (isElementary
                      ? `Cho con ${nextStageLabel()} đi!`
                      : `Xem ${nextStageLabel()}`)}
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className={`flex items-center gap-2 ${theme.buttonRadius} ${
                isElementary ? 'px-5 py-3 text-lg' : 'px-4 py-2.5 text-sm'
              } font-medium border border-gray-200 text-gray-700 transition hover:bg-gray-50`}
            >
              <RotateCcw className="w-4 h-4" />
              {isElementary ? 'Giải bài mới' : 'Bài toán mới'}
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className={`${theme.cardRadius} bg-red-50 border border-red-200 p-4`}>
          <p className="text-sm text-red-600">❌ {error}</p>
        </div>
      )}
    </div>
  );
}
