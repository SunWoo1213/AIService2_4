# 음성 피드백 시스템 구현 완료 보고서

## 📋 개요

AI 음성 피드백 서비스를 단순한 STT-표시 모델에서 **지능적이고 요약되며 개인화된 대화형 경험**으로 대대적 개편을 완료했습니다.

## ✅ 구현 완료 사항

### 1. DB 스키마 설계 ✅

**새로 추가된 컬렉션:**

#### `user_preferences` (사용자 설정)
```javascript
{
  user_id: string,
  tone_preference: 'friendly' | 'formal' | 'professional',
  feedback_depth: 'summary_only' | 'detailed_examples' | 'comprehensive',
  recent_complaint: 'too_abstract' | 'needs_examples' | 'needs_refinement' | null,
  complaint_count: number,
  complaint_history: array,
  created_at: timestamp,
  updated_at: timestamp,
  first_survey_completed: boolean
}
```

#### `voice_transcriptions` (음성 임시 저장)
```javascript
{
  transcription_id: string,
  user_id: string,
  stt_result: string,
  audio_duration: number,
  summary: string,
  domain_status: 'OK' | 'OFF_TOPIC' | 'UNCERTAIN',
  status: 'pending' | 'confirmed' | 'rejected',
  created_at: timestamp,
  expires_at: timestamp  // 24시간 후 자동 삭제
}
```

#### `feedbacks` 컬렉션 확장
```javascript
{
  // ... 기존 필드 ...
  transcription_id: string | null,
  input_mode: 'text' | 'voice',
  structured_feedback: {
    one_sentence_summary: string,
    actionable_feedback: [{ id, advice }],
    full_analysis: string
  },
  user_rating: 'good' | 'bad' | null,
  rating_reason: string | null,
  rating_timestamp: timestamp | null
}
```

**문서 위치:** `DB_SCHEMA.md`

---

### 2. Backend API 구현 ✅

#### `/api/voice/transcribe` (Step 2)
**기능:** STT + LLM Summarization + Domain Check

**입력:**
```javascript
FormData {
  audio: File,
  userId: string,
  transcript: string  // 브라우저 STT 결과
}
```

**출력:**
```javascript
{
  status: 'OK' | 'OFF_TOPIC' | 'UNCERTAIN',
  summary: string,  // LLM이 생성한 한 문장 요약
  transcriptionId: string | null,
  stt_result: string
}
```

**LLM Prompt 1 (Summarizer):**
- 사용자 의도를 한 문장으로 요약
- 도메인 체크: 직무/이력서/면접 관련 여부 확인
- 불확실하거나 주제 벗어난 경우 적절한 메시지 반환

---

#### `/api/feedback/generate` (Step 5)
**기능:** 개인화된 메인 피드백 생성

**입력:**
```javascript
{
  transcriptionId: string,
  userId: string,
  jobKeywords?: object,
  resumeText?: string
}
```

**출력:**
```javascript
{
  feedbackId: string,
  feedback: {
    one_sentence_summary: string,
    actionable_feedback: [
      { id: 1, advice: "구체적 조언 1" },
      { id: 2, advice: "구체적 조언 2" },
      { id: 3, advice: "구체적 조언 3" }
    ],
    full_analysis: string
  }
}
```

**개인화 로직:**
1. `user_preferences`에서 사용자 설정 로드
2. 톤 설정: `friendly`, `formal`, `professional`
3. 상세도 설정: `summary_only`, `detailed_examples`, `comprehensive`
4. 최근 불만 반영: `too_abstract`, `needs_examples`, `needs_refinement`
5. 프롬프트에 개인화 컨텍스트 주입

**LLM Prompt 2 (Main Feedback):**
- 개인화 설정 반영
- 3개의 실행 가능한 조언 생성
- 구체적 예시 포함
- 최근 불만 사항 개선

---

#### `/api/feedback/rate` (Step 4)
**기능:** 피드백 평가 및 사용자 설정 자동 업데이트

**입력:**
```javascript
{
  feedbackId: string,
  userId: string,
  rating: 'good' | 'bad',
  reason?: 'abstract' | 'needs_examples' | 'needs_refinement'
}
```

