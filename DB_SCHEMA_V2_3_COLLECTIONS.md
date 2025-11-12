# 데이터베이스 스키마 V2 - 3개 독립 컬렉션 구조

## 📋 개요

**업데이트 일자**: 2025-11-12  
**변경 사항**: 단일 `feedbacks` 컬렉션 → 3개 독립 컬렉션으로 분리  
**목적**: 데이터 성격별 명확한 분리, 관리 용이성, 확장성 향상

---

## 🗂️ 컬렉션 구조 개요

```
Firestore Database
├─ resume_feedbacks        (자기소개서 피드백)
├─ interview_reports       (면접 종합 피드백)
├─ answer_evaluations      (개별 답변 평가)
├─ user_preferences        (사용자 설정)
└─ voice_transcriptions    (음성 전사 임시 데이터)
```

---

## 1. `resume_feedbacks` 컬렉션

**용도**: 사용자가 업로드한 자기소개서/이력서에 대한 AI 분석 결과 저장

### 필드 구조

```javascript
{
  // 기본 정보
  userId: string,              // 사용자 ID
  resumeId: string,            // 이력서 ID (고유값, 예: resume_1699999999999)
  
  // 이력서 내용
  resumeText: string,          // 원본 자기소개서 텍스트
  inputMode: string,           // 'text' | 'voice'
  
  // 직무 정보
  jobKeywords: {
    position: string,          // 희망 직무
    skills: string[],          // 필요 기술
    experience: string,        // 경력 수준
    company: string            // 지원 회사 (선택)
  },
  
  // AI 피드백
  structuredFeedback: {
    oneSentenceSummary: string,     // 한 문장 요약
    actionableFeedback: [           // 실행 가능한 피드백 리스트
      { id: number, advice: string }
    ],
    fullAnalysis: string            // 전체 분석
  },
  
  // 사용자 평가
  userRating: string | null,   // 'good' | 'bad' | null
  ratingReason: string | null, // 평가 사유
  ratingTimestamp: timestamp | null,
  
  // 메타데이터
  tonePreference: string,      // 피드백 톤 ('친근한', '전문적인', '격식있는')
  createdAt: string,           // ISO 날짜 문자열
  timestamp: timestamp,        // Firestore 타임스탬프
  updatedAt: string | null     // 마지막 업데이트
}
```

### 예시 문서

```javascript
{
  userId: "user123",
  resumeId: "resume_1699999999999",
  resumeText: "저는 5년 경력의 백엔드 개발자입니다...",
  inputMode: "text",
  jobKeywords: {
    position: "백엔드 개발자",
    skills: ["Java", "Spring Boot", "MySQL"],
    experience: "경력 3-5년",
    company: "네이버"
  },
  structuredFeedback: {
    oneSentenceSummary: "기술 스택이 명확하나 프로젝트 성과 수치화 필요",
    actionableFeedback: [
      { id: 1, advice: "프로젝트 성과를 수치로 표현하세요 (예: 성능 30% 향상)" },
      { id: 2, advice: "사용한 기술의 이유를 설명하세요" }
    ],
    fullAnalysis: "전반적으로 잘 작성되었으나..."
  },
  userRating: "good",
  tonePreference: "친근한",
  createdAt: "2025-11-12T10:00:00Z",
  timestamp: Timestamp
}
```

### 인덱스 설계

```javascript
// Firestore Composite Index
{
  collection: 'resume_feedbacks',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'createdAt', order: 'DESCENDING' }
  ]
}
```

---

## 2. `interview_reports` 컬렉션

**용도**: 면접(5개 질문 1세트) 완료 후 생성되는 종합 피드백 저장

### 필드 구조

```javascript
{
  // 기본 정보
  userId: string,              // 사용자 ID
  interviewId: string,         // 면접 세션 ID (고유값, 예: interview_1699999999999)
  
  // 면접 설정
  resumeText: string,          // 참고한 이력서 내용
  jobKeywords: object,         // 직무 키워드
  tonePreference: string,      // 선호 톤
  
  // ===== [세트 기반] 종합 피드백 =====
  overallFeedback: {
    overallConsistency: string,  // 전체 일관성 평가
    strengths: string,           // 전체 면접에서의 강점
    weaknesses: string,          // 전체 면접에서의 약점
    improvements: string,        // 구체적 개선 방향
    summary: string              // 최종 종합 평가
  },
  
  // 메타데이터
  questionCount: number,       // 질문 개수 (기본: 5)
  averageDuration: number,     // 평균 답변 시간 (초)
  totalDuration: number,       // 전체 면접 시간 (초)
  
  // 타임스탬프
  createdAt: string,           // 면접 시작 시각 (ISO 문자열)
  timestamp: timestamp,        // Firestore 타임스탬프
  feedbackGeneratedAt: timestamp | null,  // 종합 피드백 생성 시각
  updatedAt: string | null     // 마지막 업데이트 시각
}
```

### 예시 문서

