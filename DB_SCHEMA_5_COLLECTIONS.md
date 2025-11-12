# 🗄️ 데이터베이스 스키마: 5대 컬렉션 구조

> **작성일**: 2025-11-12  
> **버전**: 2.0  
> **목적**: 데이터 정규화 및 관심사 분리 (Separation of Concerns)

---

## 📋 목차

1. [개요](#개요)
2. [컬렉션 1: users (유저 정보)](#1-users-유저-정보)
3. [컬렉션 2: job_postings (구인공고 정보)](#2-job_postings-구인공고-정보)
4. [컬렉션 3: resume_feedbacks (자기소개서 피드백)](#3-resume_feedbacks-자기소개서-피드백)
5. [컬렉션 4: interview_sessions (면접 질문/답변 세트)](#4-interview_sessions-면접-질문답변-세트)
6. [컬렉션 5: interview_evaluations (면접 답변 피드백)](#5-interview_evaluations-면접-답변-피드백)
7. [관계도 (ERD)](#관계도-erd)
8. [마이그레이션 가이드](#마이그레이션-가이드)

---

## 개요

### 설계 원칙

1. **데이터 정규화**: 면접 세션(답변)과 평가(피드백)를 분리하여 독립적 관리
2. **확장성**: 각 컬렉션이 독립적으로 확장 가능
3. **성능**: 필요한 데이터만 조회 가능 (불필요한 피드백 로드 방지)
4. **유지보수**: 각 컬렉션의 역할이 명확하여 수정 용이

### 컬렉션 간 관계

```
users (1) ----< (N) job_postings
  |
  +----< (N) resume_feedbacks
  |
  +----< (N) interview_sessions ----< (1) interview_evaluations
```

---

## 1. users (유저 정보)

### 용도
사용자 기본 프로필 및 이력 관리

### 필드 구조

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `uid` | String | ✅ | Firebase Auth UID (문서 ID로 사용) |
| `email` | String | ✅ | 사용자 이메일 |
| `name` | String | ✅ | 사용자 이름 |
| `career` | Object | ❌ | 경력 정보 |
| `career.years` | Number | ❌ | 경력 년수 |
| `career.company` | String | ❌ | 현재/이전 회사명 |
| `career.position` | String | ❌ | 직급/직책 |
| `certifications` | Array<String> | ❌ | 자격증 목록 |
| `skills` | Array<String> | ❌ | 보유 기술 스택 |
| `profileImageUrl` | String | ❌ | 프로필 이미지 URL |
| `createdAt` | Timestamp | ✅ | 계정 생성 시각 |
| `updatedAt` | Timestamp | ✅ | 마지막 수정 시각 |

### 예시 문서

```json
{
  "uid": "user123",
  "email": "user@example.com",
  "name": "홍길동",
  "career": {
    "years": 3,
    "company": "테크컴퍼니",
    "position": "주니어 개발자"
  },
  "certifications": [
    "정보처리기사",
    "AWS Solutions Architect"
  ],
  "skills": [
    "JavaScript",
    "React",
    "Node.js"
  ],
  "profileImageUrl": "https://...",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-15T10:30:00Z"
}
```

### Firestore 경로
```
/users/{uid}
```

---

## 2. job_postings (구인공고 정보)

### 용도
사용자가 등록한 채용 공고 내용 저장 및 관리

### 필드 구조

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `postingId` | String | ✅ | 공고 고유 ID (문서 ID로 사용) |
| `userId` | String | ✅ | 공고를 등록한 유저 ID (외래키) |
| `title` | String | ✅ | 공고 제목 |
| `companyName` | String | ✅ | 회사명 |
| `content` | String | ✅ | 공고 전체 텍스트 (원본) |
| `contentUrl` | String | ❌ | 공고 파일 URL (PDF 등) |
| `keywords` | Object | ❌ | AI가 추출한 키워드 |
| `keywords.requiredSkills` | Array<String> | ❌ | 필수 기술 |
| `keywords.preferredSkills` | Array<String> | ❌ | 우대 사항 |
| `keywords.responsibilities` | Array<String> | ❌ | 주요 업무 |
| `status` | String | ✅ | 'active', 'closed', 'draft' |
| `createdAt` | Timestamp | ✅ | 공고 등록 시각 |
| `updatedAt` | Timestamp | ✅ | 마지막 수정 시각 |

### 예시 문서

```json
{
  "postingId": "job_abc123",
  "userId": "user123",
  "title": "프론트엔드 개발자 채용",
  "companyName": "테크스타트업",
  "content": "React 및 TypeScript를 활용한 웹 애플리케이션 개발...",
  "contentUrl": "https://storage.../job_posting.pdf",
  "keywords": {
    "requiredSkills": ["React", "TypeScript", "Git"],
    "preferredSkills": ["Next.js", "GraphQL"],
    "responsibilities": ["UI 개발", "API 연동", "성능 최적화"]
  },
  "status": "active",
  "createdAt": "2024-02-01T09:00:00Z",
  "updatedAt": "2024-02-01T09:00:00Z"
}
```

### Firestore 경로
```
/job_postings/{postingId}
```

### 인덱스 (필요 시)
```
- userId (ASC) + createdAt (DESC)
- status (ASC) + createdAt (DESC)
```

---

## 3. resume_feedbacks (자기소개서 피드백)

### 용도
사용자가 작성한 자기소개서에 대한 AI 분석 결과 저장

### 필드 구조

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `feedbackId` | String | ✅ | 피드백 고유 ID (문서 ID로 사용) |
| `userId` | String | ✅ | 자소서 작성자 ID (외래키) |
| `jobPostingId` | String | ❌ | 연결된 공고 ID (외래키, 선택사항) |
| `originalContent` | String | ✅ | 자소서 원본 텍스트 |
| `feedbackContent` | String | ✅ | AI가 생성한 피드백 |
| `feedbackStructure` | Object | ❌ | 구조화된 피드백 |
| `feedbackStructure.strengths` | Array<String> | ❌ | 강점 목록 |
| `feedbackStructure.improvements` | Array<String> | ❌ | 개선 사항 목록 |
| `feedbackStructure.suggestions` | Array<String> | ❌ | 제안 사항 목록 |
| `rating` | Number | ❌ | 사용자 평가 (1~5) |
| `ratedAt` | Timestamp | ❌ | 평가 시각 |
| `createdAt` | Timestamp | ✅ | 피드백 생성 시각 |

### 예시 문서

```json
{
  "feedbackId": "resume_xyz789",
  "userId": "user123",
  "jobPostingId": "job_abc123",
  "originalContent": "저는 3년간 React 개발 경험이 있으며...",
  "feedbackContent": "전반적으로 경력과 기술 스택이 잘 드러나 있습니다. 다만...",
  "feedbackStructure": {
    "strengths": [
      "구체적인 프로젝트 경험 언급",
      "기술 스택 명확하게 제시"
    ],
    "improvements": [
      "성과 지표 추가 필요",
      "팀 협업 경험 보강"
    ],
    "suggestions": [
      "STAR 기법 활용 권장",
      "회사와의 적합성 강조"
    ]
  },
  "rating": 5,
  "ratedAt": "2024-02-02T15:30:00Z",
  "createdAt": "2024-02-02T10:00:00Z"
}
```

### Firestore 경로
```
/resume_feedbacks/{feedbackId}
```

### 인덱스 (필요 시)
```
- userId (ASC) + createdAt (DESC)
- jobPostingId (ASC) + createdAt (DESC)
```

---

## 4. interview_sessions (면접 질문/답변 세트)

### 용도
면접 1회분(Q1~Q5)의 질문과 사용자의 음성 답변 데이터 저장  
**주의**: 피드백은 포함하지 않음 (5번 컬렉션에서 관리)

### 필드 구조

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `interviewId` | String | ✅ | 면접 세션 고유 ID (문서 ID로 사용) |
| `userId` | String | ✅ | 면접 응시자 ID (외래키) |
| `jobPostingId` | String | ❌ | 연결된 공고 ID (외래키, 선택사항) |
| `status` | String | ✅ | 'completed', 'in_progress', 'abandoned' |
| `questionCount` | Number | ✅ | 총 질문 수 (기본값: 5) |
| `questions` | Array<Object> | ✅ | 질문/답변 배열 (최대 5개) |
| `questions[].qId` | String | ✅ | 질문 ID (q1, q2, ..., q5) |
| `questions[].question` | String | ✅ | AI가 생성한 질문 내용 |
| `questions[].answerTranscript` | String | ✅ | STT로 변환된 답변 텍스트 |
| `questions[].audioUrl` | String | ✅ | Firebase Storage에 저장된 음성 파일 URL |
| `questions[].duration` | Number | ✅ | 답변 시간 (초) |
| `questions[].recordedAt` | Timestamp | ✅ | 녹음 완료 시각 |
| `tonePreference` | String | ❌ | 선택한 면접 톤 ('formal', 'friendly', 'technical') |
| `createdAt` | Timestamp | ✅ | 면접 시작 시각 |
| `completedAt` | Timestamp | ❌ | 면접 완료 시각 |
| `updatedAt` | Timestamp | ✅ | 마지막 수정 시각 |

### 예시 문서

```json
{
  "interviewId": "interview_20241112_001",
  "userId": "user123",
  "jobPostingId": "job_abc123",
  "status": "completed",
  "questionCount": 5,
  "questions": [
    {
      "qId": "q1",
      "question": "자기소개를 부탁드립니다.",
      "answerTranscript": "안녕하세요. 3년차 프론트엔드 개발자 홍길동입니다...",
      "audioUrl": "https://storage.../interview_20241112_001/q1.webm",
      "duration": 120,
      "recordedAt": "2024-02-03T10:05:00Z"
    },
    {
      "qId": "q2",
      "question": "React에서 상태 관리 경험을 말씀해주세요.",
      "answerTranscript": "Redux와 Context API를 활용하여...",
      "audioUrl": "https://storage.../interview_20241112_001/q2.webm",
      "duration": 150,
      "recordedAt": "2024-02-03T10:08:00Z"
    },
    {
      "qId": "q3",
      "question": "가장 어려웠던 프로젝트는 무엇인가요?",
      "answerTranscript": "실시간 채팅 기능을 구현할 때...",
      "audioUrl": "https://storage.../interview_20241112_001/q3.webm",
      "duration": 180,
      "recordedAt": "2024-02-03T10:12:00Z"
    },
    {
      "qId": "q4",
      "question": "성능 최적화 경험이 있나요?",
      "answerTranscript": "React.memo와 useMemo를 활용하여...",
      "audioUrl": "https://storage.../interview_20241112_001/q4.webm",
      "duration": 140,
      "recordedAt": "2024-02-03T10:15:00Z"
    },
    {
      "qId": "q5",
      "question": "우리 회사에 지원한 이유는 무엇인가요?",
      "answerTranscript": "귀사의 기술 스택과 문화가...",
      "audioUrl": "https://storage.../interview_20241112_001/q5.webm",
      "duration": 130,
      "recordedAt": "2024-02-03T10:18:00Z"
    }
  ],
  "tonePreference": "formal",
  "createdAt": "2024-02-03T10:00:00Z",
  "completedAt": "2024-02-03T10:20:00Z",
  "updatedAt": "2024-02-03T10:20:00Z"
}
```

### Firestore 경로
```
/interview_sessions/{interviewId}
```

### 인덱스 (필요 시)
```
- userId (ASC) + createdAt (DESC)
- status (ASC) + createdAt (DESC)
- jobPostingId (ASC) + createdAt (DESC)
```

---

## 5. interview_evaluations (면접 답변 피드백)

### 용도
면접 세션에 대한 AI의 평가 결과 저장 (답변과 분리하여 관리)

### 설계 의도
- **데이터 분리**: 답변(interview_sessions)과 평가(interview_evaluations)를 독립 관리
- **성능 최적화**: 평가가 필요할 때만 조회
- **버전 관리**: 동일 세션에 대해 여러 버전의 평가 가능 (선택사항)

### 필드 구조

| 필드명 | 타입 | 필수 | 설명 |
|--------|------|------|------|
| `evaluationId` | String | ✅ | 평가 고유 ID (문서 ID로 사용) |
| `interviewId` | String | ✅ | 평가 대상 면접 세션 ID (외래키, 1:1 관계) |
| `userId` | String | ✅ | 면접 응시자 ID (외래키) |
| `overallReview` | String | ✅ | 종합 평가 (전체 답변에 대한 총평) |
| `questionEvaluations` | Array<Object> | ✅ | 각 질문별 평가 배열 (5개) |
| `questionEvaluations[].qId` | String | ✅ | 질문 ID (q1, q2, ..., q5) |
| `questionEvaluations[].feedback` | String | ✅ | 해당 질문/답변에 대한 AI 코멘트 |
| `questionEvaluations[].score` | Number | ❌ | **삭제됨** (점수제 제거) |
| `modelVersion` | String | ❌ | 평가에 사용된 LLM 모델 (예: "gpt-4o-mini") |
| `generatedAt` | Timestamp | ✅ | 평가 생성 시각 |
| `createdAt` | Timestamp | ✅ | 문서 생성 시각 |

### 예시 문서

```json
{
  "evaluationId": "eval_20241112_001",
  "interviewId": "interview_20241112_001",
  "userId": "user123",
  "overallReview": "전반적으로 기술적 역량과 경험을 잘 설명하셨습니다. 특히 상태 관리와 성능 최적화 부분에서 구체적인 사례를 들어주신 점이 인상적이었습니다. 다만, 팀 협업 경험과 문제 해결 과정을 좀 더 상세히 설명하시면 더욱 좋을 것 같습니다.",
  "questionEvaluations": [
    {
      "qId": "q1",
      "feedback": "자기소개가 명확하고 간결합니다. 경력과 기술 스택을 잘 언급하셨으나, 본인만의 강점을 좀 더 부각하시면 좋겠습니다."
    },
    {
      "qId": "q2",
      "feedback": "Redux와 Context API에 대한 실무 경험을 구체적으로 설명하셨습니다. 다만, 왜 해당 기술을 선택했는지에 대한 배경 설명이 추가되면 더욱 설득력이 있을 것 같습니다."
    },
    {
      "qId": "q3",
      "feedback": "프로젝트의 어려움과 해결 과정을 잘 설명하셨습니다. 실시간 채팅 구현 시 발생한 구체적인 문제와 해결책이 인상적입니다."
    },
    {
      "qId": "q4",
      "feedback": "React.memo와 useMemo 활용 사례가 좋습니다. 성능 개선 수치(예: 렌더링 시간 감소율)를 함께 언급하시면 더욱 효과적입니다."
    },
    {
      "qId": "q5",
      "feedback": "회사에 대한 관심과 지원 동기가 잘 드러납니다. 다만, 회사의 구체적인 프로젝트나 기술 스택과 본인의 경험을 연결지어 설명하시면 더욱 좋겠습니다."
    }
  ],
  "modelVersion": "gpt-4o-mini",
  "generatedAt": "2024-02-03T10:22:00Z",
  "createdAt": "2024-02-03T10:22:00Z"
}
```

### Firestore 경로
```
/interview_evaluations/{evaluationId}
```

### 인덱스 (필요 시)
```
- interviewId (ASC) [UNIQUE 제약 - 1:1 관계]
- userId (ASC) + createdAt (DESC)
```

### 관계 설정
```javascript
// interview_evaluations의 interviewId는 interview_sessions의 문서 ID와 1:1 매핑
// 조회 시: 
const evaluationQuery = query(
  collection(db, 'interview_evaluations'),
  where('interviewId', '==', 'interview_20241112_001'),
  limit(1)
);
```

---

## 관계도 (ERD)

```
┌─────────────────────┐
│       users         │
│   (사용자 정보)      │
└──────────┬──────────┘
           │ 1
           │
           ├─────────────────┐
           │                 │
           │ N               │ N
   ┌───────▼──────────┐  ┌──▼─────────────────┐
   │  job_postings    │  │  resume_feedbacks  │
   │  (구인공고)       │  │  (자소서 피드백)    │
   └───────┬──────────┘  └────────────────────┘
           │ 1                       
           │                         
           │ N                       
   ┌───────▼────────────────┐
   │  interview_sessions    │◄──────┐
   │  (면접 질문/답변)       │       │ 1:1
   └────────────────────────┘       │
                                    │
                          ┌─────────┴──────────────────┐
                          │  interview_evaluations     │
                          │  (면접 답변 피드백)         │
                          └────────────────────────────┘
```

### 관계 설명

1. **users → job_postings** (1:N)
   - 한 사용자가 여러 공고 등록 가능

2. **users → resume_feedbacks** (1:N)
   - 한 사용자가 여러 자소서 피드백 보유

3. **job_postings → interview_sessions** (1:N) [선택적]
   - 한 공고에 대해 여러 면접 세션 진행 가능

4. **interview_sessions ↔ interview_evaluations** (1:1)
   - 한 면접 세션에 대해 하나의 평가만 존재
   - **핵심**: 답변과 평가를 분리하여 관리

---

## 마이그레이션 가이드

### 현재 구조 → 새 구조

#### 기존: interview_results (단일 컬렉션)
```json
{
  "interviewId": "...",
  "userId": "...",
  "questions": [...],
  "overallReview": "...",
  // 답변과 평가가 혼재
}
```

#### 신규: 분리된 구조

**1단계**: `interview_sessions` (답변만)
```json
{
  "interviewId": "...",
  "userId": "...",
  "questions": [
    {
      "qId": "q1",
      "question": "...",
      "answerTranscript": "...",
      "audioUrl": "..."
      // aiFeedback 제외!
    }
  ]
}
```

**2단계**: `interview_evaluations` (평가만)
```json
{
  "evaluationId": "...",
  "interviewId": "...",  // ← 외래키
  "userId": "...",
  "overallReview": "...",
  "questionEvaluations": [
    {
      "qId": "q1",
      "feedback": "..."
    }
  ]
}
```

### 마이그레이션 스크립트 (예시)

```javascript
// 기존 interview_results를 읽어서 분리
async function migrateInterviewData() {
  const oldDocs = await getDocs(collection(db, 'interview_results'));
  
  for (const oldDoc of oldDocs.docs) {
    const data = oldDoc.data();
    
    // 1. interview_sessions에 답변 데이터만 저장
    const sessionData = {
      interviewId: data.interviewId,
      userId: data.userId,
      jobPostingId: data.jobPostingId || null,
      status: 'completed',
      questionCount: data.questions.length,
      questions: data.questions.map(q => ({
        qId: q.id,
        question: q.question,
        answerTranscript: q.answer,
        audioUrl: q.audioUrl,
        duration: q.duration,
        recordedAt: q.createdAt
      })),
      createdAt: data.createdAt,
      completedAt: data.completedAt,
      updatedAt: data.updatedAt
    };
    await setDoc(doc(db, 'interview_sessions', data.interviewId), sessionData);
    
    // 2. interview_evaluations에 피드백 데이터만 저장
    if (data.overallReview || data.overallFeedback) {
      const evaluationData = {
        evaluationId: `eval_${data.interviewId}`,
        interviewId: data.interviewId,
        userId: data.userId,
        overallReview: data.overallReview || data.overallFeedback?.summary || '',
        questionEvaluations: data.questions.map(q => ({
          qId: q.id,
          feedback: q.aiFeedback || ''
        })),
        generatedAt: data.feedbackGeneratedAt || data.createdAt,
        createdAt: data.feedbackGeneratedAt || data.createdAt
      };
      await setDoc(
        doc(db, 'interview_evaluations', `eval_${data.interviewId}`), 
        evaluationData
      );
    }
  }
  
  console.log('✅ 마이그레이션 완료!');
}
```

---

## 장점 및 단점

### ✅ 장점

1. **관심사 분리**: 답변 데이터와 평가 데이터가 독립적으로 관리됨
2. **성능 최적화**: 
   - 히스토리 조회 시 평가 데이터 불필요 → 로드 시간 단축
   - 필요할 때만 평가 조회
3. **확장성**: 
   - 한 면접 세션에 대해 여러 버전의 평가 가능 (예: 모델 업그레이드)
   - 평가 로직 변경 시 기존 답변 데이터 영향 없음
4. **유지보수**: 각 컬렉션의 역할이 명확함

### ⚠️ 단점

1. **조회 복잡도 증가**: 
   - 답변 + 평가를 함께 보려면 2번 조회 필요
   - 클라이언트 코드 복잡도 증가
2. **데이터 일관성**: 
   - `interviewId` 외래키 관리 필요
   - 평가 없이 답변만 있는 경우 처리 필요
3. **비용**: 
   - Firestore 읽기 횟수 증가 (답변 1회 + 평가 1회)

---

## 권장 사항

### 언제 이 구조를 사용할까?

**✅ 적합한 경우:**
- 평가 생성이 오래 걸려서 별도 관리가 필요한 경우
- 히스토리 페이지에서 평가 없이 답변만 보여주는 경우
- 한 세션에 대해 여러 평가 버전을 관리하고 싶은 경우

**❌ 부적합한 경우:**
- 항상 답변과 평가를 함께 조회하는 경우
- 단순한 구조를 선호하는 경우
- Firestore 읽기 비용을 최소화하고 싶은 경우

### 대안: 하이브리드 접근

답변에 평가 요약만 포함하고, 상세 평가는 분리:

```json
// interview_sessions
{
  "questions": [
    {
      "qId": "q1",
      "feedbackSummary": "간단한 요약",  // 빠른 조회용
      "hasDetailedFeedback": true        // 상세 평가 존재 여부
    }
  ]
}

// interview_evaluations (상세 평가)
{
  "questionEvaluations": [
    {
      "qId": "q1",
      "detailedFeedback": "구체적이고 긴 피드백..."
    }
  ]
}
```

---

## 문의 및 지원

구조 변경이나 마이그레이션에 대한 질문이 있으시면 팀에 문의해주세요.

**작성자**: AI Assistant  
**마지막 업데이트**: 2025-11-12

