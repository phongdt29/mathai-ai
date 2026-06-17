'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle, FileText, Loader2, Send, Users } from 'lucide-react';
import ContentAssignmentDialog from './ContentAssignmentDialog';
import { CurriculumTemplate, contentLibraryApi, getTemplateId } from '@/lib/content-library';

const difficultyLabels = { easy: 'Cơ bản', medium: 'Trung bình', hard: 'Nâng cao' } as const;
const statusLabels = { draft: 'Bản nháp', published: 'Đã xuất bản', archived: 'Lưu trữ' } as const;

export default function CurriculumTemplateDetail({ id, basePath }: { id: string; basePath: '/admin/content-library' | '/teacher/content-library' }) {
  const [template, setTemplate] = useState<CurriculumTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [requestingPublish, setRequestingPublish] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const isAdmin = basePath.startsWith('/admin');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await contentLibraryApi.getCurriculumTemplate(id);
      setTemplate(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải giáo trình');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function publish() {
    setPublishing(true);
    setError('');
    setSuccess('');
    try {
      const res = await contentLibraryApi.publishCurriculumTemplate(id);
      setTemplate(res.data);
      setSuccess('Đã xuất bản giáo trình thành công.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể xuất bản giáo trình');
    } finally {
      setPublishing(false);
    }
  }

  async function requestPublish() {
    setRequestingPublish(true);
    setError('');
    setSuccess('');
    try {
      await contentLibraryApi.requestPublishCurriculumTemplate(id);
      setSuccess('Đã gửi yêu cầu duyệt xuất bản giáo trình. Theo dõi trạng thái tại trang Đề xuất.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gửi yêu cầu duyệt xuất bản giáo trình');
    } finally {
      setRequestingPublish(false);
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (error && !template) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>;
  if (!template) return null;

  return (
    <div className="space-y-6">
      <Link href={basePath} className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900"><ArrowLeft className="h-4 w-4" /> Quay lại thư viện</Link>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">{statusLabels[template.status]}</span>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">{template.title}</h1>
            <p className="mt-2 text-sm text-gray-600">{template.description || template.target_goal || 'Chưa có mô tả.'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isAdmin ? (
              <button onClick={publish} disabled={publishing || template.status === 'published'} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60">
                <CheckCircle className="h-4 w-4" /> {template.status === 'published' ? 'Đã xuất bản' : publishing ? 'Đang xuất bản...' : 'Xuất bản'}
              </button>
            ) : (
              <button onClick={requestPublish} disabled={requestingPublish || template.status === 'published'} className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
                <Send className="h-4 w-4" /> {template.status === 'published' ? 'Đã xuất bản' : requestingPublish ? 'Đang gửi...' : 'Gửi duyệt xuất bản'}
              </button>
            )}
            {template.status === 'published' && (
              <button onClick={() => setAssignmentOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                <Users className="h-4 w-4" /> Gán nội dung
              </button>
            )}
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm md:grid-cols-4">
          <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-500">Khối lớp</p><p className="font-semibold text-gray-900">Lớp {template.grade_level}</p></div>
          <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-500">Độ khó</p><p className="font-semibold text-gray-900">{difficultyLabels[template.difficulty_level]}</p></div>
          <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-500">Số buổi</p><p className="font-semibold text-gray-900">{template.estimated_total_sessions ?? 0}</p></div>
          <div className="rounded-xl bg-gray-50 p-3"><p className="text-gray-500">AI model</p><p className="font-semibold text-gray-900">{template.ai_model || 'N/A'}</p></div>
        </div>
      </div>

      {template.status === 'published' && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="font-bold text-blue-950">Gán nội dung cho lớp hoặc học sinh</h2>
              <p className="mt-1 text-sm text-blue-700">Tạo assignment từ giáo trình đã xuất bản để học sinh nhận nội dung theo cơ chế on-demand.</p>
            </div>
            <button onClick={() => setAssignmentOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
              <Users className="h-4 w-4" /> Gán nội dung
            </button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Preview modules</h2>
        {(template.modules || []).map((module) => (
          <div key={getTemplateId(module)} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="font-bold text-gray-900">Module {module.order_index}: {module.module_title}</h3><p className="mt-1 text-sm text-gray-500">{module.module_description || module.topic}</p></div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">{module.estimated_sessions ?? module.lessons?.length ?? 0} buổi</span>
            </div>
            <div className="mt-4 space-y-2">
              {(module.lessons || []).map((lesson) => (
                <Link key={getTemplateId(lesson)} href={`${basePath}/lessons/${getTemplateId(lesson)}`} className="flex items-start gap-3 rounded-xl border border-gray-100 p-3 hover:bg-gray-50">
                  <FileText className="mt-0.5 h-4 w-4 text-emerald-600" />
                  <div><p className="text-sm font-semibold text-gray-900">{lesson.lesson_title}</p><p className="text-xs text-gray-500">{lesson.lesson_objective || lesson.topic} · {lesson.exercises?.length ?? 0} bài tập</p></div>
                </Link>
              ))}
            </div>
          </div>
        ))}
        {(!template.modules || template.modules.length === 0) && <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">Giáo trình chưa có module.</div>}
      </div>

      <ContentAssignmentDialog
        open={assignmentOpen}
        onClose={() => setAssignmentOpen(false)}
        templateType="curriculum_template"
        templateId={getTemplateId(template)}
        templateTitle={template.title}
      />
    </div>
  );
}
