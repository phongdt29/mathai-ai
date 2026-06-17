'use client';

import { FormEvent, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import {
  ContentAssignmentTemplateType,
  ContentAssignmentTargetType,
  contentLibraryApi,
  getAssignmentId,
} from '@/lib/content-library';

interface ContentAssignmentDialogProps {
  open: boolean;
  onClose: () => void;
  templateType: ContentAssignmentTemplateType;
  templateId: string;
  templateTitle: string;
  onAssigned?: () => void;
}

const targetLabels: Record<ContentAssignmentTargetType, string> = {
  class: 'Lớp học',
  student: 'Học sinh',
};

export default function ContentAssignmentDialog({
  open,
  onClose,
  templateType,
  templateId,
  templateTitle,
  onAssigned,
}: ContentAssignmentDialogProps) {
  const [targetType, setTargetType] = useState<ContentAssignmentTargetType>('class');
  const [targetId, setTargetId] = useState('');
  const [autoApplyNewStudents, setAutoApplyNewStudents] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const targetPlaceholder = useMemo(
    () => targetType === 'class' ? 'Nhập class_id ObjectId' : 'Nhập student_id ObjectId',
    [targetType]
  );

  if (!open) return null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');

    const trimmedTargetId = targetId.trim();
    if (!trimmedTargetId) {
      setError(`Vui lòng nhập ${targetType === 'class' ? 'class_id' : 'student_id'}.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await contentLibraryApi.createAssignment({
        template_type: templateType,
        template_id: templateId,
        target_type: targetType,
        target_id: trimmedTargetId,
        auto_apply_new_students: targetType === 'class' ? autoApplyNewStudents : false,
      });
      const assignment = res.data;
      const count = assignment.recipients_count ?? assignment.recipient_mapping?.applied_student_ids?.length ?? assignment.student_contents?.length;
      setSuccess(`Đã gán nội dung thành công${typeof count === 'number' ? ` cho ${count} học sinh` : ''}. Mã assignment: ${getAssignmentId(assignment)}`);
      setTargetId('');
      setNotes('');
      onAssigned?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể gán nội dung');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-100 p-5">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Gán nội dung</h2>
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">{templateTitle}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Đóng dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{success}</div>}

          <div>
            <label className="text-sm font-semibold text-gray-700">Đối tượng nhận</label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['class', 'student'] as const).map((item) => (
                <button
                  type="button"
                  key={item}
                  onClick={() => setTargetType(item)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${targetType === item ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {targetLabels[item]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">{targetType === 'class' ? 'class_id' : 'student_id'}</label>
            <input
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              placeholder={targetPlaceholder}
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1 text-xs text-gray-400">Tạm nhập ID thủ công cho đến khi có selector lớp/học sinh ổn định.</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-gray-700">Ghi chú nội bộ (chưa gửi backend)</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={3}
              placeholder="Ví dụ: giao cho lớp ôn tập chương 2"
              className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
            />
            <p className="mt-1 text-xs text-gray-400">Backend hiện chưa nhận trường notes nên ghi chú chỉ dùng khi thao tác trên dialog.</p>
          </div>

          {targetType === 'class' && (
            <label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={autoApplyNewStudents}
                onChange={(event) => setAutoApplyNewStudents(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="font-semibold">Tự áp dụng cho học sinh mới</span>
                <span className="block text-xs text-gray-500">Khi lớp có học sinh mới, backend sẽ đồng bộ assignment đang active.</span>
              </span>
            </label>
          )}

          <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100">
              Đóng
            </button>
            <button type="submit" disabled={submitting} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
              {submitting ? 'Đang gán...' : 'Gán nội dung'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
