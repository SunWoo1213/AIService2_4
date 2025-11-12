# Interview Results 단일 문서 스키마

**작성일**: 2025-11-12  
**목적**: 면접 데이터를 단일 문서로 통합하여 조회 효율성 극대화

---

## 🎯 설계 철학

### 기존 구조의 문제점
- `interview_reports` (1개) + `answer_evaluations` (5개) = **총 6개 문서 조회**
- 데이터 일관성 유지 어려움
- 부분 업데이트 시 여러 문서 수정 필요

### 새 구조의 장점
- ✅ **단일 문서 조회**: 1번의 `getDoc`으로 모든 데이터 획득
- ✅ **원자성 보장**: 하나의 문서에 모든 데이터 → 트랜잭션 불필요
- ✅ **히스토리 최적화**: 과거 기록 조회 시 속도 대폭 향상
- ✅ **데이터 일관성**: 면접 세션의 모든 정보가 하나의 단위로 관리됨

---

## 📂 컬렉션 구조

```
interview_results/
├─ [interviewId_1]/
│  ├─ interviewId
│  ├─ userId
│  ├─ overallFeedback {...}
│  └─ questions [5개 객체 배열]
│
├─ [interviewId_2]/
└─ ...
```

---

## 📋 필드 구조

### 문서 ID
- **형식**: `interviewId` 값을 문서 ID로 사용
- **예시**: `interview_1731398400000`
- **장점**: `interviewId`로 직접 문서 참조 가능

### 최상위 필드

```javascript
{
  // ===== 기본 정보 =====
  interviewId: string,           // 면접 세션 ID (문서 ID와 동일)
  userId: string,                // 사용자 ID
  
  // ===== 면접 메타데이터 =====
  resumeText: string,            // 참고한 이력서 내용
  jobKeywords: {                 // 직무 키워드
    position: string,
    skills: string[],
    experience: string,
    company: string
  },
  tonePreference: string,        // 피드백 톤 ('친근한', '전문적인', '격식있는')
  
  // ===== 종합 평가 =====
  overallFeedback: {
    overallConsistency: string,  // 전체 일관성 평가
    strengths: string,           // 종합 강점
    weaknesses: string,          // 종합 약점
    improvements: string,        // 개선 방향
    summary: string              // 최종 종합 평가
  } | null,                      // 초기: null, 생성 완료 후: 객체
  
  // ===== 개별 질문 및 답변 배열 =====
  questions: [
    {
      id: number,                // 질문 순서 (1, 2, 3, 4, 5)
      questionId: string,        // 질문 ID ('q1', 'q2', ...)
      question: string,          // 질문 내용
      answer: string,            // STT 변환된 답변 텍스트
      audioUrl: string | null,   // Firebase Storage URL
      audioPath: string,         // Storage 경로
      duration: number,          // 녹음 시간 (초)
      answeredAt: string,        // 답변 시각 (ISO 문자열)
      feedback: string | null    // 개별 피드백 (선택적)
    },
    // ... (총 5개)
  ],
  
  // ===== 통계 =====
  totalQuestions: number,        // 질문 개수 (5)
  completedQuestions: number,    // 완료된 질문 수
  totalDuration: number,         // 총 면접 시간 (초)
  averageDuration: number,       // 평균 답변 시간 (초)
  
  // ===== 타임스탬프 =====
  createdAt: string,             // 면접 시작 시각 (ISO)
  timestamp: Timestamp,          // Firestore 타임스탬프
  completedAt: string | null,    // 면접 완료 시각 (ISO)
  feedbackGeneratedAt: Timestamp | null,  // 종합 피드백 생성 시각
  updatedAt: string | null       // 마지막 업데이트 시각
}
```

---

## 📝 예시 문서

### 면접 완료 직후 (종합 피드백 생성 전)

```javascript
{
  interviewId: "interview_1731398400000",
  userId: "user123",
  resumeText: "저는 5년 경력의 백엔드 개발자입니다...",
  jobKeywords: {
    position: "백엔드 개발자",
    skills: ["Java", "Spring Boot", "MySQL"],
    experience: "경력 3-5년",
    company: "네이버"
  },
  tonePreference: "친근한",
  
  overallFeedback: null,  // ← 아직 생성 안됨
  
  questions: [
    {
      id: 1,
      questionId: "q1",
      question: "자기소개를 해주세요.",
      answer: "저는 5년 경력의 백엔드 개발자로, Spring Boot를 주로 사용하여...",
      audioUrl: "https://firebasestorage.googleapis.com/...",
      audioPath: "recordings/user123/interview_1731398400000/q1_1731398415000.webm",
      duration: 45,
      answeredAt: "2025-11-12T10:30:15Z",
      feedback: null
    },
    {
      id: 2,
      questionId: "q2",
      question: "가장 어려웠던 프로젝트는 무엇인가요?",
      answer: "대용량 트래픽 처리를 위해 MSA 아키텍처를 도입한 프로젝트가...",
      audioUrl: "https://firebasestorage.googleapis.com/...",
      audioPath: "recordings/user123/interview_1731398400000/q2_1731398470000.webm",
      duration: 60,
      answeredAt: "2025-11-12T10:31:10Z",
      feedback: null
    },
    // ... q3, q4, q5
  ],
  
  totalQuestions: 5,
  completedQuestions: 5,
  totalDuration: 225,
  averageDuration: 45,
  
  createdAt: "2025-11-12T10:30:00Z",
  timestamp: Timestamp,
  completedAt: "2025-11-12T10:33:45Z",
  feedbackGeneratedAt: null,
  updatedAt: null
}
```

