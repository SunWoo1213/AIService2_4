# 면접 시스템 전체 프로세스 가이드

## 📋 개요

**현재 시스템**: 세트 기반 면접 시스템 (5개 질문 1세트)  
**피드백 방식**: 개별 피드백 ❌ → 종합 피드백 ✅  
**업데이트 일자**: 2025-11-12

---

## 🎯 면접 시스템 전체 흐름도

```
┌─────────────────────────────────────────────────────────────────┐
│                        1. 면접 시작                               │
│  - 이력서 선택 / 톤 선택 / 초기 질문 생성                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     2. 질문 1-5 답변                              │
│  각 질문마다:                                                      │
│  - 질문 TTS 재생                                                  │
│  - 음성 녹음 (MediaRecorder)                                      │
│  - STT 변환 (Browser SpeechRecognition)                         │
│  - Firebase Storage 업로드 (오디오 파일)                          │
│  - Firestore 저장 (답변 텍스트, audioURL, feedback: null)       │
│  - 즉시 다음 질문으로 진행 (피드백 대기 ❌)                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     3. 면접 완료 처리                              │
│  A. feedbacks 컬렉션에 메타데이터 저장                             │
│     - userId, interviewId, type: 'interview'                   │
│     - resumeText, jobKeywords, tonePreference                  │
│     - overallFeedback: null (초기값)                            │
│                                                                 │
│  B. 종합 피드백 생성 API 호출 (백그라운드)                         │
│     - /api/interview/generate-overall-feedback                 │
│     - 비동기 실행 (결과 페이지 이동 차단 ❌)                        │
│                                                                 │
│  C. 결과 페이지로 리다이렉트                                        │
│     - /interview/result/{interviewId}                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  4. 백그라운드 - 종합 피드백 생성                   │
│  (사용자는 결과 페이지에서 "생성 중..." 메시지 확인)                 │
│                                                                 │
│  API 처리 과정:                                                   │
│  1. interview_answers 컬렉션에서 5개 답변 조회                     │
│  2. questionId 순서대로 정렬 (q1, q2, q3, q4, q5)                │
│  3. LLM 프롬프트 구성 (5개 질문+답변 전체)                         │
│  4. OpenAI GPT-4o 호출 (종합 분석)                               │
│  5. feedbacks 문서의 overallFeedback 필드 업데이트                │
│                                                                 │
│  생성되는 데이터:                                                  │
│  - overallConsistency: 전체 일관성 평가                           │
│  - strengths: 전체 강점                                          │
│  - weaknesses: 전체 약점                                         │
│  - improvements: 구체적 개선 방향                                 │
│  - summary: 최종 종합 평가                                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    5. 결과 페이지 자동 업데이트                     │
│  - onSnapshot으로 실시간 구독                                     │
│  - overallFeedback 생성 완료 시 자동 표시                         │
│  - 5개 개별 답변 내역 표시 (오디오 재생 가능)                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      6. 히스토리에서 확인                          │
│  - feedbacks 컬렉션 조회                                          │
│  - "✅ 종합 피드백 완료" 뱃지 표시                                 │
│  - summary 미리보기                                               │
│  - 클릭 시 결과 페이지 이동                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 단계별 상세 설명

### 1단계: 면접 시작

**파일**: `src/app/interview/page.js`

**프로세스**:
```javascript
1. 사용자가 이력서 선택
   - feedbacks 컬렉션에서 이전 이력서 목록 조회
   - 선택한 이력서의 resumeText, jobKeywords 가져오기

2. 톤 선택
   - '친근한', '전문적인', '격식있는' 중 선택
   - 기본값: '친근한'

3. '면접 시작' 버튼 클릭
   - handleStartInterview() 실행
   - 고유한 interviewId 생성 (예: interview_1699999999999)
   - 초기 질문 생성 API 호출
   - InterviewUI 컴포넌트 렌더링
