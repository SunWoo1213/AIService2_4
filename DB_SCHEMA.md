# 데이터베이스 스키마 설계

## user_preferences 컬렉션 (Firestore)

사용자의 피드백 선호도를 저장하고 개인화된 경험을 제공하기 위한 컬렉션입니다.

### 필드 구조

```javascript
{
  // 기본 정보
  user_id: string,              // Firestore users 컬렉션의 UID (Primary Key)
  
  // 피드백 선호도
  tone_preference: string,      // 피드백 톤 ('friendly', 'formal', 'professional')
  feedback_depth: string,       // 피드백 깊이 ('summary_only', 'detailed_examples', 'comprehensive')
  
  // 사용자 불만 및 개선 사항
  recent_complaint: string | null,  // 최근 불만 사항 ('too_abstract', 'needs_examples', 'needs_refinement', null)
  complaint_count: number,      // 불만 누적 횟수
  complaint_history: array,     // 불만 이력 [{ timestamp, reason, feedback_id }]
  
  // 메타데이터
  created_at: timestamp,        // 생성 시간
  updated_at: timestamp,        // 마지막 업데이트 시간
  first_survey_completed: boolean,  // 초기 설문 완료 여부
}
```

### 기본값

신규 사용자의 기본 설정:
```javascript
{
  tone_preference: 'friendly',
  feedback_depth: 'detailed_examples',
  recent_complaint: null,
  complaint_count: 0,
  complaint_history: [],
  first_survey_completed: false
}
```

### 인덱스 설계

```javascript
// Firestore Composite Index
{
  collection: 'user_preferences',
  fields: [
    { fieldPath: 'user_id', order: 'ASCENDING' }
  ]
}
```

## voice_transcriptions 컬렉션 (Firestore)

음성 녹음과 STT 결과를 임시 저장하기 위한 컬렉션입니다.

### 필드 구조

```javascript
{
  transcription_id: string,     // 자동 생성 ID (Primary Key)
  user_id: string,              // 사용자 ID (Foreign Key)
  
  // STT 데이터
  stt_result: string,           // STT 텍스트
  audio_duration: number,       // 오디오 길이 (초)
  
  // LLM 요약 결과 (Step 2)
  summary: string,              // LLM이 생성한 한 문장 요약
  domain_status: string,        // 'OK', 'OFF_TOPIC', 'UNCERTAIN'
  
  // 상태
  status: string,               // 'pending', 'confirmed', 'rejected'
  
  // 메타데이터
  created_at: timestamp,        // 생성 시간
  expires_at: timestamp,        // 만료 시간 (24시간 후)
}
```

## interview_answers 컬렉션 (새로 추가)

면접 답변과 오디오 녹음을 저장하는 컬렉션입니다.

### 필드 구조

```javascript
{
  // 기본 정보
  userId: string,              // 사용자 ID
  interviewId: string,         // 면접 세션 ID (예: interview_1699999999999)
  questionId: string,          // 질문 ID (예: q1, q2, q3)
  
  // 질문과 답변
  question: string,            // 면접 질문 내용
  transcript: string,          // STT로 변환된 답변 텍스트
  
  // 오디오 파일
  audioURL: string | null,     // Firebase Storage 다운로드 URL
  
  // ===== [세트 기반] 피드백 변경 =====
  feedback: null,              // 개별 피드백 제거 (항상 null)
  // 💡 종합 피드백은 feedbacks 컬렉션의 overallFeedback 필드에 저장됩니다.
  
  // 메타데이터
  duration: number,            // 녹음 시간 (초)
  timestamp: timestamp,        // Firestore 타임스탬프
  createdAt: string,           // ISO 문자열 날짜
}
```

### 인덱스 설계

```javascript
// Firestore Composite Index
// 중요: timestamp는 ASCENDING으로 설정 (코드에서 orderBy('timestamp', 'asc') 사용)
{
  collection: 'interview_answers',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'interviewId', order: 'ASCENDING' },
    { fieldPath: 'timestamp', order: 'ASCENDING' }  // ASC: 질문 순서대로 표시
  ]
}
```

**Firebase Console에서 생성하는 방법:**
1. Firebase Console → Firestore Database → 인덱스 탭
2. 복합 인덱스 추가 클릭
3. 컬렉션: `interview_answers`
4. 필드: `userId (오름차순)`, `interviewId (오름차순)`, `timestamp (오름차순)`
5. 만들기 클릭

자세한 가이드는 `FIRESTORE_INDEX_GUIDE.md` 참고

### Storage 구조

```
gs://[your-bucket]/recordings/
  ├── [userId]/
  │   ├── [interviewId]/
  │   │   ├── q1_1699999999999.webm
  │   │   ├── q2_1699999999999.webm
  │   │   ├── q3_1699999999999.webm
  │   │   └── ...
```

## feedbacks 컬렉션 (면접 세션 메타데이터 및 종합 피드백)

**[세트 기반]** 각 면접 세션의 메타데이터와 종합 피드백을 저장합니다.

### 필드 구조

