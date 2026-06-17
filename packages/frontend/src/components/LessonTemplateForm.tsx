'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { ContentDifficultyLevel, CurriculumTemplate, contentLibraryApi, getTemplateId } from '@/lib/content-library';

export default function LessonTemplateForm({ basePath }: { basePath: '/admin/content-library' | '/teacher/content-library' }) {
  const router = useRouter();
  const [curricula, setCurricula] = useState<CurriculumTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingCurricula, setLoadingCurricula] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    curriculum_template_id: '',
    module_template_id: '',
    lesson_title: '',
    grade_level: 6,
    age_group: '',
    topic: '',
    difficulty_level: 'medium' as ContentDifficultyLevel,
    estimated_minutes: 45,
    exercises_count: 5,
    learning_objectives: '',
    teaching_style: '',
  });

  useEffect(() => {
    contentLibraryApi.listCurriculumTemplates({ limit: 50 })
      .then((res) => setCurricula(res.data))
      .catch(() => setCurricula([]))
      .finally(() => setLoadingCurricula(false));
  }, []);

  const selectedCurriculum = useMemo(() => curricula.find((item) => getTemplateId(item) === form.curriculum_template_id), [curricula, form.curriculum_template_id]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await contentLibraryApi.generateLessonTemplate({
        curriculum_template_id: form.curriculum_template_id || undefined,
        module_template_id: form.module_template_id || undefined,
        lesson_title: form.lesson_title.trim() || undefined,
        grade_level: Number(form.grade_level),
        age_group: form.age_group.trim() || undefined,
        topic: form.topic.trim(),
        difficulty_level: form.difficulty_level,
        estimated_minutes: Number(form.estimated_minutes),
        exercises_count: Number(form.exercises_count),
        learning_objectives: form.learning_objectives.split('\n').map((item) => item.trim()).filter(Boolean),
        teaching_style: form.teaching_style.trim() || undefined,
      });
      router.push(`${basePath}/lessons/${getTemplateId(res.data)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tạo bài học bằng AI');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Tạo bài học bằng AI</h1><p className="mt-1 text-sm text-gray-500">Có thể gắn vào giáo trình/module đã có hoặc tạo bài học độc lập.</p></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <div><label className="text-sm font-semibold text-gray-700">Giáo trình liên kết (tuỳ chọn)</label><select disabled={loadingCurricula} value={form.curriculum_template_id} onChange={(e) => setForm({ ...form, curriculum_template_id: e.target.value, module_template_id: '' })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="">Tạo bài học độc lập</option>{curricula.map((item) => <option key={getTemplateId(item)} value={getTemplateId(item)}>{item.title}</option>)}</select></div>
          <div><label className="text-sm font-semibold text-gray-700">Module liên kết (tuỳ chọn)</label><select disabled={!selectedCurriculum} value={form.module_template_id} onChange={(e) => setForm({ ...form, module_template_id: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="">Không chọn module</option>{(selectedCurriculum?.modules || []).map((module) => <option key={getTemplateId(module)} value={getTemplateId(module)}>{module.module_title}</option>)}</select></div>
        </div>
        <div><label className="text-sm font-semibold text-gray-700">Tiêu đề bài học</label><input value={form.lesson_title} onChange={(e) => setForm({ ...form, lesson_title: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Ví dụ: Quy đồng mẫu số" /></div>
        <div><label className="text-sm font-semibold text-gray-700">Chủ đề bắt buộc</label><input required value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Phân số, phương trình bậc nhất..." /></div>
        <div className="grid gap-4 md:grid-cols-4">
          <div><label className="text-sm font-semibold text-gray-700">Khối</label><input type="number" min={1} max={12} value={form.grade_level} onChange={(e) => setForm({ ...form, grade_level: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          <div><label className="text-sm font-semibold text-gray-700">Độ khó</label><select value={form.difficulty_level} onChange={(e) => setForm({ ...form, difficulty_level: e.target.value as ContentDifficultyLevel })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"><option value="easy">Cơ bản</option><option value="medium">Trung bình</option><option value="hard">Nâng cao</option></select></div>
          <div><label className="text-sm font-semibold text-gray-700">Phút</label><input type="number" min={10} max={180} value={form.estimated_minutes} onChange={(e) => setForm({ ...form, estimated_minutes: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
          <div><label className="text-sm font-semibold text-gray-700">Bài tập</label><input type="number" min={0} max={20} value={form.exercises_count} onChange={(e) => setForm({ ...form, exercises_count: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
        </div>
        <div><label className="text-sm font-semibold text-gray-700">Nhóm tuổi</label><input value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Tự suy luận nếu bỏ trống" /></div>
        <div><label className="text-sm font-semibold text-gray-700">Mục tiêu học tập (mỗi dòng một mục tiêu)</label><textarea value={form.learning_objectives} onChange={(e) => setForm({ ...form, learning_objectives: e.target.value })} className="mt-1 min-h-24 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" /></div>
        <div><label className="text-sm font-semibold text-gray-700">Phong cách dạy</label><textarea value={form.teaching_style} onChange={(e) => setForm({ ...form, teaching_style: e.target.value })} className="mt-1 min-h-20 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" placeholder="Từng bước, ví dụ trực quan, có kiểm tra nhanh" /></div>
        <button disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"><Sparkles className="h-4 w-4" /> {loading ? 'AI đang tạo bài học...' : 'Tạo bài học'}</button>
      </form>
    </div>
  );
}
