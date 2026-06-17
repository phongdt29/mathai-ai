'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, CheckCircle2, Clock, Layers, Loader2, RefreshCcw, Sparkles, Target, AlertCircle } from 'lucide-react';
import { useAgeTheme } from '@/contexts/AgeThemeContext';
import {
  generateCurriculum,
  getActiveCurriculum,
  getCurriculumDetail,
  getLatestAssessmentResult,
  listCurricula,
  type AssessmentAttempt,
  type Curriculum,
  type CurriculumModule,
} from '@/lib/api';

type PageState = 'loading' | 'ready' | 'empty' | 'generating' | 'error';

function getDocumentId(value: { id?: string; _id?: string }) {
  return value.id ?? value._id ?? '';
}

function formatDate(value?: string | null) {
  if (!value) return 'Chưa rõ';

  try {
    return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return 'Chưa rõ';
  }
}

function normalizeModules(curriculum: Curriculum | null): CurriculumModule[] {
  return [...(curriculum?.modules ?? [])].sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0));
}

function countLessons(curriculum: Curriculum | null) {
  const modules = curriculum?.modules ?? [];
  const lessonCount = modules.reduce((sum, module) => sum + (module.lessons?.length ?? 0), 0);
  return lessonCount || curriculum?.estimated_total_sessions || 0;
}

function hasGradedAssessment(result: AssessmentAttempt | null) {
  return result?.status === 'graded' || result?.percentage !== undefined || result?.ai_analysis !== undefined;
}

function parseAnalysisList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function curriculumStatusLabel(status?: string | null) {
  switch (status) {
    case 'active':
      return 'Đang học';
    case 'completed':
      return 'Hoàn thành';
    case 'archived':
      return 'Đã lưu trữ';
    case 'draft':
      return 'Bản nháp';
    default:
      return 'Chưa rõ';
  }
}

function moduleStatusLabel(status?: string | null) {
  switch (status) {
    case 'active':
      return 'Đang học';
    case 'completed':
      return 'Hoàn thành';
    case 'locked':
      return 'Chưa mở';
    case 'pending':
      return 'Chưa bắt đầu';
    default:
      return 'Chưa bắt đầu';
  }
}

// Module 3 — nhãn giai đoạn lộ trình học.
function stageLabel(stage?: string | null) {
  switch (stage) {
    case 'foundation':
      return 'Ôn nền tảng';
    case 'consolidation':
      return 'Củng cố';
    case 'advanced':
      return 'Nâng cao';
    case 'practice':
      return 'Luyện đề';
    default:
      return '';
  }
}

function lessonStatusLabel(status?: string | null) {
  switch (status) {
    case 'available':
      return 'Có thể học';
    case 'scheduled':
      return 'Sẵn sàng';
    case 'in_progress':
      return 'Đang học';
    case 'completed':
      return 'Hoàn thành';
    case 'skipped':
      return 'Đã bỏ qua';
    default:
      return 'Chưa bắt đầu';
  }
}

function lessonActionLabel(status?: string | null) {
  if (status === 'completed') return 'Ôn lại bài';
  if (status === 'in_progress') return 'Tiếp tục học';
  return 'Bắt đầu học';
}