```

**생성되는 데이터**:
```javascript
interviewId = `interview_${Date.now()}`;
// 예: "interview_1699999999999"
```

**콘솔 로그 확인**:
```bash
[면접 시작] interviewId 생성: interview_1699999999999
[면접 시작] 초기 질문 생성 API 호출...
```

---

### 2단계: 질문 1-5 답변

**파일**: `src/app/components/InterviewUI.jsx`

#### 2-1. 질문 표시 및 TTS

```javascript
// 질문 데이터 구조
currentQuestion = {
  question: "첫 번째 질문입니다...",
  time_limit: 60  // 초
};

// TTS (Text-to-Speech) 재생
speakQuestion(currentQuestion.question);
```

**콘솔 로그**:
```bash
[TTS] speakQuestion 호출
[TTS] 텍스트: "첫 번째 질문입니다..."
```

#### 2-2. 음성 녹음

```javascript
// 녹음 시작
startRecording() {
  - MediaRecorder API 사용
  - 선택된 마이크 디바이스 사용
  - 타이머 시작 (60초)
}

// 녹음 종료
stopRecording() {
  - audioBlob 생성
  - Browser STT (SpeechRecognition) 결과 확인
  - 다음 단계로 전달
}
```

**콘솔 로그**:
```bash
[녹음] ✅ 녹음 시작
[녹음] - 마이크 디바이스: USB Microphone
[녹음] - 타이머: 60초

[녹음] ✅ 녹음 종료
[녹음] - 녹음 시간: 45초
[녹음] - audioBlob 크기: 250KB
[STT] 브라우저 STT 결과: "저는 백엔드 개발자입니다..."
```

#### 2-3. Firebase Storage 업로드

```javascript
// 오디오 파일 업로드
const storagePath = `recordings/${userId}/${interviewId}/q1_1699999999999.webm`;
await uploadBytes(storageReference, audioBlob);
const audioURL = await getDownloadURL(storageReference);
```

**저장 경로**:
```
gs://your-project.appspot.com/
└── recordings/
    └── {userId}/
        └── {interviewId}/
            ├── q1_1699999999999.webm
            ├── q2_1700000000000.webm
            ├── q3_1700000001111.webm
            ├── q4_1700000002222.webm
            └── q5_1700000003333.webm
```

**콘솔 로그**:
```bash
[진단 1] Firebase Storage 업로드 시작
[진단 1] - 경로: recordings/user123/interview_1699999999999/q1_1699999999999.webm
[진단 1] ✅ 업로드 완료!
[진단 1] ✅ Download URL 획득 성공
[진단 1] - audioURL: https://firebasestorage.googleapis.com/...
```

#### 2-4. Firestore 저장 (개별 답변)

```javascript
// saveAnswerInBackground() 실행
const answerData = {
  userId: userId,
  interviewId: interviewId,
  questionId: `q${questionCount + 1}`,  // q1, q2, q3, q4, q5
  question: "질문 내용",
  transcript: "답변 텍스트",
  audioURL: "https://...",
  feedback: null,  // ⭐ 개별 피드백 없음
  duration: 45,
  timestamp: Timestamp.now(),
  createdAt: "2025-11-12T10:30:00Z"
};

await addDoc(collection(db, 'interview_answers'), answerData);
```

**Firestore 구조**:
```
interview_answers/
├─ doc1: { userId, interviewId, questionId: "q1", feedback: null, ... }
├─ doc2: { userId, interviewId, questionId: "q2", feedback: null, ... }
├─ doc3: { userId, interviewId, questionId: "q3", feedback: null, ... }
├─ doc4: { userId, interviewId, questionId: "q4", feedback: null, ... }
└─ doc5: { userId, interviewId, questionId: "q5", feedback: null, ... }
```

**콘솔 로그**:
```bash
[답변 저장] 💾 개별 피드백 없이 답변 데이터만 저장합니다.
[답변 저장] 💡 5개 질문 완료 후 종합 피드백이 생성됩니다.

