# MathAI Feature Matrix & Implementation Status

## 🎯 Requested Features Analysis

### 1. STUDENT CLASSIFICATION ✅

| Aspect | Details | Location | Status |
|--------|---------|----------|--------|
| **Method** | Score-based + Self-rating | auth.service.ts:258-278 | ✅ Complete |
| **Levels** | 4 tiers: weak, average, good, excellent | — | ✅ Complete |
| **Scoring** | Math avg score < 4 (weak) to ≥ 8 (excellent) | — | ✅ Complete |
| **Fallback** | Self-assessed rating if no score | — | ✅ Complete |
| **Storage** | initial_classification + self_assessed_level fields | student_profiles table | ✅ Complete |
| **Usage** | Affects curriculum difficulty & recommendations | curriculum.service.ts | ✅ Complete |

**Example Flows**:
- Student A: Math avg 3.5 → "weak" classification
- Student B: No score, self-rates "good" → "good" classification
- Student C: Math avg 8.2 → "excellent" classification

---

### 2. ASSESSMENT SYSTEM ✅

| Aspect | Details | Location | Status |
|--------|---------|----------|--------|
| **Assessment Types** | diagnostic, lesson_quiz, weekly_review, monthly_review | assessment.service.ts | ✅ Complete |
| **Question Types** | multiple_choice, short_answer, essay | — | ✅ Complete |
| **AI Generation** | GPT-4o-mini generates questions from prompts | ai.service.ts | ✅ Complete |
| **Auto Grading** | Multiple choice instant, open-ended via AI | assessment.service.ts:300-371 | ✅ Complete |
| **Feedback** | Strengths, weaknesses, recommendations | assessment.service.ts:344-356 | ✅ Complete |
| **Performance Analysis** | Overall score, percentage, topic breakdown | assessment.service.ts:425-476 | ✅ Complete |

**Key Endpoints**:
- `POST /api/assessments/generate-diagnostic` → Create AI test
- `POST /api/assessments/{id}/submit` → Submit answers
- `GET /api/assessments/{id}/result` → Get graded results + feedback

---

### 3. CURRICULUM MANAGEMENT ✅

| Aspect | Details | Location | Status |
|--------|---------|----------|--------|
| **Curriculum Generation** | AI-generated personalized paths | curriculum.service.ts | ✅ Complete |
| **Structure** | Modules → Lessons → Exercises | — | ✅ Complete |
| **Difficulty Adaptation** | easy, medium, hard based on student level | curriculum.service.ts:40 | ✅ Complete |
| **Content Types** | theory, practice, mixed lessons | — | ✅ Complete |
| **Progress Tracking** | locked → active → completed | curriculum_modules.status | ✅ Complete |
| **Module Mastery** | target_mastery per module | curriculum_modules table | ✅ Complete |

**Tables**:
- `curricula` - Path container
- `curriculum_modules` - Topics (order_index, estimated_sessions)
- `lessons` - Content delivery
- `lesson_exercises` - Practice problems

---

### 4. LESSON RECOMMENDATIONS ⚠️ Partial

| Aspect | Details | Location | Status |
|--------|---------|----------|--------|
| **Recommendation Types** | next_lesson, review, practice, challenge | types/index.ts:19 | ✅ Defined |
| **Data Model** | lesson_recommendations table with type, priority, date | lesson_recommendations | ✅ Complete |
| **Priority Ranking** | priority field (0-100) | — | ✅ Ready |
| **Date Scheduling** | recommended_date field | — | ✅ Ready |
| **API Endpoint** | GET /api/lessons/today-recommendation | lesson.routes.ts:13-15 | ❌ TODO |
| **Logic Algorithm** | Pick next lesson based on mastery + diagnostics | — | ❌ TODO |

**Database Ready But Routes Pending**:
```sql
SELECT * FROM lesson_recommendations 
WHERE student_id = ? 
  AND recommended_date = CURDATE()
  AND is_completed = FALSE
ORDER BY priority DESC
```

---

### 5. PARENT MONITORING ⚠️ Partially Implemented

| Aspect | Details | Location | Status |
|--------|---------|----------|--------|
| **Pages** | 5 parent-specific pages (dashboard, children, reports, notifications, settings) | (parent)/ folder | ✅ UI Complete |
| **Dashboard** | Overview cards showing child stats | parent/page.tsx | ✅ Scaffolding Done |
| **Children Management** | Link/unlink children accounts | parent/children/page.tsx | ✅ Page Created |
| **Reports & Analytics** | Performance trends, topic mastery charts | parent/reports/page.tsx | ✅ Page Created |
| **Notifications** | Achievement alerts, alerts | parent/notifications/page.tsx | ✅ Page Created |
| **Backend API** | Parent-specific endpoints for children data | routes/ | ❌ NOT IMPLEMENTED |
| **Access Control** | Parent can only see own children | middleware/auth | ⚠️ Partial |

