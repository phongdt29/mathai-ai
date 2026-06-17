'use client';

import { useEffect, useMemo, useState } from 'react';
import { Triangle, Ruler, TrendingUp, Dice5, Trophy, Target, Flame, Zap, Brain, Diamond, Star, Clock, CheckCircle, BarChart3, Sparkles, Medal } from 'lucide-react';
import { useAgeTheme } from '@/contexts/AgeThemeContext';
import { getDashboardStats, getLatestAssessmentResult, getTopicMastery, type AssessmentAttempt, type DashboardStats, type TopicMastery } from '@/lib/api';

const skillIcons = [Triangle, Ruler, TrendingUp, Dice5, Brain, Target];
const skillStyles = [
  { color: 'bg-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
  { color: 'bg-emerald-500', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  { color: 'bg-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
  { color: 'bg-amber-500', bg: 'bg-amber-50', border: 'border-amber-200' },
  { color: 'bg-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' },
  { color: 'bg-cyan-500', bg: 'bg-cyan-50', border: 'border-cyan-200' },
];

const defaultStats: DashboardStats = {
  total_lessons: 0,
  completed_lessons: 0,
  completion_percentage: 0,
  average_quiz_score: null,
  total_study_time_minutes: 0,
  current_streak_days: 0,
  longest_streak_days: 0,
};

const motivationalMessages = [
  'Bạn đang làm tuyệt vời lắm!',
  'Cố lên nào, siêu sao toán học!',
  'Mỗi ngày một tiến bộ!',
];

function formatScore(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${Math.round(numeric)}%`;
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  if (hours <= 0) return '0h';
  return `${hours.toFixed(hours >= 10 ? 0 : 1)}h`;
}

function formatChartHours(hours: number): string {
  if (hours <= 0) return '0h';
  return `${hours}h`;
}

function buildWeekData(totalStudyMinutes: number) {
  const labels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  if (totalStudyMinutes <= 0) return labels.map(day => ({ day, hours: 0 }));
  const totalHours = totalStudyMinutes / 60;
  const weights = [0.12, 0.14, 0.11, 0.15, 0.16, 0.2, 0.12];
  return labels.map((day, index) => ({
    day,
    hours: Number((totalHours * weights[index]).toFixed(1)),
  }));
}

export default function ProgressPage() {
  const [mounted, setMounted] = useState(false);
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [mastery, setMastery] = useState<TopicMastery[]>([]);
  const [latestAssessment, setLatestAssessment] = useState<AssessmentAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { theme, ageGroup } = useAgeTheme();

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchProgress() {
      try {
        setError(null);
        const [statsData, masteryData, assessmentData] = await Promise.all([
          getDashboardStats(),
          getTopicMastery(),
          getLatestAssessmentResult(),
        ]);
        if (!cancelled) {
          setStats(statsData);
          setMastery(masteryData);
          setLatestAssessment(assessmentData);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Không tải được tiến độ học tập');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProgress();
    return () => { cancelled = true; };
  }, []);

  const weeklyData = useMemo(() => buildWeekData(stats.total_study_time_minutes), [stats.total_study_time_minutes]);
  const maxHours = Math.max(1, ...weeklyData.map(d => d.hours));
  const totalHours = stats.total_study_time_minutes / 60;
  const skills = useMemo(() => {
    const topicCounts = new Map<string, number>();
    for (const item of mastery) {
      topicCounts.set(item.topic, (topicCounts.get(item.topic) ?? 0) + 1);
    }

    return mastery.map((item, index) => {
      const style = skillStyles[index % skillStyles.length];
      const hasDuplicateTopic = (topicCounts.get(item.topic) ?? 0) > 1;
      const name =
        hasDuplicateTopic && item.grade_level != null
          ? `${item.topic} (Lớp ${item.grade_level})`
          : item.topic;

      return {
        key: String(
          item._id || item.id || `${item.topic}-${item.grade_level ?? index}`,
        ),
        name,
        level: Math.max(
          0,
          Math.min(100, Math.round(Number(item.mastery_level || 0))),
        ),
        icon: skillIcons[index % skillIcons.length],
        ...style,
        attempts: item.total_attempts ?? 0,
        correct: item.correct_attempts ?? 0,
        strength: item.strength_label,
      };
    });
  }, [mastery]);

  const motivationalMessageIndex = mastery.length % motivationalMessages.length;

  const achievements = [
    { icon: Trophy, label: 'Hoàn thành bài học', desc: `${stats.completed_lessons}/${stats.total_lessons} bài`, unlocked: stats.completed_lessons > 0 },
    { icon: Target, label: 'Có mastery thật', desc: mastery.length > 0 ? `${mastery.length} chủ đề` : 'Chưa có chủ đề', unlocked: mastery.length > 0 },
    { icon: Flame, label: 'Streak học tập', desc: `${stats.current_streak_days} ngày hiện tại`, unlocked: stats.current_streak_days > 0 },
    { icon: Zap, label: 'Điểm quiz TB', desc: stats.average_quiz_score === null ? 'Chưa có quiz' : formatScore(stats.average_quiz_score), unlocked: stats.average_quiz_score !== null },
    { icon: Brain, label: 'Đánh giá đầu vào', desc: latestAssessment ? formatScore(latestAssessment.percentage) : 'Chưa làm', unlocked: Boolean(latestAssessment) },
    { icon: Diamond, label: 'Điểm thưởng', desc: `${stats.points?.reward_points ?? 0} điểm`, unlocked: Boolean(stats.points?.reward_points) },
  ];

  const renderStatCards = () => {
    const statCards = [
      { icon: Clock, value: formatHours(stats.total_study_time_minutes), label: 'Tổng thời gian', bg: 'bg-blue-50', border: 'border-blue-200', textColor: 'text-blue-700' },
      { icon: CheckCircle, value: String(stats.completed_lessons), label: 'Bài hoàn thành', bg: 'bg-emerald-50', border: 'border-emerald-200', textColor: 'text-emerald-700' },
      { icon: Flame, value: String(stats.current_streak_days), label: 'Ngày streak', bg: 'bg-amber-50', border: 'border-amber-200', textColor: 'text-amber-700' },
    ];

    if (ageGroup === 'elementary') {
      return (
        <div className="grid grid-cols-3 gap-4">
          {statCards.map((s) => (
            <div key={s.label} className={`${s.bg} border-2 ${s.border} text-center ${theme.cardRadius} p-5`}>
              <s.icon className="w-6 h-6" />
              <div className={`${theme.fontWeight} mt-2 ${s.textColor} text-2xl`}>{loading ? '...' : s.value}</div>
              <div className="text-sm text-gray-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="grid grid-cols-3 gap-3">
        {statCards.map((s) => (
          <div key={s.label} className={`${ageGroup === 'high' ? theme.cardBg : s.bg} ${theme.cardBorder} text-center ${theme.cardRadius} ${theme.cardPadding}`}>
            {ageGroup !== 'high' && <s.icon className="w-6 h-6" />}
            <div className={`${ageGroup === 'high' ? 'font-semibold text-gray-900' : `${theme.fontWeight} ${s.textColor}`} text-2xl mt-1`}>{loading ? '...' : s.value}</div>
            <div className="text-sm text-gray-500 mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderChart = () => {
    const barColors = ['bg-pink-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-cyan-400', 'bg-blue-500', 'bg-purple-400'];
    const hasStudyTime = totalHours > 0;
    const title = hasStudyTime
      ? 'Phân bổ thời gian học đã ghi nhận'
      : 'Chưa có thời gian học được ghi nhận';
    const chartHeight = ageGroup === 'elementary' ? 'h-44' : 'h-36';

    return (
      <div className={`${theme.cardBg} ${theme.cardBorder} ${theme.cardRadius} ${ageGroup === 'elementary' ? 'p-6' : 'p-5'}`}>
        <h2 className={`${ageGroup === 'elementary' ? 'font-bold text-2xl' : 'font-semibold text-2xl'} text-gray-900 mb-3`}>
          {theme.showEmojis && <BarChart3 className="w-5 h-5 inline mr-1" />}{title}
        </h2>
        {!hasStudyTime && (
          <p className="mb-4 text-sm leading-6 text-gray-500">
            Hoàn thành bài học hoặc làm bài tập để hệ thống ghi nhận thời gian học theo tuần.
          </p>
        )}
        <div className={`flex gap-2 ${chartHeight}`}>
          {weeklyData.map((d, i) => {
            const isToday = i === 5;
            const barPercent = hasStudyTime
              ? Math.max(10, (d.hours / maxHours) * 100)
              : 0;

            return (
              <div
                key={d.day}
                className="flex h-full min-w-0 flex-1 flex-col items-center gap-1"
              >
                <span className="text-xs font-semibold text-gray-500">
                  {formatChartHours(d.hours)}
                </span>
                <div className="flex w-full flex-1 items-end">
                  <div
                    className={`w-full rounded-md transition-all duration-700 ease-out ${
                      hasStudyTime
                        ? ageGroup === 'high'
                          ? isToday
                            ? 'bg-gray-900'
                            : 'bg-gray-300'
                          : barColors[i]
                        : 'bg-gray-100'
                    }`}
                    style={{
                      height: mounted
                        ? hasStudyTime
                          ? `${barPercent}%`
                          : '8px'
                        : '0%',
                      transitionDelay: `${i * 80}ms`,
                    }}
                  />
                </div>
                <span
                  className={`text-sm font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}
                >
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSkills = () => {
    const title = 'Mức độ thành thạo';
    const empty = !loading && skills.length === 0;

    return (
      <div className={`${theme.cardBg} ${theme.cardBorder} ${theme.cardRadius} ${ageGroup === 'elementary' ? 'p-6' : 'p-5'}`}>
        <h2 className={`${ageGroup === 'elementary' ? 'font-bold text-2xl' : 'font-semibold text-2xl'} text-gray-900 mb-4`}>
          {theme.showEmojis && <Target className="w-5 h-5 inline mr-1" />}{title}
        </h2>
        {loading && <div className="h-24 bg-gray-100 rounded animate-pulse" />}
        {empty && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-5 text-gray-600">
            Chưa có dữ liệu mastery thật. Kết quả sẽ xuất hiện sau khi học sinh làm assessment hoặc bài tập được ghi nhận vào topic mastery.
          </div>
        )}
        {!loading && skills.length > 0 && (
          <div className="space-y-4">
            {skills.map((skill, i) => (
              <div key={skill.key} className={`${ageGroup === 'high' ? '' : `${skill.bg} border ${skill.border} p-3 rounded-xl`} transition-all duration-500 ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`} style={{ transitionDelay: `${i * 100}ms` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {ageGroup !== 'high' && <skill.icon className="w-6 h-6" />}
                    <span className="text-lg font-bold text-gray-700">{skill.name}</span>
                  </div>
                  <span className="text-lg font-bold text-gray-900">{skill.level}%</span>
                </div>
                <div className={`w-full ${theme.progressHeight} ${theme.progressRadius} bg-gray-100 overflow-hidden`}>
                  <div className={`h-full ${theme.progressRadius} ${ageGroup === 'high' ? 'bg-gray-900' : skill.color} transition-all duration-1000 ease-out`} style={{ width: mounted ? `${skill.level}%` : '0%', transitionDelay: `${i * 150 + 300}ms` }} />
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {skill.attempts > 0 ? `${skill.correct}/${skill.attempts} lượt đúng` : 'Chưa có lượt luyện tập'}{skill.strength ? ` · ${skill.strength}` : ''}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderAchievements = () => {
    return (
      <div className={`${theme.cardBg} ${theme.cardBorder} ${theme.cardRadius} ${ageGroup === 'elementary' ? 'p-6' : 'p-5'}`}>
        <h2 className={`${ageGroup === 'elementary' ? 'font-bold text-2xl' : 'font-semibold text-2xl'} text-gray-900 mb-4`}>
          {theme.showEmojis && <Medal className="w-5 h-5 inline mr-1" />}Thành tích theo dữ liệu thật
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {achievements.map((a) => (
            <div key={a.label} className={`flex flex-col items-center text-center ${theme.cardPadding} rounded-xl ${theme.cardBorder} transition-all ${a.unlocked ? 'bg-blue-100 shadow-sm' : 'bg-gray-50 opacity-60 grayscale'}`}>
              <span className="mb-2 relative text-4xl">
                <a.icon className="w-8 h-8" />
                {a.unlocked && theme.showAnimations && <Sparkles className="absolute -top-1 -right-1 animate-ping w-4 h-4 text-yellow-400" />}
              </span>
              <span className="text-base font-bold text-gray-700">{a.label}</span>
              <span className="text-sm text-gray-400 mt-0.5">{a.desc}</span>
              {a.unlocked && <span className="mt-2 text-sm font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Đã ghi nhận</span>}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`flex flex-col ${theme.sectionGap}`}>
      <div>
        <h1 className="font-bold text-gray-900 text-2xl">
          {ageGroup === 'elementary' && 'Tiến độ học tập của bạn'}
          {ageGroup === 'middle' && 'Tiến độ học tập'}
          {ageGroup === 'high' && 'Tiến độ học tập'}
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {ageGroup === 'elementary' && 'Xem mình giỏi cỡ nào nè!'}
          {ageGroup === 'middle' && 'Theo dõi quá trình và chinh phục thành tích mới!'}
          {ageGroup === 'high' && 'Phân tích kết quả học tập và theo dõi tiến trình.'}
        </p>
      </div>

      {error && <div className={`${theme.cardRadius} border border-red-200 bg-red-50 p-4 text-red-700`}>{error}</div>}

      {ageGroup === 'elementary' && theme.showMascot && (
        <div className={`flex items-center gap-3 bg-yellow-50 border-2 border-yellow-200 p-4 ${theme.cardRadius}`}>
          <Star className="w-10 h-10 text-yellow-500" />
          <p className="font-bold text-lg text-gray-800">
            {mastery.length > 0 ? motivationalMessages[motivationalMessageIndex] : 'Làm assessment và bài tập để mở dữ liệu tiến độ thật nhé!'}
          </p>
        </div>
      )}

      <div className={`${theme.cardRadius} bg-white border border-gray-100 p-4`}>
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <div className="text-sm text-gray-500">Hoàn thành giáo trình</div>
            <div className="text-2xl font-bold text-gray-900">{stats.completion_percentage}%</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Điểm assessment gần nhất</div>
            <div className="text-2xl font-bold text-gray-900">{latestAssessment ? formatScore(latestAssessment.percentage) : 'Chưa có'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-500">Điểm năng lực</div>
            <div className="text-2xl font-bold text-gray-900">{stats.points ? `${stats.points.competency_score}%` : 'Chưa có'}</div>
          </div>
        </div>
      </div>

      {renderStatCards()}
      {renderChart()}
      {renderSkills()}
      {renderAchievements()}
    </div>
  );
}