### 종합 피드백 생성 후

```javascript
{
  // ... (위와 동일)
  
  overallFeedback: {
    overallConsistency: "답변들이 일관된 메시지를 전달하며 논리적 흐름이 우수합니다.",
    strengths: "기술적 역량 설명이 구체적이고 명확합니다. 특히 MSA 아키텍처 경험이 두드러집니다.",
    weaknesses: "협업 경험에 대한 구체적 사례가 부족합니다. STAR 기법을 활용하면 더 효과적입니다.",
    improvements: "1. 팀 내 역할을 명확히 설명하세요 (예: 기술 리더, 멘토링)\n2. 정량적 성과 지표를 추가하세요\n3. 실패 경험과 교훈을 공유하세요",
    summary: "전반적으로 양호하나 실무 경험의 깊이를 더 보여주어야 합니다."
  },
  
  // ...
  
  feedbackGeneratedAt: Timestamp,
  updatedAt: "2025-11-12T10:35:00Z"
}
```

---

## 🔍 조회 패턴

### 1. 특정 면접 결과 조회 (결과 페이지)

```javascript
// Before (6번 조회)
const report = await getDoc(doc(db, 'interview_reports', reportId));
const answers = await getDocs(query(
  collection(db, 'answer_evaluations'),
  where('interviewId', '==', interviewId)
));

// After (1번 조회) ✅
const result = await getDoc(doc(db, 'interview_results', interviewId));
const data = result.data();

// 바로 사용 가능
console.log(data.overallFeedback);
console.log(data.questions); // 5개 배열
```

### 2. 사용자 면접 히스토리 조회

```javascript
const q = query(
  collection(db, 'interview_results'),
  where('userId', '==', userId),
  orderBy('createdAt', 'desc')
);

const snapshot = await getDocs(q);
const interviews = snapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));

// 리스트에 표시
interviews.forEach(interview => {
  console.log(interview.createdAt);
  console.log(interview.overallFeedback?.summary);
  console.log(`질문 ${interview.completedQuestions}개 완료`);
});
```

### 3. 실시간 업데이트 (종합 피드백 생성 대기)

```javascript
// 결과 페이지에서 실시간 구독
const unsubscribe = onSnapshot(
  doc(db, 'interview_results', interviewId),
  (docSnapshot) => {
    const data = docSnapshot.data();
    
    if (data.overallFeedback) {
      console.log('✅ 종합 피드백 생성 완료!');
      setFeedback(data.overallFeedback);
    } else {
      console.log('⏳ 종합 피드백 생성 중...');
    }
  }
);
```

---

## 🔄 데이터 저장 흐름

### 1단계: 면접 시작 시

```javascript
// interview/page.js - handleInterviewStart
const interviewId = `interview_${Date.now()}`;

await setDoc(doc(db, 'interview_results', interviewId), {
  interviewId: interviewId,
  userId: user.uid,
  resumeText: selectedResume,
  jobKeywords: jobKeywords,
  tonePreference: tone,
  overallFeedback: null,
  questions: [],  // 빈 배열
  totalQuestions: 5,
  completedQuestions: 0,
  totalDuration: 0,
  averageDuration: 0,
  createdAt: new Date().toISOString(),
  timestamp: Timestamp.now(),
  completedAt: null,
  feedbackGeneratedAt: null,
  updatedAt: null
});
```

### 2단계: 각 질문 답변 시

```javascript
// InterviewUI.jsx - handleStopRecording
const questionData = {
  id: questionIndex,
  questionId: `q${questionIndex}`,
  question: currentQuestion,
  answer: transcript,
  audioUrl: uploadedUrl,
  audioPath: storagePath,
  duration: recordingDuration,
  answeredAt: new Date().toISOString(),
  feedback: null
};

// Firestore Array Union으로 추가
await updateDoc(doc(db, 'interview_results', interviewId), {
  questions: arrayUnion(questionData),
  completedQuestions: increment(1),
  totalDuration: increment(recordingDuration),
  updatedAt: new Date().toISOString()
});
```

### 3단계: 면접 완료 시

```javascript
// InterviewUI.jsx - handleInterviewComplete
await updateDoc(doc(db, 'interview_results', interviewId), {
  completedAt: new Date().toISOString(),
  averageDuration: totalDuration / 5,
  updatedAt: new Date().toISOString()
});

// 종합 피드백 생성 API 호출 (백그라운드)
fetch('/api/interview/generate-overall-feedback', {
  method: 'POST',
  body: JSON.stringify({ interviewId, userId })
});
```