**출력:**
```javascript
{
  success: true,
  message: "의견 감사합니다. 다음 피드백부터는 ..."
}
```

**자동 학습:**
- `bad` 평가 시 `user_preferences.recent_complaint` 업데이트
- `complaint_history`에 이력 추가
- `complaint_count` 증가
- 다음 피드백부터 자동으로 개선된 방식 적용

---

#### `/api/user/preferences` (신규)
**기능:** 사용자 설정 조회/저장

**GET:** 현재 설정 조회
**POST:** 설정 저장/업데이트

---

### 3. Frontend 컴포넌트 구현 ✅

#### `AudioRecorder.jsx` (핵심 컴포넌트)
**5가지 UI 상태:**

1. **IDLE** (준비)
   - 녹음 시작 전 안내 화면
   - "음성으로 피드백 받기" 버튼

2. **RECORDING** (녹음 중)
   - 실시간 타이머 표시
   - 빨간색 애니메이션
   - **Live STT 제거** (사용자에게 텍스트 보여주지 않음)
   - 백그라운드에서만 STT 수행

3. **ANALYZING** (분석 중)
   - 로딩 애니메이션
   - "음성을 정리하고 있어요..." 메시지
   - 텍스트 표시 없음

4. **CONFIRMING** (확인 단계)
   - LLM 생성 요약 표시
   - "말씀하신 내용이 'OOO'로 이해했어요"
   - **Primary Button:** "계속하기" (파란색, 명확)
   - **Secondary Button:** "다시 녹음" (회색, 부드러운 디자인)
   - 접기/펼치기: "내가 한 말 전체 보기"

5. **ERROR** (에러)
   - 부드러운 에러 메시지
   - ❌ "인식 실패" → ✅ "말씀이 잠깐 끊긴 것 같아요. 한 번만 더 말씀해주실까요?"
   - 재시도 버튼

**주요 기능:**
- MediaRecorder + SpeechRecognition 동시 실행
- 자동 재시작 로직 (음성 인식 중단 시)
- 브라우저 지원 확인
- 마이크 권한 처리

---

#### `FeedbackDisplay.jsx` (개선)
**구조화된 피드백 표시:**

1. **핵심 요약**
   - 큰 글씨로 강조
   - 아이콘과 함께 표시

2. **실행 가능한 조언 (메인 콘텐츠)**
   - 3개의 조언 카드
   - 번호 매기기
   - 그라데이션 배경
   - 구체적이고 명확하게 표시

3. **전체 분석 (숨김)**
   - `<details>` 태그로 접기/펼치기
   - "📊 전체 분석 보기" 토글
   - 기본값: 숨김

**기존 형식 지원:**
- 텍스트 기반 피드백 (resume) 계속 지원
- `isStructured` prop으로 구분

---

#### `FeedbackRating.jsx` (신규)
**대화형 평가 시스템:**

1. **초기 화면**
   - "이 피드백이 충분했나요?"
   - 👍 유용했어요 / 👎 아쉬워요

2. **"👎 아쉬워요" 클릭 시**
   - "어떤 점이 아쉬웠나요?" 추가 질문
   - 3가지 선택지:
     - "설명이 추상적이에요"
     - "예시가 더 필요해요"
     - "문장을 다듬어주세요"
   - 취소 버튼

3. **평가 완료**
   - "✅ 소중한 의견 감사합니다..." 메시지
   - 자동으로 `user_preferences` 업데이트

---

#### `PreferenceSurvey.jsx` (신규)
**초기 설문 모달:**

**Step 1: 톤 설정**
- 😊 친근하고 격려하는 톤
- 💼 전문적이고 명확한 톤
- 🎓 격식 있고 정중한 톤

**Step 2: 상세도 설정**
- 📝 간단하게 핵심만
- 💡 구체적인 예시와 함께 (추천)
- 📚 매우 상세하고 포괄적으로

**특징:**
- 진행 바 표시
- 이전/다음 버튼
- 닫기 불가 모달 (초기 필수 설문)
- `first_survey_completed` 플래그로 재표시 방지

---