[백그라운드 평가] 📝 Firestore 저장 시작
[백그라운드 평가] - questionId: q1
[백그라운드 평가] ✅✅✅ Firestore 저장 성공! ✅✅✅
[백그라운드 평가] - 저장된 문서 ID: abc123xyz
```

#### 2-5. 다음 질문으로 진행

```javascript
// 즉시 다음 질문 요청 (피드백 대기 ❌)
const nextQuestionCount = questionCount + 1;

if (nextQuestionCount < MAX_QUESTIONS) {
  // 다음 질문 생성 (스트리밍)
  fetchNextQuestion();
} else {
  // 면접 완료
  handleInterviewComplete();
}
```

**콘솔 로그**:
```bash
[메인 플로우] 🚀 다음 질문 요청
[메인 플로우] - 현재 질문 번호: 1
[메인 플로우] - 다음 질문 번호: 2

=== 다음 질문 스트리밍 요청 ===
[스트리밍] 질문 2 생성 중...
```

---

### 3단계: 면접 완료 처리

**파일**: `src/app/interview/page.js` - `handleInterviewComplete()`

#### 3-1. feedbacks 컬렉션에 메타데이터 저장

```javascript
const interviewSummary = {
  userId: user.uid,
  type: 'interview',
  interviewId: interviewId,  // ⭐ 중요! 고유 면접 세션 ID
  resumeText: selectedFeedback?.resumeText || '',
  jobKeywords: selectedFeedback?.jobKeywords || {},
  tonePreference: selectedTone || '친근한',
  createdAt: new Date().toISOString(),
  timestamp: new Date(),
  overallFeedback: null  // ⭐ 초기값 (나중에 업데이트)
};

const docRef = await addDoc(collection(db, 'feedbacks'), interviewSummary);
```

**Firestore 구조**:
```
feedbacks/
└─ doc_xyz: {
     userId: "user123",
     type: "interview",
     interviewId: "interview_1699999999999",
     resumeText: "...",
     jobKeywords: {...},
     tonePreference: "친근한",
     createdAt: "2025-11-12T10:35:00Z",
     overallFeedback: null  ← 나중에 업데이트됨
   }
```

**콘솔 로그**:
```bash
========================================
[면접 완료] handleInterviewComplete 실행
[면접 완료] - interviewId: interview_1699999999999
[면접 완료] - userId: user123

[면접 완료] 💾 feedbacks 컬렉션에 저장 시작...
[면접 완료] ✅✅✅ feedbacks 컬렉션 저장 성공! ✅✅✅
[면접 완료] - 저장된 문서 ID: doc_xyz
[면접 완료] 💡 이제 히스토리 페이지에서 이 면접을 볼 수 있습니다!
========================================
```

#### 3-2. 종합 피드백 생성 API 호출 (백그라운드)

**파일**: `src/app/components/InterviewUI.jsx`

```javascript
// 비동기로 실행 (결과 페이지 이동 차단 ❌)
fetch('/api/interview/generate-overall-feedback', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    interviewId: interviewId,
    userId: userId
  }),
})
.then(response => response.json())
.then(result => {
  console.log('[종합 피드백] ✅ 생성 완료!');
})
.catch(error => {
  console.error('[종합 피드백] ❌ 생성 실패:', error);
});

// 즉시 결과 페이지로 이동 (API 응답 대기 ❌)
if (onComplete) {
  onComplete(interviewId);
}
```

**콘솔 로그**:
```bash
[종합 피드백] 🚀 5개 답변 종합 평가 시작
[종합 피드백] - interviewId: interview_1699999999999
[종합 피드백] - userId: user123