export default function CurriculumPage() {
  const { theme, ageGroup } = useAgeTheme();
  const [state, setState] = useState<PageState>('loading');
  const [activeCurriculum, setActiveCurriculum] = useState<Curriculum | null>(null);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [latestAssessment, setLatestAssessment] = useState<AssessmentAttempt | null>(null);
  const [error, setError] = useState('');

  const modules = useMemo(() => normalizeModules(activeCurriculum), [activeCurriculum]);
  const totalLessons = countLessons(activeCurriculum);
  const completedModules = modules.filter((module) => module.status === 'completed').length;
  const assessmentReady = hasGradedAssessment(latestAssessment);
  const isElementary = ageGroup === 'elementary';

  const loadCurriculum = async () => {
    setState('loading');
    setError('');

    try {
      const [active, allCurricula, assessmentResult] = await Promise.all([
        getActiveCurriculum(),
        listCurricula(),
        getLatestAssessmentResult(),
      ]);

      let curriculumWithDetail = active;
      const activeId = active ? getDocumentId(active) : '';

      if (activeId) {
        curriculumWithDetail = await getCurriculumDetail(activeId);
      }

      setActiveCurriculum(curriculumWithDetail);
      setCurricula(allCurricula);
      setLatestAssessment(assessmentResult);
      setState(curriculumWithDetail ? 'ready' : 'empty');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Không tải được giáo trình.');
      setState('error');
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [active, allCurricula, assessmentResult] = await Promise.all([
          getActiveCurriculum(),
          listCurricula(),
          getLatestAssessmentResult(),
        ]);

        if (cancelled) return;

        let curriculumWithDetail = active;
        const activeId = active ? getDocumentId(active) : '';

        if (activeId) {
          curriculumWithDetail = await getCurriculumDetail(activeId);
        }

        if (cancelled) return;

        setActiveCurriculum(curriculumWithDetail);
        setCurricula(allCurricula);
        setLatestAssessment(assessmentResult);
        setState(curriculumWithDetail ? 'ready' : 'empty');
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không tải được giáo trình.');
          setState('error');
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const createPersonalizedCurriculum = async () => {
    setState('generating');
    setError('');

    try {
      const created = await generateCurriculum({
        title: 'Giáo trình toán cá nhân hóa',
        total_modules: 4,
        lessons_per_module: 4,
        exercises_per_lesson: 5,
        target_goal: latestAssessment?.ai_analysis?.recommendations || undefined,
        skill_strengths: parseAnalysisList(latestAssessment?.ai_analysis?.strengths),
        skill_weaknesses: parseAnalysisList(latestAssessment?.ai_analysis?.weaknesses),
        include_end_of_lesson_quiz: true,
      });
      const createdId = getDocumentId(created);
      const detail = createdId ? await getCurriculumDetail(createdId) : created;
      const allCurricula = await listCurricula();

      setActiveCurriculum(detail);
      setCurricula(allCurricula);
      setState('ready');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Chưa tạo được giáo trình. Vui lòng thử lại sau.');
      setState('empty');
    }
  };

  if (state === 'loading') {
    return (
      <div className={`max-w-3xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm text-center`}>
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-blue-600" />
          <p className="mt-3 text-gray-500">Đang tải giáo trình cá nhân hóa...</p>
        </div>
      </div>
    );
  }

  if (state === 'generating') {
    return (
      <div className={`max-w-3xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm text-center`}>
          <Sparkles className="mx-auto h-12 w-12 animate-pulse text-blue-600" />
          <h1 className={`mt-4 text-2xl ${theme.fontWeight} text-gray-900`}>Đang tạo giáo trình cá nhân hóa</h1>
          <p className="mt-2 text-gray-500">AI đang dùng hồ sơ học sinh và kết quả đánh giá đầu vào mới nhất để tạo lộ trình học.</p>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className={`max-w-3xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-red-100 ${theme.cardPadding} shadow-sm`}>
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-1 h-6 w-6 text-red-600" />
            <div>
              <h1 className={`text-2xl ${theme.fontWeight} text-gray-900`}>Chưa tải được giáo trình</h1>
              <p className="mt-2 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={loadCurriculum} className={`${theme.buttonRadius} bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-700`}>
              <RefreshCcw className="mr-2 inline h-4 w-4" /> Thử lại
            </button>
            <Link href="/dashboard/assessment" className={`${theme.buttonRadius} bg-gray-100 px-5 py-3 font-bold text-gray-700 hover:bg-gray-200`}>
              Về đánh giá đầu vào
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (state === 'empty') {
    return (
      <div className={`max-w-4xl mx-auto ${theme.sectionGap}`}>
        <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-bold text-blue-700">
                <Target className="h-4 w-4" /> Lộ trình cá nhân hóa
              </div>
              <h1 className={`mt-4 text-2xl ${theme.fontWeight} text-gray-900`}>Chưa có giáo trình cá nhân hóa</h1>
              <p className="mt-2 text-gray-500">
                Khi có kết quả đánh giá đầu vào, hệ thống sẽ tạo giáo trình học thật gồm chương, bài học, nội dung tự học và bài tập thực hành.
              </p>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-bold text-gray-900">Kết quả đánh giá</p>
              <p className="mt-1">{assessmentReady ? `Đã có kết quả gần nhất: ${Math.round(Number(latestAssessment?.percentage ?? 0))}%` : 'Chưa có kết quả đánh giá đã chấm.'}</p>
            </div>
          </div>

          {error && <p className="mt-5 rounded-xl bg-amber-50 p-4 text-amber-800">{error}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            {assessmentReady ? (
              <button onClick={createPersonalizedCurriculum} className={`${theme.buttonRadius} bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700`}>
                <Sparkles className="mr-2 inline h-4 w-4" /> Tạo giáo trình cá nhân hóa
              </button>
            ) : (
              <Link href="/dashboard/assessment" className={`${theme.buttonRadius} bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-700`}>
                Làm đánh giá đầu vào trước
              </Link>
            )}
            <button onClick={loadCurriculum} className={`${theme.buttonRadius} bg-gray-100 px-6 py-3 font-bold text-gray-700 hover:bg-gray-200`}>
              Kiểm tra lại
            </button>
          </div>
        </div>

        {curricula.length > 0 && (
          <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm`}>
            <h2 className="text-lg font-bold text-gray-900">Giáo trình đã tạo trước đây</h2>
            <div className="mt-4 divide-y divide-gray-100">
              {curricula.map((curriculum) => (
                <div key={getDocumentId(curriculum) || curriculum.title} className="py-3">
                  <p className="font-semibold text-gray-900">{curriculum.title}</p>
                  <p className="text-sm text-gray-500">Trạng thái: {curriculumStatusLabel(curriculum.status)} • Cập nhật: {formatDate(curriculum.updatedAt ?? curriculum.updated_at)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${theme.sectionGap}`}>
      <div className={`${theme.cardRadius} bg-white border border-blue-100 ${theme.cardPadding} shadow-sm`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" /> Giáo trình đang hoạt động
            </div>
            <h1 className={`mt-4 text-2xl ${theme.fontWeight} text-gray-900`}>{activeCurriculum?.title || 'Giáo trình cá nhân hóa'}</h1>
            <p className="mt-2 max-w-3xl text-gray-500">{activeCurriculum?.ai_summary || 'Giáo trình được tạo từ kết quả đánh giá đầu vào, có bài học và bài tập thực hành để học ngay.'}</p>
            {activeCurriculum?.target_goal && (
              <p className="mt-3 rounded-2xl bg-blue-50 p-4 text-blue-900"><span className="font-bold">Mục tiêu:</span> {activeCurriculum.target_goal}</p>
            )}
          </div>
          <button onClick={loadCurriculum} className={`${theme.buttonRadius} bg-gray-100 px-5 py-3 font-bold text-gray-700 hover:bg-gray-200`}>
            <RefreshCcw className="mr-2 inline h-4 w-4" /> Làm mới
          </button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <SummaryCard icon={<Layers className="h-5 w-5" />} label="Chương" value={`${modules.length}`} />
          <SummaryCard icon={<BookOpen className="h-5 w-5" />} label="Bài học" value={`${totalLessons}`} />
          <SummaryCard icon={<CheckCircle2 className="h-5 w-5" />} label="Hoàn thành" value={`${completedModules}/${modules.length}`} />
          <SummaryCard icon={<Clock className="h-5 w-5" />} label="Cập nhật" value={formatDate(activeCurriculum?.updatedAt ?? activeCurriculum?.updated_at)} />
        </div>
      </div>

      {modules.length === 0 ? (
        <div className={`${theme.cardRadius} bg-white border border-amber-100 ${theme.cardPadding} shadow-sm text-amber-900`}>
          Giáo trình đã được tạo nhưng chưa có chương học. Vui lòng thử tạo lại.
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {modules.map((module, index) => {
            const lessons = module.lessons ?? [];
            return (
              <section key={getDocumentId(module) || `${module.module_title}-${index}`} className={`${theme.cardRadius} overflow-hidden bg-white border border-blue-100 shadow-sm`}>
                <div className={`${module.status === 'active' ? 'bg-blue-600' : module.status === 'completed' ? 'bg-emerald-600' : 'bg-slate-600'} px-5 py-4 text-white`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold opacity-80">Chương {module.order_index ?? index + 1}</p>
                        {stageLabel(module.stage) && (
                          <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold">
                            {stageLabel(module.stage)}
                          </span>
                        )}
                      </div>
                      <h2 className={`${isElementary ? 'text-2xl' : 'text-xl'} font-bold`}>{module.module_title}</h2>
                    </div>
                    <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold">{moduleStatusLabel(module.status)}</span>
                  </div>
                  {module.module_description && <p className="mt-2 text-white/85">{module.module_description}</p>}
                </div>

                <div className={theme.cardPadding}>
                  <div className="mb-4 flex flex-wrap gap-2 text-sm">
                    {module.topic && <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">{module.topic}</span>}
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-600">{lessons.length || module.estimated_sessions || 0} bài</span>
                  </div>

                  {lessons.length > 0 ? (
                    <ol className="space-y-3">
                      {lessons.map((lesson, lessonIndex) => {
                        const lessonId = getDocumentId(lesson);
                        return (
                          <li key={lessonId || `${lesson.lesson_title}-${lessonIndex}`}>
                            <Link
                              href={lessonId ? `/dashboard/lessons/${lessonId}` : '/dashboard/lessons'}
                              className="block rounded-2xl border border-gray-100 bg-gray-50 p-4 transition hover:border-blue-200 hover:bg-blue-50"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400">Bài {lesson.order_index ?? lessonIndex + 1}</p>
                                  <p className="font-bold text-gray-900">{lesson.lesson_title}</p>
                                  {lesson.lesson_objective && <p className="mt-1 text-sm text-gray-500">{lesson.lesson_objective}</p>}
                                </div>
                                <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-bold text-gray-600 ring-1 ring-gray-200">{lessonStatusLabel(lesson.status)}</span>
                              </div>
                              <div className="mt-3 inline-flex rounded-full bg-blue-600 px-3 py-1 text-sm font-bold text-white">
                                {lessonActionLabel(lesson.status)}
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ol>
                  ) : (
                    <p className="rounded-2xl bg-amber-50 p-4 text-amber-800">Chương này chưa có danh sách bài học. Vui lòng thử làm mới.</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-4">
      <div className="text-blue-600">{icon}</div>
      <p className="mt-2 text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-xl font-extrabold text-gray-900">{value}</p>
    </div>
  );
}