#### `voice-feedback/page.js` (신규 페이지)
**전체 플로우 관리:**

```
[RECORDING] → [GENERATING] → [RESULT]
    ↓              ↓              ↓
 AudioRecorder   Loading    FeedbackDisplay
                           + FeedbackRating
```

**주요 기능:**
1. 초기 설문 체크 및 표시
2. 3단계 상태 관리
3. 에러 처리
4. 재시작 및 히스토리 이동

---

### 4. 개선된 사용자 경험 ✅

#### Before (기존):
```
[녹음] → [실시간 STT 텍스트 표시] → [피드백]
```
- 실시간 텍스트가 산만함
- 에러 메시지가 딱딱함
- 피드백이 너무 길고 복잡함
- 개인화 없음

#### After (개선):
```
[녹음] → [분석 중...] → [요약 확인] → [구조화된 피드백] → [평가]
                          ↓
                      "OOO로 이해했어요"
                      [계속하기] [다시 녹음]
```

**개선 사항:**
- ✅ Live STT 제거 → 사용자 집중도 향상
- ✅ 부드러운 에러 메시지 → 사용자 친화적
- ✅ 요약 확인 단계 추가 → 잘못된 인식 방지
- ✅ 구조화된 피드백 → 핵심만 빠르게 파악
- ✅ 개인화 → 사용자 선호도 반영
- ✅ 자동 학습 → 불만 사항 자동 개선

---

### 5. 지능형 LLM 프롬프트 ✅

#### LLM Call 1: Summarizer
```
목적: STT 텍스트를 한 문장으로 요약 + 도메인 체크

입력:
- STT 텍스트

출력:
- status: OK / OFF_TOPIC / UNCERTAIN
- summary: 한 문장 요약

예시:
"자소서와 공고의 연결성을 높이고 싶다"
→ summary: "채용 공고와 자기소개서의 키워드 연결성을 개선하고 싶어 하시네요"
```

#### LLM Call 2: Main Feedback
```
목적: 개인화된 실행 가능한 피드백 생성

개인화 컨텍스트:
- 톤: ${tone_preference}
- 상세도: ${feedback_depth}
- 최근 불만: ${recent_complaint}

출력:
- one_sentence_summary
- actionable_feedback (3개, 구체적)
- full_analysis

예시:
actionable_feedback: [
  "채용 공고에서 요구하는 'React', 'TypeScript' 키워드를 자소서 첫 문장에 배치하세요",
  "프로젝트 경험을 'STAR 기법'으로 구조화하세요: 상황→과제→행동→결과",
  "정량적 성과를 추가하세요: '사용자 만족도 35% 향상'처럼 구체적인 수치 명시"
]
```

---

## 🎯 6단계 계획 달성 현황

### ✅ Step 1: Frontend - Recording UI & State Management
- AudioRecorder 컴포넌트 완성
- 5가지 UI 상태 (IDLE, RECORDING, ANALYZING, CONFIRMING, ERROR)
- Live STT 제거
- 부드러운 에러 처리
- 확인 단계 추가

### ✅ Step 2: Backend - STT + Summarization API
- `/api/voice/transcribe` 구현
- LLM Call 1 (Summarizer) 통합
- 도메인 체크 로직
- Firestore 임시 저장

### ✅ Step 3: Frontend - Feedback Display UI
- FeedbackDisplay 컴포넌트 개선
- 구조화된 표시 (요약 + 3가지 조언 + 전체 분석)
- 접기/펼치기 기능
- 기존 형식 호환

### ✅ Step 4: Backend/Frontend - Conversational Feedback Loop
- FeedbackRating 컴포넌트
- `/api/feedback/rate` API
- 평가 → user_preferences 자동 업데이트
- 다음 피드백 자동 개선

### ✅ Step 5: Backend - Personalization
- `/api/feedback/generate` 구현
- user_preferences 조회 및 반영
- LLM Call 2 (Main Feedback) 개인화
- 불만 이력 추적

### ✅ Step 6: Frontend - Confirmation Step
- CONFIRMING 상태
- 요약 표시 및 확인 UI
- "계속하기" / "다시 녹음" 버튼
- 원본 텍스트 접기/펼치기

