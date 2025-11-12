# 백그라운드 답변 평가 디버깅 가이드

## 📋 개요

이 문서는 면접 답변 평가 로직이 백그라운드에서 실행되어 Firestore에 feedback 데이터를 저장하는 과정을 디버깅하기 위한 가이드입니다.

## 🔍 적용된 개선 사항 (3단계)

### 1단계: 상세 로깅(Logging) 추가 ✅

백그라운드 함수 내부의 실행 흐름을 추적할 수 있도록 단계별 로깅이 추가되었습니다.

#### 클라이언트 측 (InterviewUI.jsx)

**함수 진입점:**
```
[백그라운드 평가] 함수 시작
[백그라운드 평가] 시작 시각: <timestamp>
[백그라운드 평가] docId 생성 예정: <docId>
```

**입력 데이터 검증:**
```
[백그라운드 평가] 📋 입력 데이터 검증:
[백그라운드 평가] - audioBlob: { size, type, exists }
[백그라운드 평가] - transcript: { length, preview, isEmpty }
[백그라운드 평가] - question: <preview>
[백그라운드 평가] - audioURL: 존재함 ✓ / 없음 ✗
```

**LLM 호출 직전/직후:**
```
[백그라운드 평가] 🚀 LLM API 호출 시작...
[백그라운드 평가] - API 엔드포인트: /api/interview/evaluate-delivery
[백그라운드 평가] - 호출 시각: <timestamp>

[백그라운드 평가] 📨 LLM API 응답 수신
[백그라운드 평가] - 응답 상태: 200 OK
[백그라운드 평가] ✅ LLM 피드백 생성 완료!
```

**Firestore 저장:**
```
[백그라운드 평가] 📝 Firestore 저장 시작
[백그라운드 평가] - 컬렉션: interview_answers
[백그라운드 평가] - userId: <userId>
[백그라운드 평가] - interviewId: <interviewId>
[백그라운드 평가] - questionId: q1
[백그라운드 평가] - feedback 필드 포함: true

[백그라운드 평가] ✅✅✅ Firestore 저장 성공! ✅✅✅
[백그라운드 평가] - 저장된 문서 ID: <docId>
[백그라운드 평가] 🎉 백그라운드 평가 전체 프로세스 완료!
```

#### 서버 측 (evaluate-delivery/route.js)

**API 진입점:**
```
[API] 📥 답변 평가 API 호출됨
[API] - 요청 시작 시각: <timestamp>
[API] - 요청 ID: <requestId>
```

**데이터 검증:**
```
[API] 📋 수신된 데이터 검증:
[API] - audioFile: { exists, size, type, isValid }
[API] - transcript: { length, isEmpty, preview }
[API] - question: { exists, length, preview }
```

**최종 응답:**
```
[API] ✅✅✅ 답변 평가 완료! API 응답 반환 ✅✅✅
[API] - 총 처리 시간: <ms> ms
[API] - 반환 데이터: { hasStrengths, hasWeaknesses, ... }
```

### 2단계: 에러 핸들링 강화 ✅

#### 필수 데이터 검증

백그라운드 함수 시작 시 입력 데이터를 검증합니다:

```javascript
// audioBlob 검증
if (!audioBlob || audioBlob.size === 0) {
  throw new Error('❌ CRITICAL: audioBlob이 비어있거나 존재하지 않습니다!');
}

// transcript 경고
if (!transcript || transcript.trim().length === 0) {
  console.warn('⚠️ WARNING: transcript가 비어있습니다. API가 실패할 수 있습니다.');
}

// question 검증
if (!question) {
  throw new Error('❌ CRITICAL: question이 비어있습니다!');
}
```

#### 중첩된 Try-Catch 블록

**레벨 1: API 호출 에러**
```javascript
try {
  const response = await fetch('/api/interview/evaluate-delivery', { ... });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`답변 평가 API 실패 (${response.status}): ${errorText}`);
  }
} catch (error) {
  // 상세 에러 로깅
}
```

