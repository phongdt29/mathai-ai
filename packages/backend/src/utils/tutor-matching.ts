/**
 * Module 1 — Chọn giáo viên ảo (thầy/cô) theo giới tính ưa thích khi đăng ký.
 * Hàm thuần (không phụ thuộc DB) để dễ kiểm thử.
 *
 * Hồ sơ học sinh lưu `preferred_teacher_gender`: "thay" (thầy) | "co" (cô).
 * AITutor có `gender_style`: "nam" | "nu" | null.
 */

export type PreferredTeacherGender = "thay" | "co" | null | undefined;

export interface TutorLike {
  id?: string;
  _id?: unknown;
  gender_style?: "nam" | "nu" | null;
  is_active?: boolean;
}

/** Ánh xạ giới tính ưa thích → gender_style của tutor. */
export function preferredGenderToStyle(
  preferred: PreferredTeacherGender,
): "nam" | "nu" | null {
  if (preferred === "thay") return "nam";
  if (preferred === "co") return "nu";
  return null;
}

function tutorId(tutor: TutorLike): string | null {
  if (tutor.id) return String(tutor.id);
  if (tutor._id != null) return String(tutor._id);
  return null;
}

/**
 * Chọn id tutor phù hợp giới tính ưa thích.
 * - Ưu tiên tutor đang active có gender_style khớp.
 * - Nếu không có khớp: lấy tutor active đầu tiên (fallback).
 * - Không có tutor nào: null.
 */
export function pickTutorByGender(
  tutors: TutorLike[],
  preferred: PreferredTeacherGender,
): string | null {
  const active = tutors.filter((t) => t.is_active !== false);
  if (active.length === 0) return null;

  const style = preferredGenderToStyle(preferred);
  if (style) {
    const matched = active.find((t) => t.gender_style === style);
    if (matched) return tutorId(matched);
  }
  return tutorId(active[0]);
}
