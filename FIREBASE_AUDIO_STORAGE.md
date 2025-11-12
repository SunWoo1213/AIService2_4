# Firebase 오디오 저장 구조

## 📌 개요

면접 시스템에서 사용자의 음성 답변을 **Firebase Storage**와 **Firestore**를 사용하여 저장하는 아키텍처입니다.

## 🔄 워크플로우

### 1단계: STT API 호출 및 피드백 받기
```javascript
// evaluate-delivery API 호출
const response = await fetch('/api/interview/evaluate-delivery', {
  method: 'POST',
  body: formData // audio + transcript
});

const analysisResult = await response.json();
// { contentFeedback: { advice: "...", score: 8 } }
```

### 2단계: Firebase Storage에 오디오 업로드
```javascript
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/firebase/config';

// 고유한 파일 경로 생성
const storagePath = `recordings/${userId}/${interviewId}/q1_${Date.now()}.webm`;
const storageRef = ref(storage, storagePath);

// 오디오 Blob 업로드
await uploadBytes(storageRef, audioBlob, {
  contentType: 'audio/webm'
});
```

### 3단계: 다운로드 URL 가져오기
```javascript
// 업로드 완료 후 다운로드 URL 생성
const audioURL = await getDownloadURL(storageRef);
// https://firebasestorage.googleapis.com/v0/b/...
```

### 4단계: Firestore에 메타데이터 저장
```javascript
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/firebase/config';

const answerData = {
  userId: userId,
  interviewId: interviewId,
  questionId: 'q1',
  question: "면접 질문 내용",
  transcript: "STT로 변환된 텍스트",
  audioURL: audioURL, // Storage URL
  feedback: "AI 피드백",
  score: 8,
  duration: 120, // 초
  timestamp: Timestamp.now(),
  createdAt: new Date().toISOString()
};

await addDoc(collection(db, 'interview_answers'), answerData);
```

## 📂 Storage 구조

```
gs://your-project.appspot.com/
└── recordings/
    └── [userId]/
        └── [interviewId]/
            ├── q1_1699999999999.webm
            ├── q2_1700000000000.webm
            ├── q3_1700000001111.webm
            ├── q4_1700000002222.webm
            └── q5_1700000003333.webm
```

**경로 구성:**
- `recordings/` - 최상위 폴더
- `{userId}` - 사용자별 폴더
- `{interviewId}` - 면접 세션별 폴더 (예: `interview_1699999999999`)
- `{questionId}_{timestamp}.webm` - 질문별 오디오 파일

**파일명 규칙:**
- 형식: `{questionId}_{timestamp}.webm`
- 예시: `q1_1699999999999.webm`, `q2_1700000000000.webm`

## 🗄️ Firestore 스키마

### `interview_answers` 컬렉션

| 필드 | 타입 | 설명 | 필수 |
|------|------|------|------|
| `userId` | string | 사용자 ID | ✅ |
| `interviewId` | string | 면접 세션 ID | ✅ |
| `questionId` | string | 질문 ID (q1, q2, ...) | ✅ |
| `question` | string | 면접 질문 내용 | ✅ |
| `transcript` | string | STT 변환 텍스트 | ✅ |
| `audioURL` | string \| null | Firebase Storage URL | ❌ |
| `feedback` | null | ~~AI 피드백~~ → **제거됨 (세트 기반)** | ❌ |
| ~~`score`~~ | ~~number \| null~~ | ~~점수 (0-10)~~ → **제거됨** | ❌ |
| `duration` | number | 녹음 시간 (초) | ✅ |
| `timestamp` | Timestamp | Firestore 타임스탬프 | ✅ |
| `createdAt` | string | ISO 날짜 문자열 | ✅ |

**예시 문서:**
```javascript
{
  userId: "abc123xyz",
  interviewId: "interview_1699999999999",
  questionId: "q1",
  question: "본인의 가장 자신있는 프로젝트 경험을 설명해주세요.",
  transcript: "저는 React와 Node.js를 활용하여...",
  audioURL: "https://firebasestorage.googleapis.com/v0/b/.../q1_1699999999999.webm",
  feedback: "프로젝트 경험을 구체적으로 설명했습니다...",
  score: 8,
  duration: 95,
  timestamp: Timestamp { seconds: 1699999999, nanoseconds: 999000000 },
  createdAt: "2024-11-14T10:39:59.999Z"
}
```

## 🔒 보안 규칙