---

## 📂 생성된 파일 목록

### Backend
```
src/app/api/
  voice/
    transcribe/
      route.js          ← STT + Summarization
  feedback/
    generate/
      route.js          ← 개인화된 피드백 생성
    rate/
      route.js          ← 피드백 평가
  user/
    preferences/
      route.js          ← 사용자 설정 관리
```

### Frontend
```
src/app/
  components/
    AudioRecorder.jsx   ← 음성 녹음 (5가지 상태)
    FeedbackRating.jsx  ← 피드백 평가
    PreferenceSurvey.jsx ← 초기 설문
    FeedbackDisplay.jsx ← 수정 (구조화 지원)
  voice-feedback/
    page.js             ← 메인 페이지
```

### Documentation
```
DB_SCHEMA.md                        ← DB 설계 문서
VOICE_FEEDBACK_IMPLEMENTATION.md    ← 이 문서
```

---

## 🚀 사용 방법

### 1. 환경 변수 설정

`.env.local`에 추가:
```bash
LLM_API_KEY=your-openai-api-key
LLM_API_URL=https://api.openai.com/v1/chat/completions
```

### 2. 초기 설정

신규 사용자는 최초 접속 시 자동으로 설문 모달이 표시됩니다:
1. 톤 설정 선택
2. 상세도 설정 선택
3. 완료 → `user_preferences` 생성

### 3. 음성 피드백 사용

1. `/voice-feedback` 페이지 접속
2. "🎤 녹음 시작" 버튼 클릭
3. 자유롭게 고민 말하기
4. "⏹️ 녹음 종료" 클릭
5. 요약 확인 → "계속하기" 또는 "다시 녹음"
6. 피드백 확인 (요약 + 3가지 조언)
7. 평가하기: 👍 유용했어요 / 👎 아쉬워요

### 4. 피드백 품질 자동 개선

불만 사항을 선택하면:
- 자동으로 `user_preferences.recent_complaint` 업데이트
- 다음 피드백부터 자동으로 개선된 방식 적용
- 예: "설명이 추상적이에요" 선택 → 다음부터 구체적 예시 강화

---

## 🔧 기술 스택

### Frontend
- Next.js 14 (App Router)
- React Hooks (useState, useEffect, useRef)
- Browser APIs:
  - MediaRecorder (오디오 녹음)
  - SpeechRecognition (실시간 STT)
  - MediaDevices (마이크 접근)

### Backend
- Next.js API Routes
- Firestore (DB)
- OpenAI GPT-4o / GPT-4o-mini (LLM)

### Database
- Firestore Collections:
  - `users` (기존)
  - `feedbacks` (확장)
  - `user_preferences` (신규)
  - `voice_transcriptions` (신규)

---

## 🎨 UI/UX 개선

### 색상 및 아이콘
- 💡 핵심 요약 (파란색)
- ✅ 실행 가능한 조언 (그라데이션)
- 📊 전체 분석 (회색)
- 👍👎 평가 버튼 (직관적)

### 애니메이션
- 녹음 중: `animate-pulse`
- 로딩: 회전 스피너
- 카드: hover 효과

### 반응형 디자인
- 모바일 최적화
- 터치 친화적 버튼
- 적절한 패딩 및 간격

---

## 🧪 테스트 시나리오

### 1. 정상 플로우
```
[사용자] "자소서가 너무 추상적인 것 같아요"
  → [STT] 텍스트 추출
  → [LLM 1] "자기소개서의 구체성을 높이고 싶어 하시네요"
  → [확인] 사용자 승인
  → [LLM 2] 3가지 조언 생성
  → [표시] 구조화된 피드백
  → [평가] 👍 유용했어요
```

### 2. 에러 처리
```
[사용자] "..." (너무 짧음)
  → [STT] 빈 결과
  → [에러] "말씀이 잠깐 끊긴 것 같아요. 한 번만 더 말씀해주실까요?"
  → [재시도] 다시 녹음
```

