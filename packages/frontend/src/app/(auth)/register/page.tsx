'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient, getStudentProfile, type StudentProfileResponse } from '@/lib/api';
import { completeAuthSession } from '@/lib/auth-onboarding';
import type { StudentProfile, User } from '@/types';

const gradeOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

const selfAssessedLevelOptions = [
  { value: 'weak', label: 'Cần củng cố' },
  { value: 'average', label: 'Trung bình' },
  { value: 'good', label: 'Khá' },
  { value: 'excellent', label: 'Giỏi' },
] as const;

const tutorGenderOptions = [
  { value: 'thay', label: 'Thầy AI' },
  { value: 'co', label: 'Cô AI' },
] as const;

type SelfAssessedLevel = (typeof selfAssessedLevelOptions)[number]['value'];
type PreferredTeacherGender = (typeof tutorGenderOptions)[number]['value'];

interface RegisterResponse {
  success: boolean;
  data: {
    user: User;
    profile: StudentProfile;
    theme?: StudentProfileResponse['theme'];
    onboarding?: StudentProfileResponse['onboarding'];
    tokens: {
      access_token: string;
      refresh_token: string;
    };
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    dateOfBirth: '',
    address: '',
    phone: '',
    schoolName: '',
    gradeLevel: '',
    selfAssessedLevel: '' as SelfAssessedLevel | '',
    mathAverageScore: '',
    preferredTeacherGender: '' as PreferredTeacherGender | '',
    favoriteColor: '#4F46E5',
    interests: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const updateField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validateForm = () => {
    if (!form.fullName.trim()) return 'Vui lòng nhập họ tên.';
    if (!form.email.trim()) return 'Vui lòng nhập email.';
    if (form.password.length < 6) return 'Mật khẩu phải có ít nhất 6 ký tự.';
    if (!form.dateOfBirth) return 'Vui lòng nhập ngày sinh.';
    if (!form.address.trim()) return 'Vui lòng nhập địa chỉ/nơi ở.';
    if (!form.phone.trim()) return 'Vui lòng nhập số điện thoại.';
    if (!form.schoolName.trim()) return 'Vui lòng nhập trường học.';
    if (!form.gradeLevel) return 'Vui lòng chọn khối lớp.';
    if (!form.selfAssessedLevel) return 'Vui lòng chọn học lực tự đánh giá.';
    if (!form.mathAverageScore) return 'Vui lòng nhập điểm trung bình toán.';

    const score = Number(form.mathAverageScore);
    if (!Number.isFinite(score) || score < 0 || score > 10) {
      return 'Điểm trung bình toán phải từ 0 đến 10.';
    }

    if (!form.preferredTeacherGender) return 'Vui lòng chọn Thầy AI hoặc Cô AI.';
    if (!form.favoriteColor) return 'Vui lòng chọn màu yêu thích.';
    if (!form.interests.trim()) return 'Vui lòng nhập sở thích.';

    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const gradeLevel = Number(form.gradeLevel);
      const res = await apiClient<RegisterResponse>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password,
          full_name: form.fullName.trim(),
          date_of_birth: form.dateOfBirth,
          address: form.address.trim(),
          phone: form.phone.trim(),
          school_name: form.schoolName.trim(),
          grade_level: gradeLevel,
          self_assessed_level: form.selfAssessedLevel,
          math_average_score: Number(form.mathAverageScore),
          preferred_teacher_gender: form.preferredTeacherGender,
          favorite_color: form.favoriteColor,
          interests: form.interests.trim(),
        }),
      });

      const { tokens, user, profile, theme, onboarding } = res.data;
      const returnedStudentProfile = theme && onboarding
        ? { user, profile, theme, onboarding }
        : null;
      const redirect = await completeAuthSession({
        user,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        storage: localStorage,
        studentProfile: returnedStudentProfile,
        fetchStudentProfile: getStudentProfile,
        studentCompleteRedirect: '/dashboard/assessment',
      });

      router.push(redirect);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Đăng ký thất bại. Vui lòng thử lại.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-3xl rounded-2xl bg-white p-8 shadow-sm ring-1 ring-gray-200">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Đăng ký</h1>
        <p className="mb-6 text-sm text-gray-500">
          Tạo tài khoản và hoàn thiện hồ sơ ban đầu để MathAI cá nhân hóa lộ trình học toán.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <form className="space-y-6" onSubmit={handleSubmit}>
          <section className="grid gap-4 md:grid-cols-2">
            <TextInput
              id="fullName"
              label="Họ và tên"
              value={form.fullName}
              onChange={(value) => updateField('fullName', value)}
              placeholder="Nguyễn Văn A"
              required
            />
            <TextInput
              id="email"
              label="Email"
              type="email"
              value={form.email}
              onChange={(value) => updateField('email', value)}
              placeholder="you@example.com"
              required
            />
            <TextInput
              id="password"
              label="Mật khẩu"
              type="password"
              value={form.password}
              onChange={(value) => updateField('password', value)}
              placeholder="Tối thiểu 6 ký tự"
              required
              minLength={6}
            />
            <TextInput
              id="dateOfBirth"
              label="Ngày sinh"
              type="date"
              value={form.dateOfBirth}
              onChange={(value) => updateField('dateOfBirth', value)}
              required
            />
            <TextInput
              id="phone"
              label="Số điện thoại"
              type="tel"
              value={form.phone}
              onChange={(value) => updateField('phone', value)}
              placeholder="0901234567"
              required
            />
            <TextInput
              id="schoolName"
              label="Trường học"
              value={form.schoolName}
              onChange={(value) => updateField('schoolName', value)}
              placeholder="THCS/THPT ..."
              required
            />
            <TextInput
              id="address"
              label="Địa chỉ/nơi ở"
              value={form.address}
              onChange={(value) => updateField('address', value)}
              placeholder="Quận/Huyện, Tỉnh/Thành phố"
              required
              className="md:col-span-2"
            />
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <SelectInput
              id="gradeLevel"
              label="Khối lớp"
              value={form.gradeLevel}
              onChange={(value) => updateField('gradeLevel', value)}
              required
            >
              <option value="">Chọn khối lớp</option>
              {gradeOptions.map((grade) => (
                <option key={grade} value={grade}>
                  Lớp {grade}
                </option>
              ))}
            </SelectInput>
            <SelectInput
              id="selfAssessedLevel"
              label="Học lực tự đánh giá"
              value={form.selfAssessedLevel}
              onChange={(value) => updateField('selfAssessedLevel', value)}
              required
            >
              <option value="">Chọn mức học lực</option>
              {selfAssessedLevelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
            <TextInput
              id="mathAverageScore"
              label="Điểm trung bình toán"
              type="number"
              value={form.mathAverageScore}
              onChange={(value) => updateField('mathAverageScore', value)}
              placeholder="Ví dụ: 7.5"
              required
              min={0}
              max={10}
              step="0.1"
            />
            <SelectInput
              id="preferredTeacherGender"
              label="Giáo viên AI mong muốn"
              value={form.preferredTeacherGender}
              onChange={(value) => updateField('preferredTeacherGender', value)}
              required
            >
              <option value="">Chọn giáo viên AI</option>
              {tutorGenderOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectInput>
            <div>
              <label htmlFor="favoriteColor" className="mb-2 block text-sm font-medium text-gray-700">
                Màu yêu thích <span className="text-red-500">*</span>
              </label>
              <input
                id="favoriteColor"
                type="color"
                value={form.favoriteColor}
                onChange={(e) => updateField('favoriteColor', e.target.value)}
                required
                className="w-full h-12 p-1 rounded-xl border border-gray-300 cursor-pointer outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
            <TextInput
              id="interests"
              label="Sở thích"
              value={form.interests}
              onChange={(value) => updateField('interests', value)}
              placeholder="Bóng đá, vẽ, đọc truyện, robot..."
              required
            />
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : 'Tạo tài khoản'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Đã có tài khoản?{' '}
          <Link href="/login" className="font-medium text-indigo-600 hover:text-indigo-500">
            Đăng nhập
          </Link>
        </p>
      </div>
    </main>
  );
}

interface TextInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  min?: number;
  max?: number;
  step?: string;
  className?: string;
}

function TextInput({
  id,
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
  minLength,
  min,
  max,
  step,
  className = '',
}: TextInputProps) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        min={min}
        max={max}
        step={step}
        className="w-full rounded-xl border border-gray-300 px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      />
    </div>
  );
}

interface SelectInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  children: ReactNode;
}

function SelectInput({ id, label, value, onChange, required, children }: SelectInputProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
      >
        {children}
      </select>
    </div>
  );
}
