'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { ContentDifficultyLevel, contentLibraryApi, getTemplateId } from '@/lib/content-library';

export default function CurriculumTemplateForm({ basePath }: { basePath: '/admin/content-library' | '/teacher/content-library' }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '',
    grade_level: 6,
    age_group: '',
    subject: 'math',
    difficulty_level: 'medium' as ContentDifficultyLevel,
    target_goal: '',
    total_modules: 4,
    lessons_per_module: 4,
    exercises_per_lesson: 5,
    topics: '',
    teaching_style: '',
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await contentLibraryApi.generateCurriculumTemplate({
        title: form.title.trim() || undefined,
        grade_level: Number(form.grade_level),
        age_group: form.age_group.trim() || undefined,
        subject: form.subject.trim() || 'math',
        difficulty_level: form.difficulty_level,
        target_goal: form.target_goal.trim() || undefined,
        total_modules: Number(form.total_modules),
        lessons_per_module: Number(form.lessons_per_module),
        exercises_per_lesson: Number(form.exercises_per_lesson),
        topics: form.topics.split(',').map((item) => item.trim()).filter(Boolean),
        teaching_style: form.teaching_style.trim() || undefined,
      });
      router.push(`${basePath}/curricula/${getTemplateId(res.data)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo giáo trình bằng AI');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tạo giáo trình bằng AI</h1>
        <p className="mt-1 text-sm text-gray-500">Nhập yêu cầu, AI sẽ tạo curriculum template gồm module, bài học và bài tập mẫu.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <label className="text-sm font-semibold text-gray-700">Tiêu đề mong muốn</label>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500" placeholder="Ví dụ: Nền tảng phân số lớp 6" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="text-sm font-semibold text-gray-700">Khối lớp</label><input type="number" min={1} max={12} value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          <div><label className="text-sm font-semibold text-gray-700">Độ khó</label><select value={form.difficulty_level} onChange={(e) => setForm({ ...form, difficulty_level: e.target.value as ContentDifficultyLevel })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="easy">Cơ bản</option><option value="medium">Trung bình</option><option value="hard">Nâng cao</option></select></div>
          <div><label className="text-sm font-semibold text-gray-700">Nhóm tuổi</label><input value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Tự suy luận nếu bỏ trống" /></div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div><label className="text-sm font-semibold text-gray-700">Số module</label><input type="number" min={1} max={12} value={form.total_modules} onChange={(e) => setForm({ ...form, total_modules: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          <div><label className="text-sm font-semibold text-gray-700">Bài/module</label><input type="number" min={1} max={12} value={form.lessons_per_module} onChange={(e) => setForm({ ...form, lessons_per_module: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          <div><label className="text-sm font-semibold text-gray-700">Bài tập/bài</label><input type="number" min={0} max={20} value={form.exercises_per_lesson} onChange={(e) => setForm({ ...form, exercises_per_lesson: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
        </div>
        <div><label className="text-sm font-semibold text-gray-700">Chủ đề ưu tiên</label><input value={form.topics} onChange={(e) => setForm({ ...form, topics: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Phân số, số thập phân, tỉ lệ..." /></div>
        <div><label className="text-sm font-semibold text-gray-700">Mục tiêu</label><textarea value={form.target_goal} onChange={(e) => setForm({ ...form, target_goal: e.target.value })} className="mt-1 min-h-24 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Học sinh nắm chắc kiến thức nền và luyện tập theo mức độ tăng dần" /></div>
        <div><label className="text-sm font-semibold text-gray-700">Phong cách dạy</label><textarea value={form.teaching_style} onChange={(e) => setForm({ ...form, teaching_style: e.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Thân thiện, nhiều ví dụ thực tế, giải thích từng bước" /></div>
        <button disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
          <Sparkles className="h-4 w-4" /> {loading ? 'AI đang tạo giáo trình...' : 'Tạo giáo trình'}
        </button>
      </form>
    </div>
  );
}
