'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, CheckCircle2, Loader2, RotateCcw, Send, Sparkles, Target, Trophy } from 'lucide-react';
import MathMarkdown from '@/components/MathMarkdown';
import { useAgeTheme } from '@/contexts/AgeThemeContext';
import {
  generateAssessment,
  generateCurriculum,
  getLatestAssessmentResult,
  saveAssessmentAnswer,
  startAssessmentAttempt,
  submitAssessmentAttempt,
  type Assessment,
  type AssessmentAttempt,
  type AssessmentQuestion,
} from '@/lib/api';

const optionLetters = ['A', 'B', 'C', 'D', 'E', 'F'];

type AnswerMap = Record<string, string>;

type Step = 'intro' | 'generating' | 'taking' | 'submitting' | 'result' | 'error';

function getDocumentId(value: { id?: string; _id?: string }) {
  return value.id ?? value._id ?? '';
}

function normalizeChoices(question: AssessmentQuestion): string[] {
  const source = question.choices ?? question.options ?? null;

  if (Array.isArray(source)) {
    return source.map(String).filter(Boolean);
  }

  if (source && typeof source === 'object') {
    return Object.values(source).map(String).filter(Boolean);
  }

  return [];
}

function getResultMessage(ageGroup: string, percentage: number) {
  if (ageGroup === 'elementary') {
    if (percentage >= 80) return 'Xuất sắc quá đi! Con giỏi lắm!';
    if (percentage >= 50) return 'Con làm tốt lắm rồi! Cố gắng thêm chút nữa nhé!';
    return 'Không sao đâu nè! Mỗi lần làm sai là mình học thêm được đó!';
  }

  if (percentage >= 80) return 'Kết quả tốt. Kiến thức nền tảng khá vững.';
  if (percentage >= 50) return 'Bạn đã hoàn thành bài đánh giá. Một số phần cần ôn thêm.';
  return 'Bạn nên củng cố lại các kiến thức nền tảng trước khi học tiếp.';
}

function parseAnalysisList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function getAssessmentStatusLabel(attempt: AssessmentAttempt) {
  if (attempt.status === 'graded' || attempt.ai_analysis || attempt.max_score !== undefined) {
    return 'Đã chấm';
  }
  if (attempt.status === 'in_progress') return 'Đang làm';
  return 'Đã nộp';
}