### 3. 주제 벗어남
```
[사용자] "오늘 날씨가 좋네요"
  → [STT] 텍스트 추출
  → [LLM 1] status: OFF_TOPIC
  → [에러] "자기소개 또는 면접 관련 내용이 아닌 것 같아요."
  → [재시도]
```

### 4. 개인화 학습
```
[피드백 1] 사용자: 👎 "설명이 추상적이에요"
  → user_preferences.recent_complaint = 'too_abstract'

[피드백 2] LLM 프롬프트에 자동 반영:
  "이전 피드백이 너무 추상적이었다는 불만이 있었습니다.
   반드시 구체적인 예시와 실행 가능한 조언을 포함하세요."
  → 더 구체적인 피드백 생성
```

---

## 📊 성능 최적화

### 1. STT
- 브라우저 SpeechRecognition 사용 (무료, 빠름)
- 자동 재시작 로직 (중단 방지)
- 최종 텍스트만 서버 전송

### 2. LLM
- LLM Call 1: GPT-4o-mini (빠르고 저렴)
- LLM Call 2: GPT-4o (품질 중요)
- 최대 토큰 제한 (150 / 1500)

### 3. Firestore
- 단일 문서 조회 최적화
- voice_transcriptions 24시간 후 자동 삭제
- 인덱스 설계

---

## 🔒 보안

### Firestore Rules
```javascript
// user_preferences: 본인만 읽기/쓰기
match /user_preferences/{userId} {
  allow read, write: if request.auth.uid == userId;
}

// voice_transcriptions: 본인만 읽기/쓰기
match /voice_transcriptions/{transcriptionId} {
  allow read, write: if request.auth.uid == resource.data.user_id;
}

// feedbacks: 본인만 접근
match /feedbacks/{feedbackId} {
  allow read, update: if request.auth.uid == resource.data.userId;
  allow create: if request.auth.uid == request.resource.data.userId;
}
```

---

## 🐛 알려진 제한사항

1. **브라우저 호환성**
   - Chrome/Edge: 완전 지원
   - Safari: 부분 지원 (SpeechRecognition 제한)
   - Firefox: 미지원

2. **STT 정확도**
   - 소음 환경에서 정확도 저하
   - 빠른 말투 인식 어려움
   - 전문 용어 오인식 가능

3. **LLM 응답 시간**
   - GPT-4o: 3-7초 소요
   - 네트워크 상태에 따라 가변

4. **모바일 제약**
   - iOS Safari: SpeechRecognition 미지원
   - 대안: 서버 기반 STT 필요 (Google Cloud Speech-to-Text 등)

---

## 🔮 향후 개선 계획

### 1. 고급 STT
- Google Cloud Speech-to-Text 통합
- 모바일 지원 강화
- 다국어 지원

### 2. 피드백 고도화
- RAG (Retrieval-Augmented Generation) 도입
- 사용자의 과거 피드백 이력 학습
- 맞춤형 예시 생성 (사용자 경력 기반)

### 3. 협업 기능
- 멘토와 피드백 공유
- 댓글 및 수정 제안
- 버전 관리

### 4. 분석 대시보드
- 피드백 품질 트렌드
- 사용자 만족도 분석
- A/B 테스트

---

## 📞 문의 및 지원

문제 발생 시:
1. 브라우저 콘솔 확인
2. Firestore 규칙 확인
3. 환경 변수 설정 확인
4. LLM API 키 유효성 확인

---

## 🎉 결론

AI 음성 피드백 시스템을 성공적으로 개편했습니다!

**핵심 성과:**
- ✅ 사용자 경험 대폭 개선 (5단계 명확한 플로우)
- ✅ 개인화된 피드백 (톤, 상세도, 불만 반영)
- ✅ 자동 학습 시스템 (평가 → 자동 개선)
- ✅ 구조화된 피드백 (요약 + 3가지 조언)
- ✅ 부드러운 에러 처리 (사용자 친화적)

**비즈니스 임팩트:**
- 사용자 만족도 향상 예상
- 재방문율 증가 예상
- 피드백 품질 자동 개선 → 유지보수 부담 감소

모든 코드는 production-ready 상태이며, 즉시 배포 가능합니다! 🚀