```javascript
{
  // 기본 정보
  userId: string,              // 사용자 ID
  interviewId: string,         // 면접 세션 ID (고유값, 예: interview_1699999999999)
  type: 'interview',           // 피드백 타입 (면접)
  
  // 면접 설정
  resumeText: string,          // 이력서 내용
  jobKeywords: object,         // 직무 키워드
  tonePreference: string,      // 선호 톤 ('친근한', '전문적인', '격식있는')
  
  // ===== [세트 기반] 종합 피드백 =====
  overallFeedback: {
    overallConsistency: string,  // 전체 일관성 평가
    strengths: string,           // 전체 면접에서의 강점
    weaknesses: string,          // 전체 면접에서의 약점
    improvements: string,        // 구체적 개선 방향
    summary: string              // 최종 종합 평가
  } | null,                       // 5개 질문 완료 후 생성
  
  // 타임스탬프
  createdAt: string,           // 면접 시작 시각 (ISO 문자열)
  timestamp: timestamp,        // Firestore 타임스탬프
  feedbackGeneratedAt: timestamp | null,  // 종합 피드백 생성 시각
  updatedAt: string | null     // 마지막 업데이트 시각
}
```

### 종합 피드백 생성 흐름

1. **면접 시작**: `handleInterviewComplete` 함수에서 feedbacks 컬렉션에 세션 메타데이터 저장 (overallFeedback: null)
2. **5번째 질문 완료**: `generate-overall-feedback` API 호출
3. **API 처리**:
   - interview_answers 컬렉션에서 5개 답변 조회
   - LLM으로 종합 분석
   - feedbacks 문서의 overallFeedback 필드 업데이트
4. **결과 페이지**: onSnapshot으로 실시간 업데이트 표시

### 기존 필드 (이력서 피드백용)

```javascript
{
  // 이력서 피드백 관련 필드 (기존 유지)
  transcription_id: string | null,
  input_mode: string,
  structured_feedback: object | null,
  user_rating: string | null,
  rating_reason: string | null,
  rating_timestamp: timestamp | null,
}
```

## Firestore 보안 규칙

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // user_preferences: 본인만 읽기/쓰기 가능
    match /user_preferences/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // voice_transcriptions: 본인만 읽기/쓰기 가능
    match /voice_transcriptions/{transcriptionId} {
      allow read, write: if request.auth != null && 
                            resource.data.user_id == request.auth.uid;
    }
    
    // interview_answers: 본인만 읽기/쓰기 가능
    match /interview_answers/{answerId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && 
                       request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && 
                       resource.data.userId == request.auth.uid;
    }
    
    // feedbacks: 기존 규칙 유지 (본인만 접근)
    match /feedbacks/{feedbackId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && 
                       request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && 
                       resource.data.userId == request.auth.uid;
    }
  }
}
```

## Firebase Storage 보안 규칙

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    // 녹음 파일: 본인만 읽기/쓰기 가능
    match /recordings/{userId}/{interviewId}/{fileName} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 데이터 마이그레이션 계획

### 1단계: 기존 사용자 마이그레이션

기존 users 컬렉션의 모든 사용자에 대해 user_preferences 문서를 자동 생성합니다.

```javascript
// Migration script (Admin SDK)
const migrateUserPreferences = async () => {
  const usersSnapshot = await admin.firestore().collection('users').get();
  
  const batch = admin.firestore().batch();
  
  usersSnapshot.forEach((userDoc) => {
    const prefRef = admin.firestore()
      .collection('user_preferences')
      .doc(userDoc.id);
    
    batch.set(prefRef, {
      user_id: userDoc.id,
      tone_preference: 'friendly',
      feedback_depth: 'detailed_examples',
      recent_complaint: null,
      complaint_count: 0,
      complaint_history: [],
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp(),
      first_survey_completed: false
    });
  });
  
  await batch.commit();
  console.log('Migration completed');
};
```

### 2단계: 만료된 데이터 자동 삭제

Cloud Functions를 사용하여 24시간이 지난 voice_transcriptions를 자동 삭제합니다.

```javascript
// Cloud Function
exports.cleanupExpiredTranscriptions = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    const now = admin.firestore.Timestamp.now();
    const expiredQuery = admin.firestore()
      .collection('voice_transcriptions')
      .where('expires_at', '<=', now)
      .limit(500);
    
    const snapshot = await expiredQuery.get();
    
    if (snapshot.empty) {
      return null;
    }
    
    const batch = admin.firestore().batch();
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
    console.log(`Deleted ${snapshot.size} expired transcriptions`);
  });
```

## API 엔드포인트와 DB 매핑

### `/api/voice/transcribe` (새로 생성)
- **읽기**: 없음
- **쓰기**: `voice_transcriptions` 컬렉션에 새 문서 생성

### `/api/feedback/generate` (새로 생성)
- **읽기**: `user_preferences`, `voice_transcriptions`
- **쓰기**: `feedbacks` 컬렉션에 새 문서 생성

### `/api/feedback/rate` (새로 생성)
- **읽기**: `feedbacks`, `user_preferences`
- **쓰기**: `feedbacks` (평가 업데이트), `user_preferences` (불만 업데이트)

## 성능 최적화

### 캐싱 전략

1. **user_preferences**: 클라이언트 측 메모리 캐싱 (세션 동안 유지)
2. **voice_transcriptions**: 캐싱 불필요 (임시 데이터)
3. **feedbacks**: Firestore 자동 캐싱 활용

### 쿼리 최적화

- user_preferences는 단일 문서 조회만 사용 (user_id로 직접 접근)
- voice_transcriptions는 만료 시간 인덱스 필요
- feedbacks는 기존 인덱스 활용 (userId + createdAt)