**레벨 2: Firestore 저장 에러**
```javascript
try {
  const docRef = await addDoc(collection(db, 'interview_answers'), answerData);
  console.log('✅ Firestore 저장 성공!');
} catch (firestoreError) {
  console.error('❌ Firestore 저장 실패!');
  console.error('- 에러 코드:', firestoreError.code);
  console.error('- 에러 메시지:', firestoreError.message);
  console.error('💡 해결 방법:');
  console.error('1. Firebase Console → Firestore Database → Rules');
  console.error('2. "allow create, write" 권한이 있는지 확인');
  throw firestoreError;
}
```

**레벨 3: 전체 프로세스 에러**
```javascript
try {
  // ... 전체 백그라운드 평가 로직 ...
} catch (error) {
  console.error('💥💥💥 FATAL ERROR 💥💥💥');
  console.error('백그라운드 평가 프로세스 중 치명적 오류 발생!');
  
  // 에러 원인 자동 분석
  if (error.message.includes('audioBlob')) {
    console.error('🔍 원인: 오디오 데이터 문제');
    console.error('→ 마이크 권한 또는 녹음 실패 확인 필요');
  } else if (error.message.includes('API')) {
    console.error('🔍 원인: LLM API 호출 실패');
    console.error('→ API 키, 네트워크, 서버 상태 확인 필요');
  } else if (error.message.includes('Firestore')) {
    console.error('🔍 원인: Firestore 저장 실패');
    console.error('→ Firestore 권한, 규칙, 연결 상태 확인 필요');
  }
  
  // 에러를 던지지 않고 여기서 멈춤 (사용자 플로우에 영향 없도록)
}
```

### 3단계: 비동기 실행 보장 ✅

#### 클라이언트 측 실행 패턴

현재 구조에서 `evaluateAnswerInBackground` 함수는 **클라이언트 측**에서 실행되므로 Vercel의 `waitUntil`이 필요하지 않습니다. 대신 `.catch()` 패턴을 사용하여 에러가 발생해도 사용자 플로우에 영향을 주지 않도록 합니다.

```javascript
// ===== [3단계] 비동기 실행 보장 패턴 =====
console.log('[메인 플로우] 백그라운드 평가 함수 호출 시작');

evaluateAnswerInBackground(
  audioBlob,
  finalAnswer,
  currentQuestion.question,
  audioURL,
  actualDurationInSeconds
).catch(error => {
  // 백그라운드 작업 실패 시 에러 로깅
  console.error('[메인 플로우] ⚠️ 백그라운드 평가 프로세스 실패');
  console.error('[메인 플로우] 하지만 사용자 플로우는 계속 진행됩니다.');
  console.error('[메인 플로우] - 에러:', error);
  
  // 에러가 발생해도 사용자 플로우에는 영향 없음
  // 사용자는 다음 질문으로 계속 진행하고, 결과 페이지에서 "분석 중..." 상태를 보게 됨
});

console.log('[메인 플로우] 백그라운드 평가 함수 호출 완료 (백그라운드 실행 중)');
```

**중요 사항:**
- `await`를 사용하지 않음 → 메인 플로우가 블로킹되지 않음
- `.catch()`를 추가하여 에러 발생 시 적절히 처리
- 에러가 발생해도 사용자는 다음 질문으로 계속 진행

#### 서버리스 환경 대응 (참고)

만약 API Route에서 백그라운드 작업을 실행해야 한다면, Vercel의 `waitUntil`을 사용해야 합니다:

```javascript
// ⚠️ 현재는 사용하지 않지만, 참고용으로 남김
import { waitUntil } from '@vercel/functions';

export async function POST(request) {
  // ... 데이터 처리 ...
  
  // 백그라운드 작업을 waitUntil로 감싸기
  waitUntil(
    evaluateAnswerInBackground(...)
      .catch(console.error)
  );
  
  // 즉시 응답 반환
  return NextResponse.json({ success: true });
}
```

## 🐛 디버깅 체크리스트

백그라운드 평가가 작동하지 않을 때 다음 순서로 확인하세요:

### ✅ 1단계: 브라우저 콘솔 확인

