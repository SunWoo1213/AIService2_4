# 🎤 오디오 저장(재생용) vs 텍스트 평가(분석용) 분리 구조

## 📋 목차
1. [개요](#개요)
2. [핵심 원칙](#핵심-원칙)
3. [전체 데이터 흐름](#전체-데이터-흐름)
4. [구현 상세](#구현-상세)
5. [코드 위치](#코드-위치)
6. [UI/UX 가이드](#uiux-가이드)

---

## 개요

면접 피드백 시스템에서 **오디오 파일**과 **텍스트 분석**을 명확하게 분리하여 각각의 용도를 최적화했습니다.

### 분리의 이유
1. **재생용 (Playback)**: 사용자가 자신의 답변을 나중에 다시 듣기 위함
2. **분석용 (Evaluation)**: AI가 답변 내용을 평가하기 위함

### 핵심 차이점
- **오디오 파일**: Storage에 저장 → 재생만 가능
- **텍스트 (Transcript)**: LLM 분석 → 피드백 생성

---

## 핵심 원칙

### ✅ 올바른 이해
```
오디오 파일 (audioBlob)
    ↓
    ├─→ [재생용] Firebase Storage → audioURL → <audio controls>
    │
    └─→ [변환용] Whisper STT → transcript (정확한 텍스트)
                                    ↓
                                [분석용] LLM → 피드백
```

### ❌ 잘못된 이해
```
오디오 파일 (audioBlob)
    ↓
    └─→ LLM에 직접 전송 (X)
        ↓
        음성 톤, 발음, 속도 평가 (X)
```

### 중요 사항
- ✅ LLM은 **텍스트만** 받습니다
- ✅ 오디오는 **STT 정확도 향상**을 위해서만 사용됩니다
- ✅ 평가 대상은 **답변 내용(what they said)**입니다
- ❌ 음성 톤, 발음, 속도는 **평가하지 않습니다**

---

## 전체 데이터 흐름

### 1단계: 녹음 및 STT (클라이언트)
```javascript
// src/app/components/InterviewUI.jsx

[사용자 답변]
    ↓
[MediaRecorder] → audioBlob (오디오 파일)
    ↓
[SpeechRecognition] → finalTranscript (브라우저 STT)
```

**생성되는 데이터:**
- `audioBlob`: Blob 객체 (audio/webm)
- `finalTranscript`: 문자열 (브라우저 STT 결과)

---

### 2단계: 오디오 저장 (재생용)
```javascript
// src/app/components/InterviewUI.jsx (432-486줄)

// ===== [재생용] Firebase Storage 업로드 =====
audioBlob
    ↓
Firebase Storage.uploadBytes()
    ↓
getDownloadURL()
    ↓
audioURL (https://firebasestorage.googleapis.com/...)
```

**목적:**
- 사용자가 나중에 자신의 답변을 다시 들을 수 있도록 저장
- 평가/분석에는 사용되지 않음

**저장 위치:**
- Firebase Storage: `recordings/{userId}/{interviewId}/q1_timestamp.webm`

---

### 3단계: API 호출 (분석 요청)
```javascript
// src/app/components/InterviewUI.jsx (343-350줄)

const formData = new FormData();
formData.append('audio', audioBlob);       // [STT용] Whisper 정확도 향상
formData.append('question', question);     // [평가 기준]
formData.append('transcript', transcript); // [폴백용] 브라우저 STT

fetch('/api/interview/evaluate-delivery', {
  method: 'POST',
  body: formData
});
```

**전송되는 데이터:**
1. `audio`: audioBlob (Whisper STT용)
2. `question`: 질문 내용 (평가 기준)
3. `transcript`: 브라우저 STT 결과 (폴백)

---

### 4단계: Whisper STT (API 서버)
```javascript
// src/app/api/interview/evaluate-delivery/route.js (122-182줄)

// ===== [STT용] Whisper API로 오디오 전사 =====
audioFile
    ↓
Whisper API (/audio/transcriptions)
    ↓
whisperTranscript (더 정확한 텍스트)
    ↓
품질 검증 (Browser STT와 비교)
    ↓
최종 transcript 선택
```

**Whisper의 역할:**
- Browser SpeechRecognition보다 **더 정확한 텍스트** 추출
- 오디오는 여기서만 사용되며, **LLM에는 전송되지 않음**

**폴백 로직:**
```javascript
if (whisperLength < browserLength * 0.5) {
  // Whisper 결과가 너무 짧으면 Browser STT 사용
  whisperTranscript = transcript;
}
```

---

### 5단계: LLM 분석 (텍스트만)
```javascript
// src/app/api/interview/evaluate-delivery/route.js (249-298줄)

// ===== [분석용] LLM 프롬프트 - 텍스트 내용만 평가 =====
const llmPrompt = `
  You are evaluating ONLY the text content. Do NOT comment on:
  - Voice tone, pitch, or speaking style
  - Pronunciation or accent
  - Speaking speed or pauses
  
  **Question:** "${question}"
  **Candidate's Answer:** "${whisperTranscript}"
  
  Provide feedback on:
  - Strengths
  - Weaknesses
  - Improvements
  - Summary
`;

LLM API (gpt-4o)
    ↓
analysisResult = {
  strengths: "...",
  weaknesses: "...",
  improvements: "...",
  summary: "..."
}
```

**LLM 평가 대상:**
- ✅ 답변의 논리성
- ✅ 구체성 (예시, 수치)
- ✅ 완전성 (누락된 정보)
- ✅ 관련성 (질문과의 연관성)

**LLM 평가 제외:**
- ❌ 음성 톤, 피치
- ❌ 발음, 억양
- ❌ 말하는 속도
- ❌ 침묵, 더듬거림

---

### 6단계: Firestore 저장
```javascript
// src/app/components/InterviewUI.jsx (364-381줄)

// ===== [저장] Firestore에 결과 저장 =====
const answerData = {
  userId: userId,
  interviewId: interviewId,
  questionId: 'q1',
  question: question,
  transcript: transcript,  // [분석용] AI 평가 대상
  audioURL: audioURL,      // [재생용] 다시 듣기 전용
  feedback: JSON.stringify(analysisResult), // [결과] AI 피드백
  duration: duration,
  timestamp: Timestamp.now()
};

addDoc(collection(db, 'interview_answers'), answerData);
```

**저장되는 필드:**
| 필드 | 용도 | 설명 |
|------|------|------|
| `audioURL` | 재생용 | Firebase Storage URL (다시 듣기) |
| `transcript` | 분석용 | 실제 답변 내용 (AI 평가 대상) |
| `feedback` | 결과 | AI 평가 피드백 (JSON 문자열) |

---

### 7단계: 결과 페이지 표시
```javascript
// src/app/interview/result/[interviewId]/page.js (165-210줄)

// ===== [재생용] 오디오 플레이어 (상단 배치) =====
<div className="bg-gradient-to-r from-indigo-50 to-purple-50">
  <audio controls src={answer.audioURL} />
  <p>💡 이 오디오는 <strong>재생 전용</strong>입니다.</p>
</div>

// ===== [분석용] 내 답변 텍스트 =====
<div>
  <span className="badge">분석 대상</span>
  <p>{answer.transcript}</p>
  <p>ℹ️ AI는 위 텍스트 내용을 분석하여 피드백을 제공합니다.</p>
</div>

// ===== [결과] AI 피드백 =====
<div>
  <강점> feedbackData.strengths
  <약점> feedbackData.weaknesses
  <개선> feedbackData.improvements
  <평가> feedbackData.summary
</div>
```

---

## 구현 상세

### 파일별 역할

#### 1. `src/app/components/InterviewUI.jsx`
**역할:** 녹음, 저장, 평가 요청

```javascript
// [재생용] Firebase Storage 업로드 (432-486줄)
const audioURL = await uploadToStorage(audioBlob);

// [분석용] 백그라운드 평가 (324-400줄)
evaluateAnswerInBackground(
  audioBlob,     // Whisper STT용
  transcript,    // 브라우저 STT (폴백)
  question,      // 평가 기준
  audioURL,      // 재생용 URL
  duration       // 녹음 시간
);

// [저장] Firestore에 결과 저장 (364-381줄)
addDoc(collection(db, 'interview_answers'), {
  audioURL,   // 재생용
  transcript, // 분석용
  feedback    // 결과
});
```

---

#### 2. `src/app/api/interview/evaluate-delivery/route.js`
**역할:** STT + LLM 분석

```javascript
// [입력] FormData 파싱 (22-28줄)
const audioFile = formData.get('audio');     // Whisper용
const question = formData.get('question');   // 평가 기준
const transcript = formData.get('transcript'); // 폴백

// [STT용] Whisper API (122-182줄)
const whisperTranscript = await whisperSTT(audioFile);

// [분석용] LLM API (249-355줄)
const feedback = await llmAnalyze(whisperTranscript, question);

// [출력] 피드백 반환 (383줄)
return NextResponse.json(feedback);
```

---

#### 3. `src/app/interview/result/[interviewId]/page.js`
**역할:** 결과 표시

```javascript
// [실시간 구독] Firestore onSnapshot (36-62줄)
const unsubscribe = onSnapshot(
  query(collection(db, 'interview_answers'), 
    where('interviewId', '==', interviewId)),
  (snapshot) => {
    setAnswers(snapshot.docs.map(doc => doc.data()));
  }
);

// [재생용] 오디오 플레이어 (165-188줄)
{answer.audioURL && (
  <audio controls src={answer.audioURL} />
)}

// [분석용] 텍스트 표시 (190-210줄)
<p>{answer.transcript}</p>
<span className="badge">분석 대상</span>

// [결과] AI 피드백 (212-298줄)
<강점> {feedbackData.strengths}
<약점> {feedbackData.weaknesses}
<개선> {feedbackData.improvements}
<평가> {feedbackData.summary}
```

---

## 코드 위치

### 주요 주석 위치

| 파일 | 줄 | 내용 |
|------|-----|------|
| `InterviewUI.jsx` | 432 | `[재생용] Firebase Storage 업로드` |
| `InterviewUI.jsx` | 490 | `[분석용] 답변 평가 백그라운드 처리` |
| `InterviewUI.jsx` | 324 | `[분석용] 백그라운드 평가 함수` |
| `InterviewUI.jsx` | 364 | `[저장] Firestore 결과 저장` |
| `evaluate-delivery/route.js` | 6 | `[분석용] 면접 답변 평가 API` |
| `evaluate-delivery/route.js` | 122 | `[STT용] Whisper API` |
| `evaluate-delivery/route.js` | 249 | `[분석용] LLM 프롬프트` |
| `result/[interviewId]/page.js` | 165 | `[재생용] 오디오 플레이어` |
| `result/[interviewId]/page.js` | 190 | `[분석용] 텍스트 표시` |

---

## UI/UX 가이드

### 결과 페이지 구조

```
┌──────────────────────────────────────────┐
│ 질문 1                                    │
├──────────────────────────────────────────┤
│                                          │
│ 🎧 답변 녹음 다시 듣기 (Playback)         │
│ ┌────────────────────────────────────┐  │
│ │ 💡 이 오디오는 재생 전용입니다.      │  │
│ │ 아래 피드백은 텍스트 내용을 기반으로 │  │
│ │ 평가되었습니다.                     │  │
│ └────────────────────────────────────┘  │
│ [========= Audio Player ==========]     │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│ 내 답변 텍스트 (Transcript) [분석 대상]  │
│ ┌────────────────────────────────────┐  │
│ │ 저는 작년에 팀 프로젝트로...        │  │
│ │ React와 Firebase를 사용해...       │  │
│ └────────────────────────────────────┘  │
│ ℹ️ AI는 위 텍스트 내용을 분석하여       │
│   피드백을 제공합니다.                   │
│                                          │
├──────────────────────────────────────────┤
│                                          │
│ 💡 AI 피드백                             │
│                                          │
│ ✓ 강점 (Strengths)                      │
│   구체적인 기술 스택을 언급...           │
│                                          │
│ ✗ 약점 (Weaknesses)                     │
│   결과에 대한 구체적인 수치가...         │
│                                          │
│ 💡 개선 가이드 (Actionable Advice)       │
│   1) STAR 기법 활용...                  │
│   2) 정량적 지표 포함...                │
│                                          │
│ 📝 종합 평가 (Overall Assessment)        │
│   전반적으로 양호하나...                 │
│                                          │
└──────────────────────────────────────────┘
```

### UI 컴포넌트 설명

#### 1. 오디오 플레이어 (상단)
```jsx
<div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-5 rounded-xl border-2 border-indigo-200">
  <audio controls />
</div>
```
- **목적**: 재생 전용
- **배경**: 보라-인디고 그라데이션
- **안내**: "이 오디오는 재생 전용입니다"

#### 2. 텍스트 답변 (중간)
```jsx
<div>
  <span className="badge">분석 대상</span>
  <p>{transcript}</p>
  <p className="info">ℹ️ AI는 위 텍스트를 분석합니다</p>
</div>
```
- **목적**: 분석 대상 명시
- **배지**: "분석 대상" (초록)
- **안내**: "AI는 위 텍스트 내용을 분석"

#### 3. AI 피드백 (하단)
```jsx
<강점> 초록 그라데이션
<약점> 빨강 그라데이션
<개선> 파랑 그라데이션
<평가> 보라 그라데이션
```
- **목적**: 텍스트 기반 평가 결과
- **구조**: 4개 섹션 분리
- **강조**: 좌측 강조선 + 그라데이션

---

## 데이터베이스 스키마

### Firestore: `interview_answers` Collection

```javascript
{
  // 식별자
  userId: string,
  interviewId: string,
  questionId: string,
  
  // 질문
  question: string,
  
  // [재생용] 오디오 URL
  audioURL: string,  // Firebase Storage URL
  
  // [분석용] 텍스트 답변
  transcript: string,  // AI 평가 대상
  
  // [결과] AI 피드백
  feedback: string,  // JSON 문자열
  // {
  //   strengths: string,
  //   weaknesses: string,
  //   improvements: string,
  //   summary: string
  // }
  
  // 메타데이터
  duration: number,
  timestamp: Timestamp,
  createdAt: string
}
```

### 필드별 용도

| 필드 | 타입 | 용도 | 사용처 |
|------|------|------|--------|
| `audioURL` | string | 재생용 | `<audio controls>` |
| `transcript` | string | 분석용 | LLM 입력 |
| `feedback` | string | 결과 | UI 표시 |

---

## FAQ

### Q1. 왜 오디오를 API에 전송하나요?
**A:** Whisper STT로 더 정확한 텍스트를 추출하기 위함입니다. Browser SpeechRecognition은 정확도가 낮을 수 있습니다.

### Q2. LLM이 오디오를 직접 분석하나요?
**A:** 아니요. LLM은 텍스트만 받습니다. 오디오는 Whisper STT로 텍스트 변환 후 사용됩니다.

### Q3. 음성 톤이나 발음도 평가하나요?
**A:** 아니요. 평가는 순수하게 텍스트 내용만을 기반으로 합니다.

### Q4. audioURL은 왜 저장하나요?
**A:** 사용자가 나중에 자신의 답변을 다시 들을 수 있도록 재생용으로 저장합니다.

### Q5. Whisper API가 실패하면?
**A:** Browser SpeechRecognition 결과를 폴백으로 사용합니다. 평가는 계속 진행됩니다.

---

## 테스트 체크리스트

### 재생용 (Playback) 테스트
- [ ] 오디오가 Firebase Storage에 업로드되는가?
- [ ] audioURL이 Firestore에 저장되는가?
- [ ] 결과 페이지에서 오디오가 재생되는가?
- [ ] 오디오 재생이 평가에 영향을 주지 않는가?

### 분석용 (Evaluation) 테스트
- [ ] Browser STT로 텍스트가 생성되는가?
- [ ] Whisper API로 더 정확한 텍스트가 생성되는가?
- [ ] LLM이 텍스트만을 기반으로 피드백을 생성하는가?
- [ ] 피드백에 음성 톤/발음 관련 언급이 없는가?

### UI/UX 테스트
- [ ] 오디오 플레이어가 상단에 배치되는가?
- [ ] "재생 전용" 안내 문구가 표시되는가?
- [ ] 텍스트에 "분석 대상" 배지가 표시되는가?
- [ ] AI 피드백이 4개 섹션으로 분리되는가?

---

## 결론

### 핵심 요약
1. **오디오**: 재생만 (Storage)
2. **텍스트**: 분석만 (LLM)
3. **평가**: 내용만 (음성 특성 제외)

### 장점
- ✅ 용도가 명확히 분리됨
- ✅ 사용자가 답변을 다시 들을 수 있음
- ✅ AI 평가가 텍스트 내용에 집중
- ✅ Whisper로 STT 정확도 향상

### 유지보수 가이드
- 오디오 관련 코드 수정 시: `[재생용]` 주석 확인
- 텍스트 분석 수정 시: `[분석용]` 주석 확인
- LLM 프롬프트 수정 시: "텍스트만 평가" 원칙 유지


