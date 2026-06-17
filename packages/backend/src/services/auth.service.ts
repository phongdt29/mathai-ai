import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { config } from "../config";
import {
	StudentProfileRepository,
	StudentThemeRepository,
} from "../models/student.model";
import { UserRepository } from "../models/user.model";
import { aiTutorRepository } from "../models/ai-tutor.model";
import { pickTutorByGender, type TutorLike } from "../utils/tutor-matching";
import {
	passwordResetRequestRepository,
	type PasswordResetRequestRepository,
} from "../models/password-reset-request.model";
import {
	type LoginDTO,
	type RegisterDTO,
	type StudentProfile,
	StudentThemePreference,
	type User,
	type UserRole,
} from "../types";
import {
	ConflictError,
	ForbiddenError,
	NotFoundError,
	UnauthorizedError,
} from "../utils/errors";
import { type EmailService, emailService } from "./email.service";
import { auditService, type AuditService } from "./audit.service";
import {
	type NotificationService,
	type NotificationDispatchResult,
	notificationService,
} from "./notification.service";

type AuthTokenUser = {
	id: string;
	email: string;
	role: string;
};

type RefreshTokenPayload = {
	id: string;
};

type PasswordResetTokenPayload = JwtPayload & {
	sub: string;
	email: string;
	purpose: "password_reset";
	passwordVersion: string;
};

type AuthTokens = {
	access_token: string;
	refresh_token: string;
};

type SafeUser = Omit<User, "password_hash">;

type AuthUserEntity = Omit<User, "id" | "created_at" | "updated_at"> & {
	id: string;
	created_at?: User["created_at"];
	updated_at?: User["updated_at"];
	toObject?: () => Record<string, unknown>;
};

type StudentProfileEntity = StudentProfile & {
	toObject?: () => StudentProfile;
};

type UserRepositoryPort = {
	findByEmail(email: string): Promise<AuthUserEntity | null>;
	findById(id: string): Promise<AuthUserEntity | null>;
	create(data: unknown, session?: unknown): Promise<AuthUserEntity>;
	update(
		id: string,
		data: Partial<AuthUserEntity> | Record<string, unknown>,
		session?: unknown,
	): Promise<AuthUserEntity>;
	transaction<T>(callback: (session: unknown) => Promise<T>): Promise<T>;
};

type StudentProfileRepositoryPort = {
	create(data: unknown, session?: unknown): Promise<StudentProfileEntity>;
	findByUserId(userId: string): Promise<StudentProfile | null>;
};

type StudentThemeRepositoryPort = {
	create(data: unknown, session?: unknown): Promise<unknown>;
};

type RegisterResult = {
	user: SafeUser;
	profile: StudentProfile;
	tokens: AuthTokens;
};

type LoginResult = {
	user: SafeUser;
	profile: StudentProfile | null;
	tokens: AuthTokens;
};

type AuthServiceDependencies = {
	userRepository?: Pick<
		UserRepositoryPort,
		"findByEmail" | "findById" | "update"
	> &
		Partial<UserRepositoryPort>;
	studentProfileRepository?: StudentProfileRepositoryPort;
	studentThemeRepository?: StudentThemeRepositoryPort;
	emailService?: Pick<EmailService, "sendPasswordResetEmail">;
	notificationService?: Pick<NotificationService, "send">;
	passwordResetRequestRepository?: Pick<
		PasswordResetRequestRepository,
		"findByTokenFingerprint" | "markConsumed" | "countRecentByEmail"
	> & { create?(data: any): Promise<any> };
	auditService?: Pick<AuditService, "record">;
	tutorRepository?: { findActive(): Promise<TutorLike[]> };
};

type PasswordResetRequest = {
	email: string;
};

type PasswordResetContext = {
	ip?: string | null;
	userAgent?: string | null;
};

type PasswordResetConfirm = {
	token: string;
	password: string;
};

export class AuthService {
	private readonly userRepository: UserRepositoryPort;
	private readonly studentProfileRepository: StudentProfileRepositoryPort;
	private readonly studentThemeRepository: StudentThemeRepositoryPort;
	private readonly emailService: Pick<EmailService, "sendPasswordResetEmail">;
	private readonly notificationService: Pick<NotificationService, "send">;
	private readonly passwordResetRequestRepository: Pick<
		PasswordResetRequestRepository,
		"findByTokenFingerprint" | "markConsumed" | "countRecentByEmail"
	> & { create?(data: any): Promise<any> };
	private readonly auditService: Pick<AuditService, "record">;
	private readonly tutorRepository: { findActive(): Promise<TutorLike[]> };