1. **면접 진행 중 답변 완료 버튼 클릭 후:**
   - `[백그라운드 평가] 함수 시작` 로그가 보이는가?
   - 입력 데이터 검증 로그가 모두 통과하는가?

2. **데이터 검증:**
   - `audioBlob.size`가 0이 아닌가?
   - `transcript`가 비어있지 않은가?
   - `question`이 존재하는가?

3. **API 호출:**
   - `[백그라운드 평가] 🚀 LLM API 호출 시작...` 로그가 보이는가?
   - 응답 상태가 200 OK인가?

4. **Firestore 저장:**
   - `[백그라운드 평가] ✅✅✅ Firestore 저장 성공!` 로그가 보이는가?
   - 저장된 문서 ID가 출력되는가?

### ✅ 2단계: 서버 로그 확인 (터미널 또는 Vercel Logs)

1. **API 수신:**
   - `[API] 📥 답변 평가 API 호출됨` 로그가 있는가?

2. **데이터 수신:**
   - `audioFile.size`가 0보다 큰가?
   - `transcript`가 비어있지 않은가?

3. **LLM 처리:**
   - Whisper API 호출이 성공하는가?
   - LLM API 응답이 정상적으로 수신되는가?

4. **최종 응답:**
   - `[API] ✅✅✅ 답변 평가 완료!` 로그가 있는가?
   - 처리 시간이 너무 길지 않은가? (60초 초과 시 타임아웃)

### ✅ 3단계: Firebase Console 확인

1. **Firestore Database:**
   - `interview_answers` 컬렉션이 존재하는가?
   - 새로운 문서가 생성되었는가?
   - `feedback` 필드에 데이터가 있는가?

2. **Firestore Rules:**
   ```javascript
   match /interview_answers/{document} {
     allow create, write: if request.auth != null;
     // 또는 개발 중이라면:
     allow create, write: if true;
   }
   ```

3. **Storage Rules (audioURL용):**
   ```javascript
   match /recordings/{userId}/{interviewId}/{fileName} {
     allow write: if request.auth != null || true;
     allow read: if true; // Public read
   }
   ```

### ✅ 4단계: 환경 변수 확인

1. **`.env.local` 파일:**
   ```bash
   LLM_API_KEY=sk-...  # OpenAI API 키
   LLM_API_URL=https://api.openai.com/v1
   ```

2. **Vercel 환경 변수 (배포 시):**
   - Vercel Dashboard → Settings → Environment Variables
   - `LLM_API_KEY`와 `LLM_API_URL` 설정 확인

### ✅ 5단계: 네트워크 확인

1. **브라우저 개발자 도구 → Network 탭:**
   - `/api/interview/evaluate-delivery` 요청이 보이는가?
   - 응답 상태가 200 OK인가?
   - 응답 시간이 60초 이내인가?

2. **Firestore 네트워크:**
   - `firestore.googleapis.com` 연결이 정상인가?
   - 방화벽이 Firestore를 차단하지 않는가?

## 📊 일반적인 에러 패턴과 해결 방법

### 에러 1: "audioBlob이 비어있거나 존재하지 않습니다"

**원인:**
- 마이크 권한이 거부됨
- 녹음이 제대로 시작되지 않음
- `MediaRecorder`가 실패함

**해결 방법:**
1. 브라우저 주소창 왼쪽 자물쇠 아이콘 → 마이크 권한 확인
2. Chrome 브라우저 사용 (Safari, Firefox는 제한적 지원)
3. HTTPS 연결 확인 (localhost는 예외)

### 에러 2: "transcript가 비어있습니다"

**원인:**
- `SpeechRecognition`이 작동하지 않음
- 침묵 상태로 녹음 종료
- 마이크 입력이 감지되지 않음

**해결 방법:**
1. 마이크가 제대로 연결되어 있는지 확인
2. 시스템 설정에서 마이크 볼륨 확인
3. 다른 앱이 마이크를 독점하고 있지 않은지 확인

### 에러 3: "LLM API 호출 실패"