**What Exists**:
- ✅ Frontend UI scaffolding for parent features
- ✅ Database schema supports parent relationship (notifications table)
- ✅ Student progress table tracks metrics needed

**What's Missing**:
- ❌ Parent user accounts (only students & admins implemented)
- ❌ Parent-student relationship table
- ❌ Endpoints: GET /api/parent/children, GET /api/parent/children/{id}/reports
- ❌ Parent-specific role in JWT & middleware

---

### 6. RISK SCORING ❌ Not Implemented

| Aspect | Details | Location | Status |
|--------|---------|----------|--------|
| **Infrastructure** | topic_mastery, student_progress tables | — | ✅ Ready |
| **Risk Indicators** | Low mastery, declining scores, inactivity | — | ✅ Data Available |
| **Algorithm** | Score calculation based on multiple factors | — | ❌ TODO |
| **Thresholds** | Define risk levels (low/medium/high) | — | ❌ TODO |
| **Alert Generation** | Create notifications for at-risk students | — | ❌ TODO |
| **Parent Alerts** | Send to parent when child at risk | — | ❌ TODO |

**Available Data Points**:
```sql
-- Student mastery per topic
SELECT topic, mastery_level, strength_label 
FROM topic_mastery 
WHERE student_id = ? AND strength_label = 'weak'

-- Overall progress
SELECT average_quiz_score, current_streak_days, 
       completion_percentage, last_study_date
FROM student_progress
WHERE student_id = ?
```

**Example Risk Calculation (Pseudo)**:
```
risk_score = 0
if (mastery < 40%) risk_score += 30 points  -- weak topics
if (avg_score < 50%) risk_score += 25 points -- low performance
if (inactive > 7 days) risk_score += 20 points -- no engagement
if (streak = 0) risk_score += 15 points -- broken streak
if (completion < 30%) risk_score += 10 points -- behind schedule

if (risk_score >= 60) → Alert parents
```

---

## 📊 Feature Implementation Summary

### ✅ FULLY IMPLEMENTED (4 Features)
1. **Student Classification** - 4-level system active on registration
2. **Assessment System** - AI generation, grading, feedback complete
3. **Curriculum Management** - Personalized paths with modules
4. **AI Tutor & Problem Solver** - 2 tutors, multi-turn chat, math solver

### ⚠️ PARTIALLY IMPLEMENTED (2 Features)
5. **Lesson Recommendations** - Data model ready, API routes TODO
6. **Parent Monitoring** - Frontend UI done, backend API & parent accounts TODO

### ❌ NOT IMPLEMENTED (1 Feature)
7. **Risk Scoring** - Infrastructure ready, algorithm & alerts TODO

---

## 🔄 Dependency Map

```
Registration
    ↓
Student Classification (score-based)
    ↓
Diagnostic Assessment (AI-generated)
    ↓
Curriculum Generation (adapted to level)
    ↓
Lessons + Exercises (AI-tutored)
    ↓
Quiz Assessment (auto-graded)
    ↓
Topic Mastery Update (per-topic tracking)
    ↓
Recommendation Generation (next lessons)
    ├→ Lesson Recommendations (ℹ️ Routes TODO)
    └→ Parent Monitoring (ℹ️ Backend API TODO)
         └→ Risk Scoring (❌ Not implemented)
```

---

## 🛠️ What Needs to Be Built

### Priority 1: Parent Monitoring Backend
```typescript
// Missing files/endpoints:
POST   /api/parent/children/link
DELETE /api/parent/children/{id}/unlink
GET    /api/parent/children
GET    /api/parent/children/{id}/profile
GET    /api/parent/children/{id}/progress
GET    /api/parent/children/{id}/reports
GET    /api/parent/notifications
POST   /api/parent/notifications/{id}/read
```

### Priority 2: Risk Scoring Algorithm
```typescript
// Create: services/risk-scoring.service.ts
class RiskScoringService {
  calculateRiskScore(studentId, options?): { score, level, factors }
  identifyAtRiskStudents(fromDate?): Student[]
  generateParentAlerts(studentId): Notification[]
}
```

### Priority 3: Lesson Recommendations
```typescript
// Complete: GET /ap