	constructor(dependencies: AuthServiceDependencies = {}) {
		this.userRepository =
			(dependencies.userRepository as unknown as
				| UserRepositoryPort
				| undefined) ?? (new UserRepository() as unknown as UserRepositoryPort);
		this.studentProfileRepository =
			dependencies.studentProfileRepository ??
			(new StudentProfileRepository() as unknown as StudentProfileRepositoryPort);
		this.studentThemeRepository =
			dependencies.studentThemeRepository ??
			(new StudentThemeRepository() as unknown as StudentThemeRepositoryPort);
		this.emailService = dependencies.emailService ?? emailService;
		this.notificationService = dependencies.notificationService ?? notificationService;
		this.passwordResetRequestRepository =
			dependencies.passwordResetRequestRepository ?? passwordResetRequestRepository;
		this.auditService = dependencies.auditService ?? auditService;
		this.tutorRepository = dependencies.tutorRepository ?? aiTutorRepository;
	}

	/**
	 * Module 1: nếu học sinh chưa chọn tutor, tự gán theo giới tính ưa thích
	 * (thầy/cô). Fail-soft — lỗi không chặn đăng ký.
	 */
	private async resolveSelectedTutorId(data: {
		selected_tutor_id?: string | null;
		preferred_teacher_gender?: "thay" | "co" | null;
	}): Promise<string | null> {
		if (data.selected_tutor_id) return data.selected_tutor_id;
		try {
			const tutors = await this.tutorRepository.findActive();
			return pickTutorByGender(tutors, data.preferred_teacher_gender ?? null);
		} catch {
			return null;
		}
	}

	public async hashPassword(password: string): Promise<string> {
		return bcrypt.hash(password, 12);
	}

	public async comparePassword(
		password: string,
		hash: string,
	): Promise<boolean> {
		return bcrypt.compare(password, hash);
	}

	public generateAccessToken(user: AuthTokenUser): string {
		return jwt.sign(
			{
				id: user.id,
				email: user.email,
				role: user.role,
			},
			config.jwt.secret,
			{
				expiresIn: config.jwt.expiresIn,
			} as SignOptions,
		);
	}

	public generateRefreshToken(user: RefreshTokenPayload): string {
		return jwt.sign(
			{
				id: user.id,
			},
			config.jwt.refreshSecret,
			{
				expiresIn: "30d",
			},
		);
	}

	public verifyRefreshToken(token: string): RefreshTokenPayload {
		try {
			const decoded = jwt.verify(
				token,
				config.jwt.refreshSecret,
			) as JwtPayload & RefreshTokenPayload;

			if (!decoded.id) {
				throw new UnauthorizedError("Refresh token không hợp lệ");
			}

			return { id: String(decoded.id) };
		} catch {
			throw new UnauthorizedError("Refresh token không hợp lệ hoặc đã hết hạn");
		}
	}

	public generatePasswordResetToken(user: AuthUserEntity): string {
		return jwt.sign(
			{
				email: user.email,
				purpose: "password_reset",
				passwordVersion: user.password_hash ?? "",
			},
			config.jwt.refreshSecret,
			{
				subject: String(user.id),
				expiresIn: "30m",
			} as SignOptions,
		);
	}

	public async register(data: RegisterDTO): Promise<RegisterResult> {
		const existingUser = await this.userRepository.findByEmail(data.email);

		if (existingUser) {
			throw new ConflictError("Email đã được sử dụng");
		}

		const passwordHash = await this.hashPassword(data.password);

		const result = await this.userRepository.transaction(async (session) => {
			const createdUser = await this.userRepository.create(
				{
					email: data.email,
					full_name: data.full_name,
					password_hash: passwordHash,
					role: "student" as UserRole,
					is_active: true,
				} as any,
				session,
			);

			const classification = this.resolveInitialClassification(data);
			const selectedTutorId = await this.resolveSelectedTutorId(data);

			const createdProfile = await this.studentProfileRepository.create(
				{
					user_id: createdUser.id,
					date_of_birth: data.date_of_birth ?? null,
					phone: data.phone ?? null,
					address: data.address ?? null,
					school_name: data.school_name ?? null,
					grade_level: data.grade_level,
					self_assessed_level: data.self_assessed_level ?? null,
					math_average_score: data.math_average_score ?? null,
					preferred_teacher_gender: data.preferred_teacher_gender ?? null,
					selected_tutor_id: selectedTutorId,
					favorite_color: data.favorite_color ?? null,
					interests: data.interests ?? null,
					initial_classification: classification,
				} as any,
				session,
			);

			await this.studentThemeRepository.create(
				{
					student_id: createdProfile.id,
					favorite_color: data.favorite_color ?? "#4F46E5",
					font_size: "medium",
					theme_mode: "light",
				} as any,
				session,
			);

			const safeUser = this.sanitizeUser(createdUser);
			const tokens = this.generateTokens({
				id: createdUser.id,
				email: createdUser.email,
				role: createdUser.role,
			});

			return {
				user: safeUser,
				profile: createdProfile.toObject
					? createdProfile.toObject()
					: createdProfile,
				tokens,
			};
		});

		return result;
	}