### 4단계: 종합 피드백 생성 (백그라운드)

```javascript
// /api/interview/generate-overall-feedback/route.js

// 1. 문서 조회 (1번만!)
const docRef = doc(db, 'interview_results', interviewId);
const docSnap = await getDoc(docRef);
const data = docSnap.data();

// 2. LLM 프롬프트 구성
const prompt = data.questions.map((q, i) => 
  `Q${i+1}: ${q.question}\nA${i+1}: ${q.answer}`
).join('\n\n');

// 3. LLM 호출
const feedback = await generateFeedback(prompt);

// 4. 문서 업데이트
await updateDoc(docRef, {
  overallFeedback: feedback,
  feedbackGeneratedAt: Timestamp.now(),
  updatedAt: new Date().toISOString()
});
```

---

## 📊 Firestore 인덱스

### 필수 인덱스

```json
{
  "indexes": [
    {
      "collectionGroup": "interview_results",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## 🔒 보안 규칙

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    match /interview_results/{interviewId} {
      // 읽기: 본인만
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      
      // 생성: 본인만, userId 일치 필수
      allow create: if request.auth != null &&
                       request.resource.data.userId == request.auth.uid;
      
      // 업데이트: 본인만, userId 변경 불가
      allow update: if request.auth != null &&
                       resource.data.userId == request.auth.uid &&
                       request.resource.data.userId == resource.data.userId;
      
      // 삭제: 본인만
      allow delete: if request.auth != null &&
                       resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## ⚠️ 주의사항

### 1. Firestore 문서 크기 제한

- **최대 크기**: 1MB
- **예상 크기**: 
  - 질문 5개 × (질문 200B + 답변 1KB + URL 200B) ≈ 7KB
  - 종합 피드백: 2KB
  - **총 예상**: ~10KB ✅ 충분히 안전

### 2. 배열 순서 보장

- `questions` 배열에 추가 시 `id` 필드로 정렬 보장
- 프론트엔드에서 `.sort((a, b) => a.id - b.id)` 추가 권장

### 3. 부분 업데이트

```javascript
// 특정 질문만 업데이트 (비추천)
// 배열 전체를 다시 써야 함

// 대신: 처음부터 완성된 객체 추가 권장
```

---

## 📈 성능 비교

### 조회 성능

| 작업 | 기존 구조 | 새 구조 |
|------|----------|---------|
| 결과 페이지 로딩 | 6번 조회 | **1번 조회** ✅ |
| 히스토리 리스트 | N번 조회 | **N번 조회** (동일) |
| 히스토리 상세 | 6번 조회 | **1번 조회** ✅ |
| 실시간 업데이트 | 2개 구독 | **1개 구독** ✅ |

### 저장 성능

| 작업 | 기존 구조 | 새 구조 |
|------|----------|---------|
| 면접 시작 | 1번 쓰기 | 1번 쓰기 (동일) |
| 답변 추가 | 1번 쓰기 | 1번 업데이트 (동일) |
| 종합 피드백 | 1번 업데이트 | 1번 업데이트 (동일) |

---

## 🎯 마이그레이션 가이드

### 기존 데이터 이전

```javascript
// 기존 interview_reports + answer_evaluations → interview_results

const reports = await getDocs(collection(db, 'interview_reports'));

for (const reportDoc of reports.docs) {
  const report = reportDoc.data();
  
  // 해당 면접의 모든 답변 조회
  const answersQuery = query(
    collection(db, 'answer_evaluations'),
    where('interviewId', '==', report.interviewId),
    orderBy('questionIndex', 'asc')
  );
  const answersSnap = await getDocs(answersQuery);
  
  const questions = answersSnap.docs.map((doc, index) => {
    const data = doc.data();
    return {
      id: index + 1,
      questionId: data.questionId,
      question: data.question,
      answer: data.transcript,
      audioUrl: data.audioURL,
      audioPath: data.audioPath,
      duration: data.duration,
      answeredAt: data.createdAt,
      feedback: null
    };
  });
  
  // 새 문서 생성
  await setDoc(doc(db, 'interview_results', report.interviewId), {
    interviewId: report.interviewId,
    userId: report.userId,
    resumeText: report.resumeText,
    jobKeywords: report.jobKeywords,
    tonePreference: report.tonePreference,
    overallFeedback: report.overallFeedback,
    questions: questions,
    totalQuestions: questions.length,
    completedQuestions: questions.length,
    totalDuration: questions.reduce((sum, q) => sum + q.duration, 0),
    averageDuration: questions.reduce((sum, q) => sum + q.duration, 0) / questions.length,
    createdAt: report.createdAt,
    timestamp: report.timestamp,
    completedAt: report.createdAt,
    feedbackGeneratedAt: report.feedbackGeneratedAt,
    updatedAt: report.updatedAt
  });
}
```

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant  
**버전**: 1.0.0