```javascript
{
  userId: "user123",
  interviewId: "interview_1699999999999",
  resumeText: "...",
  jobKeywords: {...},
  tonePreference: "친근한",
  overallFeedback: {
    overallConsistency: "답변들이 일관된 메시지를 전달하며 논리적 흐름이 우수합니다.",
    strengths: "기술적 역량 설명이 구체적이고 명확합니다.",
    weaknesses: "협업 경험에 대한 구체적 사례가 부족합니다.",
    improvements: "STAR 기법을 활용하여 상황-과제-행동-결과를 명확히 구조화하세요.",
    summary: "전반적으로 양호하나 실무 경험의 깊이를 더 보여주어야 합니다."
  },
  questionCount: 5,
  averageDuration: 45,
  totalDuration: 225,
  createdAt: "2025-11-12T10:30:00Z",
  timestamp: Timestamp,
  feedbackGeneratedAt: Timestamp,
  updatedAt: "2025-11-12T10:32:00Z"
}
```

### 인덱스 설계

```javascript
// Firestore Composite Index
{
  collection: 'interview_reports',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'createdAt', order: 'DESCENDING' }
  ]
}
```

---

## 3. `answer_evaluations` 컬렉션

**용도**: 각 질문에 대한 개별 답변, 오디오 녹음, STT 텍스트 저장

### 필드 구조

```javascript
{
  // 기본 정보
  userId: string,              // 사용자 ID
  interviewId: string,         // 면접 세션 ID (interview_reports와 연결)
  questionId: string,          // 질문 ID (q1, q2, q3, q4, q5)
  questionIndex: number,       // 질문 순서 (1, 2, 3, 4, 5)
  
  // 질문과 답변
  question: string,            // 면접 질문 내용
  transcript: string,          // STT로 변환된 답변 텍스트
  
  // 오디오 파일
  audioURL: string | null,     // Firebase Storage 다운로드 URL
  audioPath: string,           // Storage 경로
  
  // ===== [세트 기반] 개별 피드백 제거 =====
  feedback: null,              // 항상 null (종합 피드백만 제공)
  
  // 메타데이터
  duration: number,            // 녹음 시간 (초)
  timestamp: timestamp,        // Firestore 타임스탬프
  createdAt: string,           // ISO 문자열 날짜
}
```

### 예시 문서

```javascript
{
  userId: "user123",
  interviewId: "interview_1699999999999",
  questionId: "q1",
  questionIndex: 1,
  question: "자기소개를 해주세요.",
  transcript: "저는 5년 경력의 백엔드 개발자입니다. Spring Boot를 사용하여...",
  audioURL: "https://firebasestorage.googleapis.com/v0/b/project.appspot.com/...",
  audioPath: "recordings/user123/interview_1699999999999/q1_1699999999999.webm",
  feedback: null,
  duration: 45,
  timestamp: Timestamp,
  createdAt: "2025-11-12T10:30:15Z"
}
```

### 인덱스 설계

```javascript
// Firestore Composite Index
// 면접 결과 페이지에서 특정 면접의 모든 답변을 순서대로 조회
{
  collection: 'answer_evaluations',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'interviewId', order: 'ASCENDING' },
    { fieldPath: 'questionIndex', order: 'ASCENDING' }
  ]
}

// 또는 timestamp 기준
{
  collection: 'answer_evaluations',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'interviewId', order: 'ASCENDING' },
    { fieldPath: 'timestamp', order: 'ASCENDING' }
  ]
}
```

### Storage 구조

```
gs://[your-bucket]/recordings/
  ├── [userId]/
  │   ├── [interviewId]/
  │   │   ├── q1_1699999999999.webm
  │   │   ├── q2_1700000000000.webm
  │   │   ├── q3_1700000001111.webm
  │   │   ├── q4_1700000002222.webm
  │   │   └── q5_1700000003333.webm
```

---

## 🔗 컬렉션 간 관계

### 면접 관련 데이터 연결

```
interview_reports (종합 피드백)
    ↓ (1:N 관계)
answer_evaluations (개별 답변 5개)

연결 키: interviewId
```

**조회 패턴**:
```javascript
// 1. interview_reports에서 종합 피드백 조회
const reportDoc = await getDoc(doc(db, 'interview_reports', interviewId));

// 2. answer_evaluations에서 개별 답변 리스트 조회
const answersQuery = query(
  collection(db, 'answer_evaluations'),
  where('interviewId', '==', interviewId),
  where('userId', '==', userId),
  orderBy('questionIndex', 'asc')
);
const answersSnapshot = await getDocs(answersQuery);
```

### 이력서 피드백 (독립적)

```
resume_feedbacks (독립 컬렉션)

연결 키: resumeId (독립적, 다른 컬렉션과 관계 없음)
```

---

## 📊 데이터 마이그레이션 가이드

### 기존 구조 (변경 전)