[면접 완료] 🚀 결과 페이지로 리다이렉트: /interview/result/interview_1699999999999
```

#### 3-3. 결과 페이지로 리다이렉트

```javascript
router.push(`/interview/result/${interviewId}`);
```

---

### 4단계: 백그라운드 - 종합 피드백 생성

**파일**: `src/app/api/interview/generate-overall-feedback/route.js`

**사용자 화면**: 결과 페이지에 "종합 피드백 생성 중..." 로딩 표시

#### 4-1. interview_answers 컬렉션에서 5개 답변 조회

```javascript
const answersRef = collection(db, 'interview_answers');
const q = query(
  answersRef,
  where('userId', '==', userId),
  where('interviewId', '==', interviewId)
);

const querySnapshot = await getDocs(q);
const answers = [];
querySnapshot.forEach((doc) => {
  answers.push({
    questionId: doc.data().questionId,
    question: doc.data().question,
    transcript: doc.data().transcript,
    duration: doc.data().duration
  });
});

// questionId 순서대로 정렬 (q1, q2, q3, q4, q5)
answers.sort((a, b) => {
  const numA = parseInt(a.questionId.replace('q', ''));
  const numB = parseInt(b.questionId.replace('q', ''));
  return numA - numB;
});
```

**콘솔 로그**:
```bash
========================================
[종합 피드백 API] POST 요청 수신
[종합 피드백 API] - interviewId: interview_1699999999999
[종합 피드백 API] - userId: user123

[종합 피드백 API] 🔍 1단계: Firestore에서 답변 조회 중...
[종합 피드백 API] 📊 조회 결과: 5개의 답변
[종합 피드백 API] ✅ 답변 정렬 완료: q1, q2, q3, q4, q5
```

#### 4-2. LLM 프롬프트 구성

```javascript
const answersText = answers.map((answer, index) => {
  return `
**질문 ${index + 1}**: ${answer.question}
**답변**: ${answer.transcript}
**답변 시간**: ${answer.duration}초
`;
}).join('\n---\n');

const systemPrompt = `당신은 채용 전문가이자 시니어 면접관입니다. 
지원자의 전체 면접 답변(5개 질문)을 종합적으로 분석하여 깊이 있는 피드백을 제공하세요.

평가 기준:
1. 전체적인 일관성
2. 강점
3. 약점
4. 개선 방향
5. 종합 평가`;

const userPrompt = `다음은 지원자의 전체 면접 답변 내역(1번~5번)입니다.
${answersText}`;
```

**콘솔 로그**:
```bash
[종합 피드백 API] 📝 2단계: LLM 프롬프트 구성 중...
[종합 피드백 API] ✅ 프롬프트 구성 완료
[종합 피드백 API] - 답변 개수: 5
[종합 피드백 API] - 프롬프트 길이: 2500 bytes
```

#### 4-3. OpenAI GPT-4o 호출

```javascript
const completion = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ],
  temperature: 0.7,
  max_tokens: 2000,
  response_format: { type: "json_object" }
});

const feedbackText = completion.choices[0].message.content;
const feedbackData = JSON.parse(feedbackText);
```

**LLM 응답 구조**:
```json
{
  "overallConsistency": "답변들이 일관된 메시지를 전달하며...",
  "strengths": "논리적 사고가 돋보이고...",
  "weaknesses": "구체적 사례가 부족하며...",
  "improvements": "STAR 기법을 활용하여...",
  "summary": "전반적으로 양호하나 깊이가 필요합니다."
}
```

**콘솔 로그**:
```bash
[종합 피드백 API] 🤖 3단계: LLM API 호출 중...
[종합 피드백 API] - 모델: gpt-4o
[종합 피드백 API] ✅ LLM 응답 수신
[종합 피드백 API] - 응답 길이: 1500 bytes
[종합 피드백 API] ✅ JSON 파싱 성공
[종합 피드백 API] - 필드: overallConsistency, strengths, weaknesses, improvements, summary
```

#### 4-4. feedbacks 문서 업데이트

```javascript
// feedbacks 컬렉션에서 해당 interviewId를 가진 문서 찾기
const feedbacksRef = collection(db, 'feedbacks');
const feedbackQuery = query(
  feedbacksRef,
  where('interviewId', '==', interviewId),
  where('userId', '==', userId),
  where('type', '==', 'interview')
);

