
import { AITutorRepository } from '../models/ai-tutor.model';
import { StudentProfileRepository, StudentThemeRepository } from '../models/student.model';
import { UserRepository } from '../models/user.model';
import {
  AITutor,
  StudentProfile,
  StudentThemePreference,
  UpdateStudentProfileDTO,
  UpdateThemeDTO,
  User,
} from '../types';
import { NotFoundError, ValidationError } from '../utils/errors';

type ThemeInput = UpdateThemeDTO & {
  favorite_color?: string;
  font_size?: 'small' | 'medium' | 'large';
  theme_mode?: 'light' | 'dark';
};

export type StudentOnboardingField = 'full_name' | 'grade_level' | 'self_assessed_level';

export type StudentOnboardingStatus = {
  completed: boolean;
  completion_percentage: number;
  required_fields: StudentOnboardingField[];
  missing_fields: StudentOnboardingField[];
};

const STUDENT_ONBOARDING_REQUIRED_FIELDS: StudentOnboardingField[] = [
  'full_name',
  'grade_level',
  'self_assessed_level',
];

export class StudentService {
  private readonly userRepository: UserRepository;
  private readonly studentProfileRepository: StudentProfileRepository;
  private readonly studentThemeRepository: StudentThemeRepository;
  private readonly aiTutorRepository: AITutorRepository;

  constructor() {
    this.userRepository = new UserRepository();
    this.studentProfileRepository = new StudentProfileRepository();
    this.studentThemeRepository = new StudentThemeRepository();
    this.aiTutorRepository = new AITutorRepository();
  }

  public async getProfile(
    userId: string
  ): Promise<{
    user: Omit<User, 'password_hash'>;
    profile: StudentProfile;
    theme: StudentThemePreference;
    onboarding: StudentOnboardingStatus;
  }> {
    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('Không tìm thấy người dùng');
    }

    const profile = await this.studentProfileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    }

    let theme = await this.studentThemeRepository.findByStudentId(profile.id);

    if (!theme) {
      theme = await this.studentThemeRepository.create({
        student_id: profile.id,
        favorite_color: profile.favorite_color ?? '#4F46E5',
        font_size: 'medium',
        theme_mode: 'light',
      } as any);
    }

    return {
      user: this.sanitizeUser(user),
      profile: profile as any,
      theme: theme as any,
      onboarding: this.buildOnboardingStatus(user, profile as any),
    };
  }

  public async updateProfile(userId: string, data: UpdateStudentProfileDTO): Promise<StudentProfile> {
    const profile = await this.studentProfileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    }

    if (data.selected_tutor_id !== undefined) {
      await this.ensureTutorExists(data.selected_tutor_id);
    }

    await this.userRepository.transaction(async (session) => {
      if (data.full_name !== undefined) {
        await this.userRepository.update(
          userId,
          {
            full_name: data.full_name,
          } as any,
          session
        );
      }

      const profilePayload: Partial<StudentProfile> = {
        date_of_birth: data.date_of_birth,
        phone: data.phone,
        address: data.address,
        school_name: data.school_name,
        grade_level: data.grade_level,
        self_assessed_level: data.self_assessed_level,
        math_average_score: data.math_average_score,
        selected_tutor_id: data.selected_tutor_id,
        interests: data.interests,
      };

      await this.studentProfileRepository.update(profile.id, profilePayload as any, session);
    });

    const updatedProfile = await this.studentProfileRepository.findByUserId(userId);

    if (!updatedProfile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh sau khi cập nhật');
    }

    return updatedProfile as any;
  }

  public async getTheme(userId: string): Promise<StudentThemePreference> {
    const profile = await this.studentProfileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    }

    const theme = await this.studentThemeRepository.findByStudentId(profile.id);

    if (theme) {
      return theme as any;
    }

    return this.studentThemeRepository.create({
      student_id: profile.id,
      favorite_color: profile.favorite_color ?? '#4F46E5',
      font_size: 'medium',
      theme_mode: 'light',
    } as any) as any;
  }

  public async updateTheme(userId: string, data: UpdateThemeDTO): Promise<StudentThemePreference> {
    const profile = await this.studentProfileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    }

    const payload = data as ThemeInput;
    const existingTheme = await this.studentThemeRepository.findByStudentId(profile.id);

    if (!existingTheme) {
      return this.studentThemeRepository.create({
        student_id: profile.id,
        favorite_color: payload.favorite_color ?? '#4F46E5',
        font_size: payload.font_size ?? 'medium',
        theme_mode: payload.theme_mode ?? 'light',
      } as any) as any;
    }

    return this.studentThemeRepository.update(existingTheme.id, {
      favorite_color: payload.favorite_color,
      font_size: payload.font_size,
      theme_mode: payload.theme_mode,
    } as any) as any;
  }

  public async getAvailableTutors(): Promise<AITutor[]> {
    return this.aiTutorRepository.findActive() as any;
  }

  public async selectTutor(userId: string, tutorId: string): Promise<StudentProfile> {
    const profile = await this.studentProfileRepository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundError('Không tìm thấy hồ sơ học sinh');
    }

    await this.ensureTutorExists(tutorId);

    return this.studentProfileRepository.update(profile.id, {
      selected_tutor_id: tutorId,
    } as any) as any;
  }

  private sanitizeUser(user: any): Omit<User, 'password_hash'> {
    const obj = user.toObject ? user.toObject() : user;
    const { password_hash: _passwordHash, ...safeUser } = obj;
    return safeUser;
  }

  private buildOnboardingStatus(user: any, profile: StudentProfile): StudentOnboardingStatus {
    const missingFields = STUDENT_ONBOARDING_REQUIRED_FIELDS.filter((field) => {
      if (field === 'full_name') {
        return !this.hasNonEmptyString(user.full_name);
      }

      if (field === 'grade_level') {
        return typeof profile.grade_level !== 'number';
      }

      return !this.hasNonEmptyString(profile.self_assessed_level);
    });
    const completedCount = STUDENT_ONBOARDING_REQUIRED_FIELDS.length - missingFields.length;

    return {
      completed: missingFields.length === 0,
      completion_percentage: Math.round(
        (completedCount / STUDENT_ONBOARDING_REQUIRED_FIELDS.length) * 100
      ),
      required_fields: [...STUDENT_ONBOARDING_REQUIRED_FIELDS],
      missing_fields: missingFields,
    };
  }

  private hasNonEmptyString(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private async ensureTutorExists(tutorId: string): Promise<void> {
    const tutor = await this.aiTutorRepository.findById(tutorId);

    if (!tutor || !tutor.is_active) {
      throw new ValidationError('Tutor được chọn không tồn tại hoặc không khả dụng');
    }
  }
}

export const studentService = new StudentService();

export default studentService;
