CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20) UNIQUE,
    password_hash TEXT,
    role VARCHAR(20) NOT NULL DEFAULT 'student',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified_at TIMESTAMP NULL,
    phone_verified_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_profiles (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    date_of_birth DATE NOT NULL,
    address TEXT NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    grade_level SMALLINT NOT NULL CHECK (grade_level BETWEEN 1 AND 12),
    academic_self_rating VARCHAR(20),
    math_avg_score DECIMAL(4,2),
    preferred_teacher_gender VARCHAR(10) CHECK (preferred_teacher_gender IN ('thay', 'co')),
    favorite_color VARCHAR(50),
    hobbies TEXT,
    personality_summary TEXT,
    learning_goal TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_theme_preferences (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL UNIQUE,
    favorite_color VARCHAR(50),
    ui_theme_name VARCHAR(100),
    personality_style VARCHAR(100),
    avatar_style VARCHAR(100),
    homepage_layout_style VARCHAR(100),
    widget_preferences JSON,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_student_theme_preferences_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_tutors (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    gender_style VARCHAR(10) NOT NULL CHECK (gender_style IN ('thay', 'co')),
    tone_style VARCHAR(50) NOT NULL,
    avatar_url TEXT,
    system_prompt TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessments (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    type VARCHAR(30) NOT NULL CHECK (type IN ('diagnostic', 'lesson_quiz', 'weekly_review', 'monthly_review')),
    title VARCHAR(255) NOT NULL,
    grade_level SMALLINT NOT NULL,
    target_difficulty VARCHAR(20),
    generated_by_ai BOOLEAN NOT NULL DEFAULT TRUE,
    total_questions INT NOT NULL DEFAULT 0,
    total_score DECIMAL(5,2),
    duration_minutes INT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'completed')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_assessments_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_questions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assessment_id BIGINT NOT NULL,
    question_type VARCHAR(20) NOT NULL CHECK (question_type IN ('multiple_choice', 'short_answer', 'essay')),
    topic VARCHAR(100) NOT NULL,
    difficulty_level VARCHAR(20) NOT NULL,
    question_text TEXT NOT NULL,
    choices JSON,
    correct_answer TEXT,
    solution_steps JSON,
    explanation TEXT,
    score DECIMAL(5,2) NOT NULL DEFAULT 1,
    order_index INT NOT NULL,
    CONSTRAINT fk_assessment_questions_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curricula (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    input_level VARCHAR(20) NOT NULL,
    ai_summary TEXT NOT NULL,
    target_goal TEXT,
    estimated_total_sessions INT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'completed')),
    created_by_ai BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_curricula_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS curriculum_modules (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    curriculum_id BIGINT NOT NULL,
    module_title VARCHAR(255) NOT NULL,
    module_description TEXT,
    topic VARCHAR(100) NOT NULL,
    order_index INT NOT NULL,
    estimated_sessions INT,
    target_mastery DECIMAL(5,2),
    status VARCHAR(20) NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'active', 'completed')),
    CONSTRAINT fk_curriculum_modules_curriculum FOREIGN KEY (curriculum_id) REFERENCES curricula(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lessons (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    curriculum_id BIGINT NOT NULL,
    module_id BIGINT,
    student_id BIGINT NOT NULL,
    lesson_title VARCHAR(255) NOT NULL,
    lesson_date DATE,
    theory_content TEXT NOT NULL,
    lesson_objective TEXT,
    ai_tutor_id BIGINT,
    estimated_minutes INT DEFAULT 45,
    order_index INT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'available', 'completed', 'skipped')),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_lessons_curriculum FOREIGN KEY (curriculum_id) REFERENCES curricula(id) ON DELETE CASCADE,
    CONSTRAINT fk_lessons_module FOREIGN KEY (module_id) REFERENCES curriculum_modules(id) ON DELETE SET NULL,
    CONSTRAINT fk_lessons_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_lessons_ai_tutor FOREIGN KEY (ai_tutor_id) REFERENCES ai_tutors(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lesson_exercises (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    lesson_id BIGINT NOT NULL,
    topic VARCHAR(100) NOT NULL,
    difficulty_level VARCHAR(20) NOT NULL,
    question_text TEXT NOT NULL,
    answer_type VARCHAR(20) NOT NULL CHECK (answer_type IN ('multiple_choice', 'short_answer', 'essay')),
    choices JSON,
    correct_answer TEXT,
    solution_steps JSON,
    explanation TEXT,
    order_index INT NOT NULL,
    CONSTRAINT fk_lesson_exercises_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS solver_requests (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    lesson_id BIGINT,
    input_type VARCHAR(20) NOT NULL CHECK (input_type IN ('text', 'image')),
    input_text TEXT,
    image_url TEXT,
    parsed_text TEXT,
    ai_response TEXT,
    solution_steps JSON,
    explanation TEXT,
    related_topic VARCHAR(100),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_solver_requests_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_solver_requests_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu từng lần học sinh thực hiện bài đánh giá.
CREATE TABLE IF NOT EXISTS assessment_attempts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    assessment_id BIGINT NOT NULL,
    student_id BIGINT NOT NULL,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at TIMESTAMP NULL,
    total_score DECIMAL(5,2) NULL,
    max_score DECIMAL(5,2) NULL,
    percentage DECIMAL(5,2) NULL,
    ai_feedback TEXT NULL,
    ai_analysis JSON NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_assessment_attempts_status CHECK (status IN ('in_progress', 'submitted', 'graded')),
    KEY idx_assessment_attempts_assessment_id (assessment_id),
    KEY idx_assessment_attempts_student_id (student_id),
    KEY idx_assessment_attempts_student_assessment_created (student_id, assessment_id, created_at),
    KEY idx_assessment_attempts_status (status),
    CONSTRAINT fk_assessment_attempts_assessment FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
    CONSTRAINT fk_assessment_attempts_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu câu trả lời chi tiết cho từng câu hỏi trong mỗi lần làm assessment.
CREATE TABLE IF NOT EXISTS assessment_answers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    attempt_id BIGINT NOT NULL,
    question_id BIGINT NOT NULL,
    student_answer TEXT NULL,
    selected_choice VARCHAR(10) NULL,
    is_correct TINYINT(1) NULL,
    score DECIMAL(5,2) NULL DEFAULT 0,
    ai_comment TEXT NULL,
    answered_at TIMESTAMP NULL,
    KEY idx_assessment_answers_attempt_id (attempt_id),
    KEY idx_assessment_answers_question_id (question_id),
    KEY idx_assessment_answers_attempt_question (attempt_id, question_id),
    CONSTRAINT uq_assessment_answers_attempt_question UNIQUE (attempt_id, question_id),
    CONSTRAINT fk_assessment_answers_attempt FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE,
    CONSTRAINT fk_assessment_answers_question FOREIGN KEY (question_id) REFERENCES assessment_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu kết quả quiz cuối buổi học của học sinh.
CREATE TABLE IF NOT EXISTS lesson_quiz_results (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    lesson_id BIGINT NOT NULL,
    student_id BIGINT NOT NULL,
    total_questions INT NOT NULL DEFAULT 0,
    correct_answers INT NOT NULL DEFAULT 0,
    score DECIMAL(5,2) NULL,
    max_score DECIMAL(5,2) NULL,
    percentage DECIMAL(5,2) NULL,
    duration_seconds INT NULL,
    ai_feedback TEXT NULL,
    passed TINYINT(1) NOT NULL DEFAULT 0,
    started_at TIMESTAMP NULL,
    submitted_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_lesson_quiz_results_lesson_id (lesson_id),
    KEY idx_lesson_quiz_results_student_id (student_id),
    KEY idx_lesson_quiz_results_student_submitted_at (student_id, submitted_at),
    KEY idx_lesson_quiz_results_passed (passed),
    CONSTRAINT fk_lesson_quiz_results_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
    CONSTRAINT fk_lesson_quiz_results_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu câu trả lời cho bài tập trong lesson.
CREATE TABLE IF NOT EXISTS lesson_exercise_answers (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    exercise_id BIGINT NOT NULL,
    student_id BIGINT NOT NULL,
    student_answer TEXT NULL,
    selected_choice VARCHAR(10) NULL,
    is_correct TINYINT(1) NULL,
    score DECIMAL(5,2) NULL DEFAULT 0,
    ai_comment TEXT NULL,
    answered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_lesson_exercise_answers_exercise_id (exercise_id),
    KEY idx_lesson_exercise_answers_student_id (student_id),
    KEY idx_lesson_exercise_answers_student_answered_at (student_id, answered_at),
    CONSTRAINT fk_lesson_exercise_answers_exercise FOREIGN KEY (exercise_id) REFERENCES lesson_exercises(id) ON DELETE CASCADE,
    CONSTRAINT fk_lesson_exercise_answers_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng tổng hợp mức độ thành thạo của học sinh theo từng chủ đề.
CREATE TABLE IF NOT EXISTS topic_mastery (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    topic VARCHAR(100) NOT NULL,
    grade_level SMALLINT NOT NULL,
    mastery_level DECIMAL(5,2) NOT NULL DEFAULT 0,
    total_attempts INT NOT NULL DEFAULT 0,
    correct_attempts INT NOT NULL DEFAULT 0,
    strength_label VARCHAR(20) NULL,
    last_practiced_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_topic_mastery_strength_label CHECK (strength_label IN ('weak', 'average', 'strong', 'mastered')),
    CONSTRAINT uq_topic_mastery_student_topic_grade UNIQUE (student_id, topic, grade_level),
    KEY idx_topic_mastery_student_id (student_id),
    KEY idx_topic_mastery_topic (topic),
    KEY idx_topic_mastery_student_mastery_level (student_id, mastery_level),
    KEY idx_topic_mastery_grade_level (grade_level),
    CONSTRAINT fk_topic_mastery_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu tiến độ học tập tổng thể của học sinh.
CREATE TABLE IF NOT EXISTS student_progress (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    curriculum_id BIGINT NULL,
    total_lessons INT NOT NULL DEFAULT 0,
    completed_lessons INT NOT NULL DEFAULT 0,
    completion_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
    average_quiz_score DECIMAL(5,2) NULL,
    total_study_time_minutes INT NOT NULL DEFAULT 0,
    current_streak_days INT NOT NULL DEFAULT 0,
    longest_streak_days INT NOT NULL DEFAULT 0,
    last_study_date DATE NULL,
    ai_progress_summary TEXT NULL,
    predicted_improvement DECIMAL(5,2) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_progress_student_curriculum UNIQUE (student_id, curriculum_id),
    KEY idx_student_progress_student_id (student_id),
    KEY idx_student_progress_curriculum_id (curriculum_id),
    KEY idx_student_progress_completion_percentage (completion_percentage),
    KEY idx_student_progress_last_study_date (last_study_date),
    CONSTRAINT fk_student_progress_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_student_progress_curriculum FOREIGN KEY (curriculum_id) REFERENCES curricula(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu các gợi ý bài học dành cho học sinh.
CREATE TABLE IF NOT EXISTS lesson_recommendations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    lesson_id BIGINT NOT NULL,
    recommendation_type VARCHAR(30) NOT NULL,
    reason TEXT NULL,
    priority INT NOT NULL DEFAULT 0,
    is_completed TINYINT(1) NOT NULL DEFAULT 0,
    recommended_date DATE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_lesson_recommendations_type CHECK (recommendation_type IN ('next_lesson', 'review', 'practice', 'challenge')),
    KEY idx_lesson_recommendations_student_id (student_id),
    KEY idx_lesson_recommendations_lesson_id (lesson_id),
    KEY idx_lesson_recommendations_student_date_priority (student_id, recommended_date, priority),
    KEY idx_lesson_recommendations_is_completed (is_completed),
    CONSTRAINT fk_lesson_recommendations_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_lesson_recommendations_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu các phiên hội thoại giữa học sinh và AI tutor.
CREATE TABLE IF NOT EXISTS ai_tutor_conversations (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NOT NULL,
    ai_tutor_id BIGINT NOT NULL,
    lesson_id BIGINT NULL,
    title VARCHAR(255) NULL,
    context_summary TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT chk_ai_tutor_conversations_status CHECK (status IN ('active', 'archived', 'closed')),
    KEY idx_ai_tutor_conversations_student_id (student_id),
    KEY idx_ai_tutor_conversations_ai_tutor_id (ai_tutor_id),
    KEY idx_ai_tutor_conversations_lesson_id (lesson_id),
    KEY idx_ai_tutor_conversations_student_updated_at (student_id, updated_at),
    KEY idx_ai_tutor_conversations_status (status),
    CONSTRAINT fk_ai_tutor_conversations_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_tutor_conversations_tutor FOREIGN KEY (ai_tutor_id) REFERENCES ai_tutors(id),
    CONSTRAINT fk_ai_tutor_conversations_lesson FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng lưu từng tin nhắn trong một phiên chat AI tutor.
CREATE TABLE IF NOT EXISTS ai_tutor_messages (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    conversation_id BIGINT NOT NULL,
    role VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    ai_model VARCHAR(50) NULL,
    tokens_used INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ai_tutor_messages_role CHECK (role IN ('student', 'tutor', 'system')),
    CONSTRAINT chk_ai_tutor_messages_type CHECK (message_type IN ('text', 'math', 'image', 'hint')),
    KEY idx_ai_tutor_messages_conversation_id (conversation_id),
    KEY idx_ai_tutor_messages_conversation_created_at (conversation_id, created_at),
    KEY idx_ai_tutor_messages_role (role),
    CONSTRAINT fk_ai_tutor_messages_conversation FOREIGN KEY (conversation_id) REFERENCES ai_tutor_conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng log metadata cho các lần sinh nội dung bằng AI.
CREATE TABLE IF NOT EXISTS ai_generation_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    student_id BIGINT NULL,
    generation_type VARCHAR(50) NOT NULL,
    prompt_template VARCHAR(100) NULL,
    prompt_version VARCHAR(20) NULL,
    ai_model VARCHAR(50) NOT NULL,
    input_data JSON NULL,
    output_data JSON NULL,
    tokens_input INT NULL,
    tokens_output INT NULL,
    cost_usd DECIMAL(10,6) NULL,
    response_time_ms INT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    error_message TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_ai_generation_logs_status CHECK (status IN ('success', 'error', 'timeout', 'rate_limited')),
    KEY idx_ai_generation_logs_student_id (student_id),
    KEY idx_ai_generation_logs_generation_type (generation_type),
    KEY idx_ai_generation_logs_status (status),
    KEY idx_ai_generation_logs_created_at (created_at),
    CONSTRAINT fk_ai_generation_logs_student FOREIGN KEY (student_id) REFERENCES student_profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Bảng thông báo gửi tới người dùng trong hệ thống.
CREATE TABLE IF NOT EXISTS notifications (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NULL,
    type VARCHAR(30) NOT NULL,
    is_read TINYINT(1) NOT NULL DEFAULT 0,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_notifications_type CHECK (type IN ('reminder', 'achievement', 'recommendation', 'system')),
    KEY idx_notifications_user_id (user_id),
    KEY idx_notifications_type (type),
    KEY idx_notifications_is_read (is_read),
    KEY idx_notifications_user_read_created (user_id, is_read, created_at),
    CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE solver_requests
    ADD COLUMN common_mistakes TEXT NULL AFTER explanation,
    ADD COLUMN ai_model VARCHAR(50) NULL AFTER common_mistakes,
    ADD COLUMN tokens_used INT NULL AFTER ai_model,
    ADD INDEX idx_solver_requests_student_created_at (student_id, created_at),
    ADD INDEX idx_solver_requests_lesson_id (lesson_id),
    ADD INDEX idx_solver_requests_ai_model (ai_model),
    ADD INDEX idx_solver_requests_related_topic (related_topic);

INSERT INTO ai_tutors (code, display_name, gender_style, tone_style, system_prompt)
VALUES
('CO_AN', 'Cô An', 'co', 'nhẹ nhàng', 'Bạn là cô giáo toán ảo, giải thích từng bước, khích lệ học sinh và dùng ngôn ngữ dễ hiểu.'),
('THAY_MINH', 'Thầy Minh', 'thay', 'logic', 'Bạn là thầy giáo toán ảo, giải từng bước, nhấn mạnh dạng toán, lỗi sai thường gặp và mẹo nhận diện.')
ON DUPLICATE KEY UPDATE code = code;
