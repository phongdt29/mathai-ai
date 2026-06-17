# MathAI Quick Reference Guide

## 📍 Key File Locations

### Student Classification
- **File**: `packages/backend/src/services/auth.service.ts` (lines 258-278)
- **Function**: `resolveInitialClassification(data)`
- **Input**: Student's math average score or self-rating
- **Output**: Classification: "weak" | "average" | "good" | "excellent"

### Assessment System
- **Main Service**: `packages/backend/src/services/assessment.service.ts` (748 lines)
- **Generation**: `generateDiagnostic(studentId, options)` - AI creates test
- **Grading**: `submitAndGradeAssessment(studentId, assessmentId, answers)` - Auto + AI
- **Analysis**: `analyzePerformance()` - Returns strengths/weaknesses/recommendations

### Curriculum Management
- **Main Service**: `packages/backend/src/services/curriculum.service.ts` (658 lines)
- **Generation**: `generateCurriculum(studentId, options)` - Creates personalized path
- **Structure**: Curricula → Modules → Lessons → Exercises
- **Adaptation**: Difficulty auto-adjusted based on student classification

### Progress Tracking
- **Model**: `packages/backend/src/models/progress.model.ts`
- **Tables**: 
  - `student_progress` - Overall metrics (completion %, streak, avg score)
  - `topic_mastery` - Per-topic mastery (level 0-100, strength label)
- **Update Trigger**: After each assessment

### Lesson Recommendations
- **Data Model**: `packages/backend/src/models/lesson.model.ts` (lines 46-52)
- **Table**: `lesson_recommendations` (type, priority, date, is_completed)
- **Status**: ⚠️ Data model ready, routes TODO

### Parent Monitoring
- **Frontend Pages**: `packages/frontend/src/app/(parent)/parent/` (5 pages)
- **Pages**:
  1. `/parent` - Dashboard with child cards
  2. `/parent/children` - Child management
  3. `/parent/reports` - Analytics & trends
  4. `/parent/notifications` - Alerts & achievements
  5. `/parent/settings` - Preferences
- **Status**: ⚠️ UI complete, backend API TODO

### Risk Scoring
- **Infrastructure**: `student_progress`, `topic_mastery` tables
- **Indicators Available**: mastery_level, strength_label, average_quiz_score, streak
- **Status**: ❌ Not implemented (algorithm needed)

---

## 🗂️ Database Schema Cheat Sheet

### Student Identity
```sql
users (id, email, password_hash, role='student', is_active)
student_profiles (id, user_id, grade_level, self_assessed_level, initial_classification, ...)
```

### Classification
```sql
-- At registration:
student_profiles.initial_classification = math_score < 4 ? 'weak' : ...
student_profiles.self_assessed_level = 'weak' | 'average' | 'good' | 'excellent'
student_profiles.grade_level = 1-12
```

### Assessment
```sql
assessments (id, student_id, type, title, grade_level, total_questions, status)
assessment_questions (id, assessment_id, question_type, difficulty_level, topic, ...)
assessment_attempts (id, assessment_id, student_id, status='graded', percentage, ai_feedback)
assessment_answers (id, attempt_id, question_id, is_correct, score, ai_comment)
```

### Curriculum & Lessons
```sql
curricula (id, student_id, title, input_level, status='active', ...)
curriculum_modules (id, curriculum_id, module_title, topic, order_index, status)
lessons (id, curriculum_id, module_id, student_id, lesson_title, theory_content, ...)
lesson_exercises (id, lesson_id, question_text, difficulty_level, explanation, ...)
```

### Progress & Mastery
```sql
student_progress (id, student_id, completion_percentage, average_quiz_score, current_streak_days, ...)
topic_mastery (id, student_id, topic, mastery_level=0-100, strength_label='weak'|'strong'|'mastered')
lesson_recommendations (id, student_id, lesson_id, recommendation_type, priority, recommended_date)
```

### AI & Notifications
```sql
ai_tutors (id, code, display_name, gender_style, system_prompt)
ai_tutor_conversations (id, student_id, ai_tutor_id, status='active')
ai_tutor_messages (id, conversation_id, role='student'|'tutor', content)
ai_generation_logs (id, student_id, generation_type, ai_model, tokens_input, tokens_output, cost_usd)
notifications (id, user_id, title, type='reminder'|'achievement'|'recommendation', is_read)
```