export default function AssessmentPage() {
  const router = useRouter();
  const { theme, ageGroup } = useAgeTheme();
  const [step, setStep] = useState<Step>('intro');
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null);
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [error, setError] = useState('');
  const [curriculumError, setCurriculumError] = useState('');
  const [curriculumReady, setCurriculumReady] = useState(false);
  const [creatingCurriculum, setCreatingCurriculum] = useState(false);
  const [latestResult, setLatestResult] = useState<AssessmentAttempt | null>(null);
  const [loadedLatest, setLoadedLatest] = useState(false);

  const questions = useMemo(() => assessment?.questions ?? [], [assessment]);
  const answeredCount = questions.filter((question) => answers[getDocumentId(question)]?.trim()).length;
  const canSubmit = step === 'taking' && Boolean(assessment && attempt) && questions.length > 0 && answeredCount > 0;
  const resultAttempt = attempt?.status === 'graded' ? attempt : latestResult;
  const percentage = Math.round(Number(resultAttempt?.percentage ?? 0));
  const totalScore = Number(resultAttempt?.total_score ?? 0);
  const maxScore = Number(resultAttempt?.max_score ?? 0);
  const strengths = parseAnalysisList(resultAttempt?.ai_analysis?.strengths);
  const weaknesses = parseAnalysisList(resultAttempt?.ai_analysis?.weaknesses);
  // Module 2: tốc độ làm bài + mức độ hiểu (từ classification trả về khi nộp bài).
  const diagnostic = (resultAttempt as {
    classification?: {
      diagnostic_signals?: { speed?: string; comprehension_level?: string } | null;
    };
  })?.classification?.diagnostic_signals;
  const speedLabel = diagnostic?.speed
    ? { fast: 'Nhanh', normal: 'Bình thường', slow: 'Chậm' }[diagnostic.speed] ?? ''
    : '';
  const comprehensionLabel = diagnostic?.comprehension_level
    ? { beginner: 'Mới bắt đầu', intermediate: 'Khá ổn', advanced: 'Vững' }[
        diagnostic.comprehension_level
      ] ?? ''
    : '';

  useEffect(() => {
    let cancelled = false;

    async function loadLatestResult() {
      try {
        const result = await getLatestAssessmentResult();
        if (!cancelled) {
          setLatestResult(result);
        }
      } catch {
        if (!cancelled) {
          setLatestResult(null);
        }
      } finally {
        if (!cancelled) {
          setLoadedLatest(true);
        }
      }
    }

    loadLatestResult();
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewAssessment = async () => {
    setStep('generating');
    setError('');
    setAssessment(null);
    setAttempt(null);
    setAnswers({});

    try {
      const gradeLevel = Number(localStorage.getItem('mathai-student-grade')) || undefined;
      const generated = await generateAssessment({
        type: 'diagnostic',
        grade_level: gradeLevel,
        total_questions: 8,
        difficulty: 'mixed',
      });
      const generatedId = getDocumentId(generated);

      if (!generatedId || !Array.isArray(generated.questions) || generated.questions.length === 0) {
        throw new Error('Chưa nhận được đề đánh giá hợp lệ. Vui lòng thử lại sau.');
      }

      const startedAttempt = await startAssessmentAttempt(generatedId);
      setAssessment(generated);
      setAttempt(startedAttempt);
      setStep('taking');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không tạo được bài đánh giá đầu vào.');
      setStep('error');
    }
  };

  const updateAnswer = (questionId: string, value: string) => {
    setAnswers((current) => ({ ...current, [questionId]: value }));
  };

  const submit = async () => {
    if (!assessment || !attempt) return;

    const assessmentId = getDocumentId(assessment);
    const attemptId = getDocumentId(attempt);
    if (!assessmentId || !attemptId) {
      setError('Thiếu mã bài đánh giá hoặc lượt làm bài.');
      setStep('error');
      return;
    }

    setStep('submitting');
    setError('');

    try {
      for (const question of questions) {
        const questionId = getDocumentId(question);
        const studentAnswer = answers[questionId]?.trim();

        if (!questionId || !studentAnswer) {
          continue;
        }

        await saveAssessmentAnswer(assessmentId, attemptId, {
          question_id: questionId,
          student_answer: studentAnswer,
        });
      }

      const submitted = await submitAssessmentAttempt(assessmentId, attemptId);
      setAttempt(submitted);
      setLatestResult(submitted);
      // Backend tự tạo giáo trình sau khi phân loại (user-flow đặc tả).
      setCurriculumReady(Boolean((submitted as { curriculum_generated?: boolean }).curriculum_generated));
      setStep('result');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không nộp được bài đánh giá.');
      setStep('taking');
    }
  };

  const createPersonalizedCurriculum = async () => {
    if (!resultAttempt) return;

    setCreatingCurriculum(true);
    setCurriculumError('');

    try {
      const recommendation = resultAttempt.ai_analysis?.recommendations?.trim();
      await generateCurriculum({
        title: 'Giáo trình toán cá nhân hóa',
        total_modules: 4,
        lessons_per_module: 4,
        exercises_per_lesson: 5,
        target_goal: recommendation || undefined,
        skill_strengths: strengths.length > 0 ? strengths : undefined,
        skill_weaknesses: weaknesses.length > 0 ? weaknesses : undefined,
        include_end_of_lesson_quiz: true,
      });
      router.push('/dashboard/curriculum');
    } catch (err: unknown) {
      setCurriculumError(err instanceof Error ? err.message : 'Chưa tạo được giáo trình học thật. Vui lòng thử lại.');
    } finally {
      setCreatingCurriculum(false);
    }
  };

  if (!loadedLatest && step === 'intro') {
    return (
      <div className={`max-w-2xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm text-center`}>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <p className="mt-3 text-gray-500">Đang kiểm tra trạng thái đánh giá...</p>
        </div>
      </div>
    );
  }

  if (step === 'generating') {
    return (
      <div className={`max-w-2xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm text-center`}>
          <Sparkles className="mx-auto h-10 w-10 animate-pulse text-blue-600" />
          <h1 className={`mt-4 text-2xl ${theme.fontWeight} text-gray-900`}>Đang tạo bài kiểm tra đầu vào</h1>
          <p className="mt-2 text-gray-500">AI đang tạo 5–10 câu dựa trên hồ sơ lớp, học lực tự đánh giá và điểm trung bình toán.</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className={`max-w-2xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-red-100 ${theme.cardPadding} shadow-sm`}>
          <h1 className={`text-2xl ${theme.fontWeight} text-gray-900`}>Chưa thể tạo bài đánh giá</h1>
          <p className="mt-3 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={startNewAssessment} className={`${theme.buttonRadius} bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700`}>
              Thử tạo lại
            </button>
            <Link href="/dashboard" className={`${theme.buttonRadius} bg-gray-100 px-5 py-3 font-bold text-gray-700 hover:bg-gray-200`}>
              Về tổng quan
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'result' && resultAttempt) {
    return (
      <div className={`max-w-3xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm`}>
          <div className="flex flex-col items-center text-center">
            <Trophy className="h-14 w-14 text-amber-500" />
            <h1 className={`mt-4 text-2xl ${theme.fontWeight} text-gray-900`}>Kết quả đánh giá đầu vào</h1>
            <p className="mt-2 text-gray-500">{getResultMessage(ageGroup, percentage)}</p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <ResultStat label="Tỷ lệ" value={`${percentage}%`} />
            <ResultStat label="Điểm" value={`${totalScore}/${maxScore || '-'}`} />
            <ResultStat label="Trạng thái" value={getAssessmentStatusLabel(resultAttempt)} />
          </div>

          {(speedLabel || comprehensionLabel) && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {speedLabel && <ResultStat label="Tốc độ làm bài" value={speedLabel} />}
              {comprehensionLabel && <ResultStat label="Mức độ hiểu" value={comprehensionLabel} />}
            </div>
          )}

          {resultAttempt.ai_feedback && (
            <div className="mt-6 rounded-2xl bg-blue-50 p-4 text-blue-900 whitespace-pre-line">
              {resultAttempt.ai_feedback}
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <AnalysisList title="Điểm mạnh" items={strengths} empty="Chưa ghi nhận điểm mạnh rõ ràng. Hãy làm thêm bài để hệ thống đánh giá chính xác hơn." tone="green" />
            <AnalysisList title="Điểm yếu" items={weaknesses} empty="Chưa ghi nhận điểm yếu rõ ràng trong các câu đã làm." tone="amber" />
          </div>

          {resultAttempt.ai_analysis?.recommendations && (
            <div className="mt-4 rounded-2xl bg-indigo-50 p-4 text-indigo-900">
              <p className="font-bold">Khuyến nghị</p>
              <p className="mt-1">{resultAttempt.ai_analysis.recommendations}</p>
            </div>
          )}

          {curriculumError && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{curriculumError}</p>}

          {curriculumReady && (
            <p className="mt-5 rounded-xl bg-green-50 p-4 text-green-700">
              ✓ Hệ thống đã tự tạo giáo trình cá nhân hóa dựa trên kết quả của bạn.
            </p>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {curriculumReady ? (
              <Link
                href="/dashboard/curriculum"
                className={`${theme.buttonRadius} bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700`}
              >
                <Sparkles className="mr-2 inline h-4 w-4" /> Xem giáo trình của tôi
              </Link>
            ) : (
              <button
                type="button"
                onClick={createPersonalizedCurriculum}
                disabled={creatingCurriculum}
                className={`${theme.buttonRadius} bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {creatingCurriculum ? <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 inline h-4 w-4" />}
                {creatingCurriculum ? 'Đang tạo giáo trình...' : 'Tạo giáo trình cá nhân hóa'}
              </button>
            )}
            <button onClick={startNewAssessment} className={`${theme.buttonRadius} bg-gray-100 px-5 py-3 font-bold text-gray-700 hover:bg-gray-200`}>
              <RotateCcw className="mr-2 inline h-4 w-4" /> Làm bài mới
            </button>
            <Link href="/dashboard" className={`${theme.buttonRadius} bg-gray-100 px-5 py-3 font-bold text-gray-700 hover:bg-gray-200`}>
              Về tổng quan
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'taking' && assessment) {
    return (
      <div className={`max-w-3xl mx-auto ${theme.sectionGap}`}>
        <div>
          <h1 className={`text-2xl ${theme.fontWeight} text-gray-900`}>{assessment.title || 'Bài kiểm tra đầu vào'}</h1>
          <p className="mt-1 text-gray-500">Trả lời trực tiếp từng câu. Câu trắc nghiệm chọn một đáp án, câu tự luận nhập lời giải ngắn gọn.</p>
        </div>

        {error && <div className="rounded-xl bg-red-50 p-4 text-red-700">{error}</div>}

        <div className="rounded-full bg-gray-100 p-1">
          <div className="rounded-full bg-blue-600 px-3 py-1 text-center text-sm font-bold text-white transition-all" style={{ width: `${Math.max(8, (answeredCount / questions.length) * 100)}%` }}>
            {answeredCount}/{questions.length}
          </div>
        </div>

        <div className="space-y-4">
          {questions.map((question, index) => {
            const questionId = getDocumentId(question);
            const choices = normalizeChoices(question);
            const isMultipleChoice = question.question_type === 'multiple_choice' && choices.length > 0;

            return (
              <section key={questionId || index} className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm`}>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">Câu {index + 1}</span>
                </div>

                <MathMarkdown className="text-lg font-bold text-gray-900" content={question.question_text} />

                {isMultipleChoice ? (
                  <div className="mt-4 space-y-3">
                    {choices.map((choice, choiceIndex) => {
                      const isSelected = answers[questionId] === choice;
                      return (
                        <button
                          key={`${questionId}-${choiceIndex}`}
                          type="button"
                          onClick={() => updateAnswer(questionId, choice)}
                          className={`flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'}`}
                        >
                          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold ${isSelected ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                            {optionLetters[choiceIndex] ?? choiceIndex + 1}
                          </span>
                          <MathMarkdown className="min-w-0 flex-1 font-medium text-gray-800" content={choice} />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <textarea
                    value={answers[questionId] ?? ''}
                    onChange={(event) => updateAnswer(questionId, event.target.value)}
                    rows={4}
                    className="mt-4 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="Nhập câu trả lời hoặc lời giải của bạn..."
                  />
                )}
              </section>
            );
          })}
        </div>

        <div className="sticky bottom-4 rounded-2xl border border-blue-100 bg-white/95 p-4 shadow-lg backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">Đã trả lời {answeredCount}/{questions.length} câu. Có thể nộp khi đã làm ít nhất 1 câu.</p>
            <button
              onClick={submit}
              disabled={!canSubmit}
              className={`${theme.buttonRadius} bg-blue-600 px-6 py-3 font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Send className="mr-2 inline h-4 w-4" /> Nộp bài
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'submitting') {
    return (
      <div className={`max-w-2xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm text-center`}>
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-600" />
          <h1 className={`mt-4 text-2xl ${theme.fontWeight} text-gray-900`}>Đang nộp và chấm bài</h1>
          <p className="mt-2 text-gray-500">AI có thể cần thêm thời gian để chấm câu tự luận và phân tích kết quả.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`max-w-3xl mx-auto ${theme.sectionGap}`}>
      <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm`}>
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-blue-50 p-3 text-blue-600">
            <Target className="h-8 w-8" />
          </div>
          <div>
            <h1 className={`text-2xl ${theme.fontWeight} text-gray-900`}>Test đầu vào</h1>
            <p className="mt-2 text-gray-500">
              Bài đánh giá dùng dữ liệu thật để tạo đề theo hồ sơ học sinh, lưu câu trả lời, nộp bài và nhận phân tích sau khi chấm.
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <InfoCard icon={<Sparkles className="h-5 w-5" />} title="Tạo đề cá nhân hóa" text="5–10 câu trắc nghiệm và tự luận." />
          <InfoCard icon={<BookOpen className="h-5 w-5" />} title="Làm trực tiếp" text="Chọn đáp án hoặc nhập lời giải." />
          <InfoCard icon={<CheckCircle2 className="h-5 w-5" />} title="Chấm và phân tích" text="Lưu điểm, lỗi sai và khuyến nghị." />
        </div>

        {latestResult && (
          <div className="mt-6 rounded-2xl bg-emerald-50 p-4 text-emerald-900">
            <p className="font-bold">Bạn đã có kết quả gần nhất: {Math.round(Number(latestResult.percentage ?? 0))}%</p>
            <p className="mt-1 text-sm">Có thể tạo giáo trình cá nhân hóa từ kết quả này hoặc làm bài mới để cập nhật năng lực đầu vào.</p>
          </div>
        )}

        {curriculumError && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{curriculumError}</p>}

        <div className="mt-6 flex flex-wrap gap-3">
          <button onClick={startNewAssessment} className={`${theme.buttonRadius} bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700`}>
            Bắt đầu kiểm tra đầu vào
          </button>
          {latestResult && (
            <>
              <button
                type="button"
                onClick={createPersonalizedCurriculum}
                disabled={creatingCurriculum}
                className={`${theme.buttonRadius} bg-emerald-600 px-6 py-3 font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {creatingCurriculum ? 'Đang tạo giáo trình...' : 'Tạo giáo trình cá nhân hóa'}
              </button>
              <button onClick={() => setStep('result')} className={`${theme.buttonRadius} bg-gray-100 px-6 py-3 font-bold text-gray-700 hover:bg-gray-200`}>
                Xem kết quả gần nhất
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <div className="text-blue-600">{icon}</div>
      <p className="mt-2 font-bold text-gray-900">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{text}</p>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4 text-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-gray-900">{value}</p>
    </div>
  );
}

function AnalysisList({ title, items, empty, tone }: { title: string; items: string[]; empty: string; tone: 'green' | 'amber' }) {
  const color = tone === 'green' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900';

  return (
    <div className={`rounded-2xl p-4 ${color}`}>
      <p className="font-bold">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm opacity-80">{empty}</p>
      )}
    </div>
  );
}