```
feedbacks/
├─ doc1: { type: 'resume', resumeText, ... }
├─ doc2: { type: 'interview', interviewId, overallFeedback, ... }
├─ doc3: { type: 'interview', interviewId, overallFeedback, ... }
└─ ...

interview_answers/
├─ doc1: { interviewId, questionId, feedback: null, ... }
├─ doc2: { interviewId, questionId, feedback: null, ... }
└─ ...
```

### 새 구조 (변경 후)

```
resume_feedbacks/
├─ doc1: { resumeId, resumeText, structuredFeedback, ... }
└─ ...

interview_reports/
├─ doc1: { interviewId, overallFeedback, ... }
├─ doc2: { interviewId, overallFeedback, ... }
└─ ...

answer_evaluations/
├─ doc1: { interviewId, questionId, transcript, audioURL, ... }
├─ doc2: { interviewId, questionId, transcript, audioURL, ... }
└─ ...
```

### 마이그레이션 스크립트 (참고용)

```javascript
// 기존 feedbacks에서 이력서 피드백 이동
const feedbacks = await getDocs(query(
  collection(db, 'feedbacks'),
  where('type', '==', 'resume')
));

feedbacks.forEach(async (doc) => {
  const data = doc.data();
  await addDoc(collection(db, 'resume_feedbacks'), {
    userId: data.userId,
    resumeId: data.id || `resume_${Date.now()}`,
    resumeText: data.resumeText,
    // ... 나머지 필드 매핑
  });
});

// 기존 feedbacks에서 면접 종합 피드백 이동
const interviews = await getDocs(query(
  collection(db, 'feedbacks'),
  where('type', '==', 'interview')
));

interviews.forEach(async (doc) => {
  const data = doc.data();
  await addDoc(collection(db, 'interview_reports'), {
    userId: data.userId,
    interviewId: data.interviewId,
    overallFeedback: data.overallFeedback,
    // ... 나머지 필드 매핑
  });
});

// interview_answers → answer_evaluations로 이름 변경 및 필드 정리
const answers = await getDocs(collection(db, 'interview_answers'));

answers.forEach(async (doc) => {
  const data = doc.data();
  await addDoc(collection(db, 'answer_evaluations'), {
    userId: data.userId,
    interviewId: data.interviewId,
    questionId: data.questionId,
    questionIndex: parseInt(data.questionId.replace('q', '')),
    question: data.question,
    transcript: data.transcript,
    audioURL: data.audioURL,
    audioPath: `recordings/${data.userId}/${data.interviewId}/${data.questionId}_${Date.now()}.webm`,
    feedback: null,
    duration: data.duration,
    timestamp: data.timestamp,
    createdAt: data.createdAt
  });
});
```

---

## 🔒 Firestore 보안 규칙

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // resume_feedbacks: 본인만 읽기/쓰기 가능
    match /resume_feedbacks/{feedbackId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
    
    // interview_reports: 본인만 읽기/쓰기 가능
    match /interview_reports/{reportId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
    
    // answer_evaluations: 본인만 읽기/쓰기 가능
    match /answer_evaluations/{answerId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## 📈 장점 및 개선 사항

### 변경 전 문제점

- ❌ 하나의 `feedbacks` 컬렉션에 이력서, 면접 데이터 혼재
- ❌ `type` 필드로 구분 (비효율적)
- ❌ 데이터 성격이 다른데 같은 구조 강요
- ❌ 확장 시 복잡도 증가

### 변경 후 장점

- ✅ **명확한 분리**: 각 컬렉션이 하나의 책임만 가짐
- ✅ **관리 용이**: 컬렉션 이름만 보고 데이터 성격 파악
- ✅ **확장성**: 새로운 피드백 타입 추가 시 독립적으로 컬렉션 생성
- ✅ **쿼리 최적화**: `type` 조건 불필요, 인덱스 효율 향상
- ✅ **코드 가독성**: 조회 로직이 명확함

---

## 🎯 마이그레이션 체크리스트

### 백엔드 수정

- [ ] 이력서 분석 API → `resume_feedbacks` 저장
- [ ] 면접 완료 API → `interview_reports` 저장
- [ ] 개별 답변 저장 → `answer_evaluations` 저장
- [ ] 종합 피드백 생성 API → `interview_reports` 업데이트

### 프론트엔드 수정

- [ ] 면접 결과 페이지 → `interview_reports` + `answer_evaluations` 조회
- [ ] 히스토리 페이지 → `resume_feedbacks`, `interview_reports` 분리 조회
- [ ] 이력서 피드백 페이지 → `resume_feedbacks` 조회

### 테스트

- [ ] 이력서 업로드 → 분석 → `resume_feedbacks` 저장 확인
- [ ] 면접 진행 → 답변 저장 → `answer_evaluations` 확인
- [ ] 면접 완료 → 종합 피드백 → `interview_reports` 확인
- [ ] 히스토리 페이지에서 각 타입별 조회 확인

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant  
**버전**: 2.0.0

