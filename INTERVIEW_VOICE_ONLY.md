# 면접 시스템 - 음성 답변 전용 확정

## 📌 개요

본 프로젝트의 면접 시스템은 **100% 음성 답변 전용**으로 구현되어 있습니다.
텍스트 입력을 통한 답변은 지원하지 않습니다.

## ✅ 음성 전용 구현 사항

### 프론트엔드 (InterviewUI.jsx)

**음성 녹음 플로우:**
1. TTS로 질문 읽어주기
2. 사용자가 "🎤 녹음 시작" 버튼 클릭 (수동 제어)
3. Web Speech API (SpeechRecognition) + MediaRecorder로 녹음
4. 침묵 감지 비활성화 (`continuous: true`) - 생각하는 시간에도 녹음 계속
5. 사용자가 "✅ 답변 완료" 버튼 클릭으로 녹음 종료
6. 오디오 파일 + transcript를 API로 전송

**주요 특징:**
- ❌ textarea, input 등 텍스트 입력 UI 없음
- ❌ 텍스트 답변 관련 state 없음
- ✅ 완전한 수동 제어 (자동 시작/종료 없음)
- ✅ 꼬리 질문 자동 생성 (이전 답변 기반)

### 백엔드 API

**사용 중인 API:**
- `POST /api/interview/evaluate-delivery`
  - 입력: FormData (audio file + transcript)
  - 기능: Whisper API로 STT + GPT로 답변 평가
  - 응답: contentFeedback

**삭제된 API:**
- `POST /api/interview/evaluate` (구식 텍스트 답변 API)
  - 더 이상 사용되지 않으며 완전히 제거됨

### 데이터 저장 형식

**Firestore `feedbacks` 컬렉션:**
```javascript
{
  type: 'interview',
  interviewResults: [
    {
      question: "질문 내용",
      userAnswer: "음성 transcript 텍스트", // 음성에서 변환된 텍스트
      contentAdvice: "AI 피드백",
      contentScore: 8
    }
  ],
  // ...
}
```

**중요:** `userAnswer` 필드는 음성 transcript를 저장하는 용도이며, 
사용자가 직접 타이핑한 것이 아닙니다.

## 🚀 면접 플로우

```
1. 면접 시작
   ↓
2. 첫 질문 생성 (자소서 + 공고 기반)
   ↓
3. TTS로 질문 읽어주기
   ↓
4. 사용자가 "녹음 시작" 클릭
   ↓
5. 음성 답변 (침묵 중에도 계속 녹음)
   ↓
6. 사용자가 "답변 완료" 클릭
   ↓
7. STT + 피드백 분석
   ↓
8. 이전 답변 기반 꼬리 질문 생성
   ↓
9. 3번으로 돌아감 (최대 5개 질문까지)
   ↓
10. 면접 완료
```

## 🔧 기술 스택

### 음성 기술
- **STT (Speech-to-Text)**
  - 프론트엔드: Web Speech API (Chrome SpeechRecognition)
  - 백엔드: OpenAI Whisper API (더 정확한 전사)
  
- **TTS (Text-to-Speech)**
  - Web Speech Synthesis API
  - 말투별 파라미터 조정 (friendly/professional/formal)

- **오디오 녹음**
  - MediaRecorder API
  - 포맷: audio/webm

### AI 분석
- **LLM**: GPT-4o
- **기능**:
  - 답변 내용 평가 및 피드백
  - 꼬리 질문 생성 (이전 답변 비판적 검토)

## 📝 설정 방법

### 환경 변수
```bash
LLM_API_KEY=your_openai_api_key
LLM_API_URL=https://api.openai.com/v1
```

### 브라우저 요구사항
- **필수**: Chrome 브라우저
- **이유**: Web Speech API 지원 필요
- **권한**: 마이크 접근 권한 필요

## 🎯 왜 음성 전용인가?

1. **실전 면접 시뮬레이션**
   - 실제 면접은 말로 답변하는 것
   - 타이핑과 말하기는 완전히 다른 능력

2. **자연스러운 답변**
   - 텍스트는 편집/수정이 쉬워 "완벽한" 답변 가능
   - 음성은 실시간 사고 능력 테스트

3. **전달력 평가**
   - 말하는 속도, 유창함, 자신감 평가 가능
   - 비언어적 요소도 중요

## 🐛 트러블슈팅

### "답변이 감지되지 않았습니다" 오류
**원인:** transcript가 비어있음
**해결:**
1. 마이크 권한 확인
2. 마이크 음량 확인
3. 브라우저 콘솔에서 진단 로그 확인
   - `[진단 1단계]` - 오디오 Blob size
   - `[진단 2단계]` - transcript 길이
   - `[진단 3단계]` - API 응답
   - `[진단 4단계]` - "답변 없음" 처리

### 침묵 시 녹음이 중단됨
**해결:** 이미 해결됨
- `continuous: true` 설정
- `onend` 이벤트에서 자동 재시작
- 사용자가 "답변 완료"를 누를 때까지 계속 녹음

## 📚 관련 문서

- `VOICE_FEEDBACK_IMPLEMENTATION.md` - 음성 피드백 전체 구현
- `QUICK_START_VOICE_FEEDBACK.md` - 빠른 시작 가이드
- `DB_SCHEMA.md` - 데이터베이스 스키마

---

**마지막 업데이트:** 2025-11-11
**버전:** 2.0 (음성 전용 확정)