const feedbackSnapshot = await getDocs(feedbackQuery);
const feedbackDoc = feedbackSnapshot.docs[0];
const feedbackDocRef = doc(db, 'feedbacks', feedbackDoc.id);

// overallFeedback 필드 업데이트
await updateDoc(feedbackDocRef, {
  overallFeedback: feedbackData,
  feedbackGeneratedAt: Timestamp.now(),
  updatedAt: new Date().toISOString()
});
```

**업데이트 후 Firestore 구조**:
```
feedbacks/
└─ doc_xyz: {
     userId: "user123",
     type: "interview",
     interviewId: "interview_1699999999999",
     overallFeedback: {  ← 업데이트됨!
       overallConsistency: "...",
       strengths: "...",
       weaknesses: "...",
       improvements: "...",
       summary: "..."
     },
     feedbackGeneratedAt: Timestamp,
     updatedAt: "2025-11-12T10:37:00Z"
   }
```

**콘솔 로그**:
```bash
[종합 피드백 API] 💾 4단계: Firestore에 저장 중...
========================================
[종합 피드백 API] ✅✅✅ 성공! ✅✅✅
[종합 피드백 API] - feedbackId: doc_xyz
[종합 피드백 API] - 완료 시각: 2025-11-12T10:37:00Z
========================================
```

---

### 5단계: 결과 페이지 자동 업데이트

**파일**: `src/app/interview/result/[interviewId]/page.js`

#### 5-1. onSnapshot으로 실시간 구독

```javascript
// feedbacks 컬렉션 실시간 구독
const feedbacksRef = collection(db, 'feedbacks');
const feedbackQuery = query(
  feedbacksRef,
  where('userId', '==', user.uid),
  where('interviewId', '==', interviewId),
  where('type', '==', 'interview')
);

const unsubscribeFeedback = onSnapshot(feedbackQuery, (feedbackSnapshot) => {
  if (!feedbackSnapshot.empty) {
    const feedbackData = feedbackSnapshot.docs[0].data();
    
    if (feedbackData.overallFeedback) {
      // ✅ 종합 피드백 생성 완료!
      setOverallFeedback(feedbackData.overallFeedback);
    } else {
      // ⏳ 아직 생성 중...
      setOverallFeedback(null);
    }
  }
  setFeedbackLoading(false);
});
```

**UI 변화**:
```
초기 (overallFeedback: null):
┌───────────────────────────┐
│ 종합 피드백 생성 중...      │
│ [로딩 스피너]              │
│ AI가 5개의 답변을          │
│ 종합 분석하고 있습니다...   │
└───────────────────────────┘

↓ (1-2분 후 자동 업데이트)

완료 (overallFeedback 존재):
┌───────────────────────────┐
│ 🔄 전체 일관성             │
│ "답변들이 일관되며..."      │
├───────────────────────────┤
│ ✅ 전체 강점               │
│ "논리적 사고가 돋보임"      │
├───────────────────────────┤
│ ⚠️ 개선 필요 사항          │
│ "구체적 사례 추가 필요"     │
├───────────────────────────┤
│ 💡 구체적 개선 방향        │
│ "STAR 기법 활용..."       │
├───────────────────────────┤
│ 📊 최종 종합 평가          │
│ "전반적으로 양호하나..."    │
└───────────────────────────┘
```

**콘솔 로그**:
```bash
[3단계 확인] 종합 피드백 조회 시작
[3단계 확인] - 문서 개수: 1

초기:
[3단계 확인] ⏳ 종합 피드백 아직 생성 안됨 (null)
[3단계 확인] 💡 백그라운드에서 생성 중일 수 있습니다. 잠시 기다리세요.