	public async login(data: LoginDTO): Promise<LoginResult> {
		const user = await this.userRepository.findByEmail(data.email);

		if (!user || !user.password_hash) {
			throw new UnauthorizedError("Email hoặc mật khẩu không chính xác");
		}

		const isPasswordValid = await this.comparePassword(
			data.password,
			user.password_hash,
		);

		if (!isPasswordValid) {
			throw new UnauthorizedError("Email hoặc mật khẩu không chính xác");
		}

		if (!user.is_active) {
			throw new ForbiddenError("Tài khoản đã bị vô hiệu hóa");
		}

		const profile = await this.studentProfileRepository.findByUserId(user.id);
		const tokens = this.generateTokens({
			id: user.id!,
			email: user.email,
			role: user.role,
		});

		return {
			user: this.sanitizeUser(user),
			profile: profile as any,
			tokens,
		};
	}

	public async requestPasswordReset(
		_data: PasswordResetRequest,
		context?: PasswordResetContext,
	): Promise<{ accepted: true }> {
		const email = _data.email.trim().toLowerCase();

		// ── Email-based rate limit: 3 per hour (silent skip) ──────────────
		const recentCount = await this.passwordResetRequestRepository.countRecentByEmail(email, 60);
		if (recentCount >= 3) {
			// Still return 200 {accepted:true} — anti-enumeration + silent rate-limit
			void this.auditService.record({
				actor: null,
				action: "auth.password_reset.requested",
				resourceType: "user",
				resourceId: null,
				result: "success",
				metadata: { email, rate_limited: true },
				ipAddress: context?.ip ?? null,
				userAgent: context?.userAgent ?? null,
			});
			return { accepted: true };
		}

		// ── Lookup user ──────────────────────────────────────────────────
		const user = await this.userRepository.findByEmail(email);

		if (!user || !user.password_hash || !user.is_active) {
			// Constant-time: perform a dummy hash to equalize timing with the happy path
			await this.hashPassword("constant-time-dummy-password");

			void this.auditService.record({
				actor: null,
				action: "auth.password_reset.requested",
				resourceType: "user",
				resourceId: null,
				result: "success",
				metadata: { email, user_found: false },
				ipAddress: context?.ip ?? null,
				userAgent: context?.userAgent ?? null,
			});
			return { accepted: true };
		}

		// ── Generate token + fingerprint ─────────────────────────────────
		const token = this.generatePasswordResetToken(user);
		const tokenFingerprint = crypto
			.createHash("sha256")
			.update(token)
			.digest("hex");
		const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

		// ── Dispatch via notificationService ─────────────────────────────
		const resetUrl = `${config.app.baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

		let dispatchResult: NotificationDispatchResult | null = null;
		try {
			dispatchResult = await this.notificationService.send({
				type: "password_reset",
				recipient: {
					user_id: String(user.id),
					email: user.email,
				},
				channels: ["email"],
				payload: {
					subject: "MathAI đặt lại mật khẩu",
					text: [
						"Bạn vừa yêu cầu đặt lại mật khẩu MathAI.",
						`Mở liên kết sau trong 30 phút để đặt lại mật khẩu: ${resetUrl}`,
						"Nếu bạn không yêu cầu thao tác này, hãy bỏ qua email này.",
					].join("\n"),
					reset_url: resetUrl,
					user_name: user.full_name ?? user.email,
				},
				template_id: "password_reset.v1",
				metadata: { ip: context?.ip ?? null },
			});
		} catch {
			// Notification dispatch failure should not leak to the user
			dispatchResult = null;
		}

		// ── Persist PasswordResetRequest ─────────────────────────────────
		const deliveryId = dispatchResult?.delivery_id ?? null;
		if (this.passwordResetRequestRepository.create) {
			try {
				await this.passwordResetRequestRepository.create({
					email,
					user_id: user.id,
					ip: context?.ip ?? null,
					user_agent: context?.userAgent ?? null,
					token_fingerprint: tokenFingerprint,
					expires_at: expiresAt,
					consumed_at: null,
					delivery_id: deliveryId,
				});
			} catch {
				// Persist failure should not block the response
			}
		}

		// ── Audit log ────────────────────────────────────────────────────
		void this.auditService.record({
			actor: { id: String(user.id), role: user.role },
			action: "auth.password_reset.requested",
			resourceType: "user",
			resourceId: String(user.id),
			result: "success",
			metadata: {
				email,
				delivery_id: deliveryId,
				user_found: true,
				rate_limited: false,
			},
			ipAddress: context?.ip ?? null,
			userAgent: context?.userAgent ?? null,
		});

		return { accepted: true };
	}

	public async resetPassword(
		data: PasswordResetConfirm,
	): Promise<{ reset: true }> {
		const payload = this.verifyPasswordResetToken(data.token);
		const user = await this.userRepository.findById(String(payload.sub));

		if (!user || !user.password_hash || !user.is_active) {
			throw new UnauthorizedError(
				"Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
			);
		}

		if (
			user.email !== payload.email ||
			user.password_hash !== payload.passwordVersion
		) {
			throw new UnauthorizedError(
				"Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
			);
		}

		// Compute token fingerprint and check consumed_at
		const tokenFingerprint = crypto
			.createHash("sha256")
			.update(data.token)
			.digest("hex");

		const resetRequest =
			await this.passwordResetRequestRepository.findByTokenFingerprint(
				tokenFingerprint,
			);

		if (resetRequest && resetRequest.consumed_at != null) {
			throw new UnauthorizedError(
				"Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
			);
		}

		const passwordHash = await this.hashPassword(data.password);
		await this.userRepository.update(String(user.id), {
			password_hash: passwordHash,
		} as any);

		// Mark the reset request as consumed
		if (resetRequest) {
			await this.passwordResetRequestRepository.markConsumed(
				String(resetRequest._id ?? (resetRequest as any).id),
			);
		}

		// Record audit log
		await this.auditService.record({
			actor: { id: String(user.id), role: user.role },
			action: "auth.password_reset.consumed",
			resourceType: "user",
			resourceId: String(user.id),
			result: "success",
		});

		return { reset: true };
	}

	public async refreshToken(
		refreshToken: string,
	): Promise<{ tokens: AuthTokens }> {
		const payload = this.verifyRefreshToken(refreshToken);
		const user = await this.userRepository.findById(payload.id);

		if (!user) {
			throw new UnauthorizedError("Người dùng không tồn tại");
		}

		if (!user.is_active) {
			throw new ForbiddenError("Tài khoản đã bị vô hiệu hóa");
		}

		return {
			tokens: this.generateTokens({
				id: user.id!,
				email: user.email,
				role: user.role,
			}),
		};
	}

	public async getMe(
		userId: string,
	): Promise<{ user: SafeUser; profile: StudentProfile | null }> {
		const user = await this.userRepository.findById(userId);

		if (!user) {
			throw new NotFoundError("Không tìm thấy người dùng");
		}

		const profile = await this.studentProfileRepository.findByUserId(userId);

		return {
			user: this.sanitizeUser(user),
			profile: profile as any,
		};
	}

	private generateTokens(user: AuthTokenUser): AuthTokens {
		return {
			access_token: this.generateAccessToken(user),
			refresh_token: this.generateRefreshToken({ id: user.id }),
		};
	}

	private verifyPasswordResetToken(token: string): PasswordResetTokenPayload {
		try {
			const decoded = jwt.verify(
				token,
				config.jwt.refreshSecret,
			) as PasswordResetTokenPayload;

			if (
				decoded.purpose !== "password_reset" ||
				!decoded.sub ||
				!decoded.email ||
				!decoded.passwordVersion
			) {
				throw new UnauthorizedError(
					"Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
				);
			}

			return decoded;
		} catch {
			throw new UnauthorizedError(
				"Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn",
			);
		}
	}

	private sanitizeUser(user: any): SafeUser {
		const obj = user.toObject ? user.toObject() : user;
		const { password_hash: _passwordHash, ...safeUser } = obj;
		return safeUser;
	}

	private resolveInitialClassification(data: RegisterDTO): string {
		const score = data.math_average_score;

		if (typeof score === "number") {
			if (score <= 3.5) {
				return "yeu";
			}

			if (score <= 5) {
				return "trung_binh";
			}

			if (score <= 8) {
				return "kha";
			}

			return "gioi";
		}

		return data.self_assessed_level ?? "trung_binh";
	}
}

export const authService = new AuthService();

export default authService;