### Firestore 규칙
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /interview_answers/{answerId} {
      // 본인의 답변만 읽기/쓰기 가능
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

### Storage 규칙
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /recordings/{userId}/{interviewId}/{fileName} {
      // 본인의 녹음 파일만 읽기/쓰기 가능
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## 📊 쿼리 예시

### 특정 면접 세션의 모든 답변 가져오기
```javascript
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

const q = query(
  collection(db, 'interview_answers'),
  where('userId', '==', userId),
  where('interviewId', '==', interviewId),
  orderBy('timestamp', 'asc')
);

const querySnapshot = await getDocs(q);
const answers = querySnapshot.docs.map(doc => ({
  id: doc.id,
  ...doc.data()
}));
```

### 사용자의 모든 면접 기록 가져오기
```javascript
const q = query(
  collection(db, 'interview_answers'),
  where('userId', '==', userId),
  orderBy('timestamp', 'desc')
);

const querySnapshot = await getDocs(q);
```

## 🎵 오디오 재생

### Storage URL로 오디오 재생
```javascript
// audioURL은 Firestore에서 가져온 값
const audio = new Audio(audioURL);
audio.play();
```

### React 컴포넌트에서 재생
```jsx
function AudioPlayer({ audioURL }) {
  return (
    <audio controls>
      <source src={audioURL} type="audio/webm" />
      Your browser does not support the audio element.
    </audio>
  );
}
```

## ⚠️ 에러 핸들링

### Storage 업로드 실패
```javascript
if (storage) {
  try {
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, audioBlob);
    const audioURL = await getDownloadURL(storageRef);
  } catch (storageError) {
    console.error('[Firebase] Storage 업로드 실패:', storageError);
    // audioURL은 null로 유지하고 계속 진행
  }
} else {
  console.warn('[Firebase] Storage가 초기화되지 않았습니다.');
}
```

### Firestore 저장 실패
```javascript
if (db) {
  try {
    const docRef = await addDoc(collection(db, 'interview_answers'), data);
    console.log('저장 완료:', docRef.id);
  } catch (firestoreError) {
    console.error('[Firebase] Firestore 저장 실패:', firestoreError);
    // 로컬 상태는 유지하고 계속 진행
  }
} else {
  console.warn('[Firebase] Firestore가 초기화되지 않았습니다.');
}
```

## 💾 스토리지 용량 관리

### 오디오 파일 크기
- **포맷**: audio/webm
- **평균 크기**: ~200KB/분 (압축률에 따라 다름)
- **예상 용량**: 5개 질문 × 1분 = ~1MB/면접

### Storage 할당량
- **Firebase Spark (무료)**: 1GB
- **Firebase Blaze (종량제)**: $0.026/GB

### 정리 전략
```javascript
// 오래된 녹음 파일 자동 삭제 (Cloud Function)
exports.cleanupOldRecordings = functions.pubsub
  .schedule('every 30 days')
  .onRun(async () => {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
    
    // Firestore에서 오래된 답변 찾기
    const oldAnswers = await db.collection('interview_answers')
      .where('timestamp', '<', Timestamp.fromMillis(thirtyDaysAgo))
      .get();
    
    // Storage 파일 삭제
    for (const doc of oldAnswers.docs) {
      const { audioURL } = doc.data();
      if (audioURL) {
        // URL에서 파일 경로 추출 후 삭제
      }
    }
  });
```

## 🚀 배포 체크리스트

### 1. Firebase Console 설정
- [ ] Storage 활성화
- [ ] Storage 보안 규칙 배포
- [ ] Firestore 인덱스 생성
- [ ] Firestore 보안 규칙 배포

### 2. 환경 변수 확인
```bash
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
# ... 기타 Firebase 설정
```

### 3. 테스트
- [ ] 오디오 녹음 후 Storage 업로드 확인
- [ ] Firestore에 메타데이터 저장 확인
- [ ] 저장된 오디오 URL로 재생 테스트
- [ ] 보안 규칙 테스트 (다른 사용자 접근 차단)

## 📚 관련 문서

- [Firebase Storage 공식 문서](https://firebase.google.com/docs/storage)
- [Firestore 공식 문서](https://firebase.google.com/docs/firestore)
- `DB_SCHEMA.md` - 전체 데이터베이스 스키마
- `INTERVIEW_VOICE_ONLY.md` - 음성 전용 면접 시스템

---

**마지막 업데이트:** 2025-11-11
**버전:** 1.0