↓ (1-2분 후)

완료:
[3단계 확인] 🎉🎉🎉 종합 피드백 로드 완료! 🎉🎉🎉
[3단계 확인] - 필드: overallConsistency, strengths, weaknesses, improvements, summary
[3단계 확인] - strengths 미리보기: "논리적 사고가 돋보이며 구조화된 답변을 제시했습니다..."
```

---

### 6단계: 히스토리에서 확인

**파일**: `src/app/history/page.js`, `src/app/components/HistoryList.jsx`

#### 6-1. feedbacks 컬렉션 조회

```javascript
const feedbacksRef = collection(db, 'feedbacks');
const q = query(
  feedbacksRef,
  where('userId', '==', user.uid),
  orderBy('createdAt', 'desc')
);

const querySnapshot = await getDocs(q);
const feedbackList = [];
querySnapshot.forEach((doc) => {
  feedbackList.push({ id: doc.id, ...doc.data() });
});

setFeedbacks(feedbackList);
```

**콘솔 로그**:
```bash
[히스토리 페이지] 🔍 Firestore 데이터 조회 시작
[히스토리 페이지] ✅ 총 10개의 피드백 데이터 로드됨

[진단 1단계] 🔍 면접 타입 문서 분석:
[진단 1단계] - interviewId: interview_1699999999999
[진단 1단계] - overallFeedback 존재: true
[진단 1단계] ✅ overallFeedback 필드 발견!
[진단 1단계] - strengths 존재: true
[진단 1단계] - weaknesses 존재: true
[진단 1단계] - summary 존재: true
```

#### 6-2. UI 표시

```
히스토리 페이지 - 모의 면접 탭:

┌──────────────────────────────────────────┐
│ 🎤  2025년 11월 12일 오후 10:35          │
│                                          │
│  [5개 질문 세트] [✅ 종합 피드백 완료]   │
│                                          │
│  "전반적으로 양호하나 구체적 사례가      │
│   더 필요합니다. STAR 기법을..."         │
│                                          │
│  관련 키워드: JavaScript, React, ...     │
│                                   [→]   │
└──────────────────────────────────────────┘
```

#### 6-3. 클릭 시 결과 페이지 이동

```javascript
const handleClick = (feedback) => {
  if (feedback.type === 'interview') {
    // interviewId로 결과 페이지 이동
    router.push(`/interview/result/${feedback.interviewId}`);
  }
};
```

**콘솔 로그**:
```bash
[HistoryList] 클릭된 항목: doc_xyz - 타입: interview
[HistoryList] 🚀 면접 결과 페이지로 이동: /interview/result/interview_1699999999999
```

---

## ✅ 정상 동작 확인 체크리스트

### 면접 진행 중

```bash
□ 질문 TTS 재생됨
□ 녹음 시작/종료 정상 작동
□ 타이머 정상 작동 (60초)
□ STT 결과 표시됨
□ 답변 완료 후 즉시 다음 질문 진행 (피드백 대기 ❌)
□ 5개 질문 모두 완료됨
```

**콘솔 확인**:
```bash
✅ [백그라운드 평가] ✅✅✅ Firestore 저장 성공!
✅ [메인 플로우] 🚀 다음 질문 요청
```

### 면접 완료 시

```bash
□ handleInterviewComplete 실행됨
□ feedbacks 컬렉션에 저장됨
□ 종합 피드백 API 호출됨
□ 결과 페이지로 이동됨
```

**콘솔 확인**:
```bash
✅ [면접 완료] ✅✅✅ feedbacks 컬렉션 저장 성공!
✅ [종합 피드백] 🚀 5개 답변 종합 평가 시작
✅ [면접 완료] 🚀 결과 페이지로 리다이렉트
```

### 결과 페이지

```bash
□ 5개 개별 답변 표시됨
□ 오디오 플레이어 작동됨
□ "종합 피드백 생성 중..." 로딩 표시
□ 1-2분 후 종합 피드백 자동 표시
```

**콘솔 확인**:
```bash
✅ [결과 페이지] 📥 onSnapshot 콜백 실행
✅ [3단계 확인] 🎉🎉🎉 종합 피드백 로드 완료!
```

### 히스토리 페이지

```bash
□ 면접 기록 표시됨
□ "✅ 종합 피드백 완료" 뱃지 표시
□ summary 미리보기 표시
□ 클릭 시 결과 페이지로 이동
```

**콘솔 확인**:
```bash
✅ [진단 1단계] ✅ overallFeedback 필드 발견!
✅ [HistoryList] 🚀 면접 결과 페이지로 이동
```

---

## 🚨 문제 해결 가이드

### 문제: 답변이 저장되지 않음

**증상**: 콘솔에 "❌ Firestore 저장 실패" 메시지

**확인 사항**:
1. Firebase 초기화 확인
2. Firestore Rules 확인 (write 권한)
3. 네트워크 연결 확인

**해결 방법**:
```bash
# Firestore Rules 확인
match /interview_answers/{document} {
  allow write: if request.auth != null;
}
```

---

### 문제: 종합 피드백이 생성되지 않음

**증상**: 결과 페이지에서 계속 "생성 중..." 표시

**확인 사항**:
1. generate-overall-feedback API 로그 확인
2. OpenAI API 키 확인
3. feedbacks 컬렉션 write 권한 확인

**콘솔 확인**:
```bash
# API 호출 확인
✅ [종합 피드백] 🚀 5개 답변 종합 평가 시작