---

## 🔌 API Endpoints Reference

### Authentication
```
POST   /api/auth/register        → Classification happens here
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/me
```

### Student Profile
```
GET    /api/students/profile     → See grade_level, initial_classification
PUT    /api/students/profile     → Update profile
GET    /api/students/tutors      → List AI tutors
PUT    /api/students/select-tutor
```

### Assessment (Primary for classification validation)
```
POST   /api/assessments/generate-diagnostic
POST   /api/assessments/:id/start-attempt
POST   /api/assessments/:id/submit
POST   /api/assessments/:id/grade
GET    /api/assessments/:id/result
```

### Curriculum & Lessons
```
POST   /api/curricula/generate   → AI creates personalized path
GET    /api/curricula/:id        → Full curriculum with all content
GET    /api/lessons              → List lessons
GET    /api/lessons/:id          → Lesson with exercises
GET    /api/lessons/today-recommendation  → TODO
```

### Other
```
POST   /api/solver/solve         → Math problem solver
POST   /api/chat/send-message    → AI tutor chat
GET    /api/dashboard/progress   → TODO
GET    /api/dashboard/stats      → TODO
GET    /api/dashboard/mastery    → TODO
```

---

## 🎯 Implementation Priority Order

### Phase 1: Complete Missing Routes (1-2 days)
```typescript
// 1. Lesson Recommendations
GET /api/lessons/today-recommendation
  → Query: SELECT * FROM lesson_recommendations 
      WHERE student_id = ? AND recommended_date <= NOW() 
      AND is_completed = FALSE
      ORDER BY priority DESC
      LIMIT 1

// 2. Dashboard Endpoints
GET /api/dashboard/progress
GET /api/dashboard/stats
GET /api/dashboard/mastery
```

### Phase 2: Parent Accounts (2-3 days)
```typescript
// 1. Add 'parent' role
UserRole = 'student' | 'admin' | 'teacher' | 'parent'

// 2. Create relationship table
CREATE TABLE parent_student_relationships (
  id, parent_id, student_id, relationship, created_at
)

// 3. New endpoints
GET    /api/parent/children
GET    /api/parent/children/:id/profile
GET    /api/parent/children/:id/progress
GET    /api/parent/children/:id/reports
POST   /api/parent/children/link
```

### Phase 3: Risk Scoring (3-5 days)
```typescript
// Create: services/risk-scoring.service.ts
class RiskScoringService {
  // Pseudo-code:
  // 1. Get all weak topics (mastery < 40%)
  // 2. Check last activity (inactivity > 7 days = -20pts)
  // 3. Calculate avg score trend (declining = -15pts)
  // 4. Check streak (broken = -10pts)
  // 5. Calculate risk_score (0-100)
  // 6. Generate alert if > 60
  // 7. Create notification for parent
}
```

### Phase 4: Real-time Alerts (Optional, 2+ days)
```typescript
// WebSocket for parent notifications
// Auto-trigger on:
// - Student completes assessment
// - Risk score calculated
// - Achievement unlocked
// - Low performance detected
```

---

## 🔍 Code Navigation Map

**To find X, look here:**

| Need to find... | Look in... | Lines |
|---|---|---|
| Student classification logic | auth.service.ts | 258-278 |
| Assessment generation | assessment.service.ts | 83-150 |
| Grading logic | assessment.service.ts | 300-371 |
| Topic mastery update | assessment.service.ts | 425-476 |
| Curriculum generation | curriculum.service.ts | 160-350 |
| Student profile | student.service.ts | 34-111 |
| All types | types/index.ts | 1-513 |
| All validators | validators/*.ts | - |
| All routes | routes/index.ts | 1-20 |
| Database schema | database/schema.sql | 1-422 |
| Parent pages | (parent)/parent/*.tsx | - |

---

## 💡 Quick Tips

### Run Development Server
```bash
npm run dev  # Starts both backend (:3001) and frontend (:3444)
```

### Test an Endpoint
```bash
# Register a student
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "full_name": "Nguyễn Văn A",
    "grade_level": 9,
    "math_average_score": 6.5,
    "self_assessed_level": "aver