**원인:**
- OpenAI API 키가 없거나 잘못됨
- API 요금 한도 초과
- 네트워크 연결 문제
- OpenAI 서비스 장애

**해결 방법:**
1. `.env.local` 파일에서 `LLM_API_KEY` 확인
2. OpenAI Dashboard에서 API 키 상태 및 잔액 확인
3. 네트워크 연결 확인 (방화벽, VPN)
4. [OpenAI Status](https://status.openai.com/) 페이지 확인

### 에러 4: "Firestore 저장 실패"

**원인:**
- Firestore Rules에서 write 권한 없음
- Firebase 프로젝트가 초기화되지 않음
- 네트워크 연결 문제
- Firestore가 활성화되지 않음

**해결 방법:**
1. Firebase Console → Firestore Database → Rules 확인
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /interview_answers/{document} {
         allow create, write: if request.auth != null;
         allow read: if request.auth.uid == resource.data.userId;
       }
     }
   }
   ```
2. `firebase/config.js`에서 Firestore 초기화 확인:
   ```javascript
   import { getFirestore } from 'firebase/firestore';
   export const db = getFirestore(app);
   ```
3. Firebase Console → Firestore Database가 활성화되어 있는지 확인

### 에러 5: "API 타임아웃 (60초 초과)"

**원인:**
- LLM 응답이 너무 느림
- Whisper API 처리 시간이 오래 걸림
- 네트워크가 느림

**해결 방법:**
1. `evaluate-delivery/route.js` 상단 확인:
   ```javascript
   export const maxDuration = 60; // 필요 시 늘리기
   ```
2. Vercel 플랜 확인 (Hobby 플랜은 최대 10초, Pro 플랜은 60초)
3. LLM 모델 변경 고려 (gpt-4o → gpt-3.5-turbo)

## 🔧 긴급 디버깅 모드

문제를 신속하게 파악하기 위한 집중 로깅:

### 임시로 로그를 alert로 변경

**InterviewUI.jsx:**
```javascript
// 백그라운드 평가 함수 시작 부분에 추가
console.log('[백그라운드 평가] 함수 시작');
alert('백그라운드 평가 시작!'); // 임시 디버깅용

// API 호출 직전
console.log('[백그라운드 평가] API 호출 시작');
alert('API 호출 중...'); // 임시 디버깅용

// API 호출 직후
console.log('[백그라운드 평가] API 응답 수신:', response.status);
alert(`API 응답: ${response.status}`); // 임시 디버깅용

// Firestore 저장 성공
console.log('[백그라운드 평가] Firestore 저장 성공');
alert('Firestore 저장 완료!'); // 임시 디버깅용
```

**⚠️ 주의:** 디버깅이 끝나면 모든 `alert()` 제거하세요!

## 📞 추가 지원

위의 모든 단계를 시도했지만 여전히 문제가 해결되지 않으면:

1. **브라우저 콘솔 로그 전체 복사**
   - F12 → Console → 마우스 우클릭 → "Save as..."

2. **서버 로그 전체 복사** (로컬 개발 시)
   - 터미널에서 `npm run dev` 실행 중인 창의 로그 복사

3. **Vercel Logs 확인** (배포 시)
   - Vercel Dashboard → 프로젝트 선택 → Logs
   - 해당 시간대의 로그 확인

4. **Firebase Console에서 확인**
   - Firestore Database → 데이터 탭
   - `interview_answers` 컬렉션 확인

5. **에러 메시지와 함께 이슈 제기**
   - 로그를 첨부하여 GitHub Issue 생성
   - 또는 개발팀에 전달

## 🎯 결론

위의 3단계 수정을 통해:

1. ✅ **상세 로깅**: 백그라운드 평가 프로세스의 모든 단계를 추적 가능
2. ✅ **강화된 에러 핸들링**: 에러 발생 시 원인을 자동으로 분석하고 해결 방법 제시
3. ✅ **비동기 실행 보장**: 클라이언트 측에서 안전하게 백그라운드 작업 실행

이제 브라우저 콘솔과 서버 로그를 확인하여 문제의 정확한 위치와 원인을 파악할 수 있습니다!