# API 응답 확인 (1-2분 후)
✅ [종합 피드백 API] ✅✅✅ 성공!
또는
❌ [종합 피드백 API] ❌❌❌ 에러 발생!
```

---

### 문제: 히스토리에서 면접이 안 보임

**증상**: 히스토리 페이지에 면접 기록이 없음

**확인 사항**:
1. handleInterviewComplete 실행 여부
2. feedbacks 컬렉션 저장 확인
3. type 필드 = 'interview' 확인

**콘솔 확인**:
```bash
# feedbacks 저장 확인
✅ [면접 완료] ✅✅✅ feedbacks 컬렉션 저장 성공!

# 히스토리 조회 확인
✅ [히스토리 페이지] ✅ 총 X개의 피드백 데이터 로드됨
✅ [진단 1단계] - interviewId 존재: true
```

---

## 📊 데이터 흐름 요약

```
InterviewUI (질문 1-5)
    ↓ (각 질문마다)
interview_answers 컬렉션
    - feedback: null
    - transcript, audioURL 저장
    
    ↓ (5개 완료 후)
    
handleInterviewComplete
    ↓
feedbacks 컬렉션
    - overallFeedback: null (초기)
    - interviewId, type: 'interview'
    
    ↓ (백그라운드)
    
generate-overall-feedback API
    ↓
interview_answers 5개 조회
    ↓
LLM 종합 분석
    ↓
feedbacks 컬렉션 업데이트
    - overallFeedback: { ... } (완료!)
    
    ↓ (onSnapshot)
    
결과 페이지 자동 업데이트
히스토리 페이지 표시
```

---

## 🎯 핵심 포인트

1. **개별 피드백 없음** ❌
   - 각 질문마다 피드백 생성 안함
   - feedback 필드는 항상 null

2. **종합 피드백만 생성** ✅
   - 5개 질문 완료 후 1회만 생성
   - 전체 일관성, 강점, 약점, 개선 방향, 종합 평가

3. **세트 기반 시스템** ✅
   - interviewId로 5개 답변 그룹화
   - feedbacks 컬렉션에 메타데이터 + 종합 피드백

4. **실시간 업데이트** ✅
   - onSnapshot으로 종합 피드백 자동 표시
   - 백그라운드 생성으로 UX 방해 ❌

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant  
**버전**: 1.0.0

