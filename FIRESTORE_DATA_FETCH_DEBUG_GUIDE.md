# Firestore 데이터 조회 디버깅 가이드

## 📋 개요

STT 데이터가 Firebase DB에 저장되지만 프론트엔드에서 조회할 때 오류가 발생하거나 히스토리 목록에 나타나지 않는 문제를 해결하기 위한 클라이언트 사이드 조회 로직 디버깅 가이드입니다.

## 🔧 적용된 수정 사항

### 1단계: 결과 페이지 데이터 조회 디버깅 ✅

**파일:** `src/app/interview/result/[interviewId]/page.js`

#### ✅ ID 값 확인
```javascript
// useEffect 진입 시 ID 값 검증
console.log('[결과 페이지] - user.uid:', user?.uid || '(undefined)');
console.log('[결과 페이지] - interviewId:', interviewId || '(undefined)');
console.log('[결과 페이지] - 데이터 타입:', {
  userType: typeof user,
  uidType: typeof user?.uid,
  interviewIdType: typeof interviewId
});
```

**확인 항목:**
- user 객체가 undefined가 아닌가?
- user.uid가 존재하는가?
- interviewId가 유효한 문자열인가?

#### ✅ 경로 확인
```javascript
console.log('[결과 페이지] - 컬렉션 경로: interview_answers');
console.log('[결과 페이지] - 쿼리 조건 1: userId == ' + user.uid);
console.log('[결과 페이지] - 쿼리 조건 2: interviewId == ' + interviewId);
console.log('[결과 페이지] - 정렬 조건: timestamp asc');
```

**확인 항목:**
- 컬렉션 이름이 DB 구조와 일치하는가?
- 쿼리 조건의 필드명이 정확한가?

#### ✅ 스냅샷 로그
```javascript
// 각 문서에 대한 상세 로그
querySnapshot.forEach((doc) => {
  console.log('[결과 페이지] 📄 문서 ID:', doc.id);
  console.log('[결과 페이지] - doc.exists():', doc.exists());
  console.log('[결과 페이지] - doc.data():', doc.data());
});

// 데이터가 0개인 경우 경고
if (answersData.length === 0) {
  console.warn('[결과 페이지] ⚠️ 경고: 답변 데이터가 0개입니다!');
  console.warn('[결과 페이지] 💡 확인 사항:');
  console.warn('[결과 페이지]   1. Firestore에 interview_answers 컬렉션이 존재하는가?');
  console.warn('[결과 페이지]   2. userId와 interviewId가 일치하는 문서가 있는가?');
  console.warn('[결과 페이지]   3. Firestore Rules에서 read 권한이 있는가?');
}
```

### 2단계: 히스토리 페이지 쿼리 및 인덱스 점검 ✅

**파일:** `src/app/history/page.js`

#### ✅ Query 조건 확인
```javascript
console.log('[히스토리 페이지] - 쿼리 조건: userId == ' + user.uid);
console.log('[히스토리 페이지] - 정렬 조건: createdAt desc');
```

#### ✅ 인덱스 에러 검출 및 처리
```javascript
if (error.code === 'failed-precondition' || 
    error.message.includes('index') || 
    error.message.includes('requires an index')) {
  console.error('[히스토리 페이지] 🔍 원인: Firestore 복합 인덱스 누락!');
  console.error('[히스토리 페이지] 💡 해결방법:');
  console.error('[히스토리 페이지]   1. 아래 링크를 클릭하여 인덱스 자동 생성');
  console.error('[히스토리 페이지]   2. 또는 Firebase Console → Firestore → Indexes에서 수동 생성');
  console.error('[히스토리 페이지]   3. 인덱스 필드: userId (ASC) + createdAt (DESC)');
  
  // 인덱스 생성 링크 자동 추출
  const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
  if (indexUrlMatch) {
    console.error('[히스토리 페이지] 🔗🔗🔗 인덱스 생성 링크 (클릭하세요!): 🔗🔗🔗');
    console.error(indexUrlMatch[0]);
  }
}
```

#### ✅ orderBy 폴백 처리
```javascript
// 인덱스가 없을 경우 orderBy 없이 재시도
try {
  console.log('[히스토리 페이지] 🔄 Fallback: orderBy 없이 재시도');
  
  const q = query(
    feedbacksRef,
    where('userId', '==', user.uid)
    // orderBy 제거
  );
  
  const querySnapshot = await getDocs(q);
  const feedbackList = [];
  querySnapshot.forEach((doc) => {
    feedbackList.push({ id: doc.id, ...doc.data() });
  });
  
  // 클라이언트 측에서 정렬
  feedbackList.sort((a, b) => {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  console.log('[히스토리 페이지] ✅ 클라이언트 측 정렬 완료');
  setFeedbacks(feedbackList);
} catch (innerError) {
  // 폴백도 실패한 경우
}
```

### 3단계: 공통 에러 핸들링 강화 ✅

**적용된 파일:**
- `src/app/interview/result/[interviewId]/page.js`
- `src/app/history/page.js`
- `src/app/interview/page.js`
- `src/app/dashboard/page.js`

#### ✅ error.code와 error.message 출력
```javascript
catch (error) {
  console.error('[페이지명] ❌ 에러 발생!');
  console.error('[페이지명] - 에러 객체:', error);
  console.error('[페이지명] - error.code:', error.code);
  console.error('[페이지명] - error.message:', error.message);
  console.error('[페이지명] - error.name:', error.name);
}
```

#### ✅ permission-denied 에러 처리
```javascript
if (error.code === 'permission-denied') {
  console.error('[페이지명] 🔍 원인: Firestore Rules 권한 거부');
  console.error('[페이지명] 💡 해결방법:');
  console.error('[페이지명]   1. Firebase Console → Firestore Database → Rules');
  console.error('[페이지명]   2. 해당 컬렉션의 read 권한 확인');
  console.error('[페이지명]   3. userId 일치 여부 확인');
  console.error('[페이지명] - 현재 user.uid:', user.uid);
  console.error('[페이지명] 규칙 예시:');
  console.error('[페이지명]   match /interview_answers/{document} {');
  console.error('[페이지명]     allow read: if request.auth.uid == resource.data.userId;');
  console.error('[페이지명]   }');
}
```

#### ✅ 네트워크 에러 처리
```javascript
if (error.code === 'unavailable') {
  console.error('[페이지명] 🔍 원인: 네트워크 연결 문제');
  console.error('[페이지명] 💡 해결방법: 인터넷 연결 상태 확인');
}
```

## 📊 수정된 파일 요약

| 파일 | 추가된 기능 | 줄 수 변경 |
|------|-------------|-----------|
| `interview/result/[interviewId]/page.js` | ID 확인, 경로 확인, 스냅샷 로그, 상세 에러 핸들링 | +142, -38 |
| `history/page.js` | 인덱스 에러 검출, orderBy 폴백, 상세 에러 핸들링 | +139, -47 |
| `interview/page.js` | ID 확인, 쿼리 조건 확인, 에러 핸들링 | +53, -10 |
| `dashboard/page.js` | 프로필 조회 로그, 통계 로그, 에러 핸들링 | +41, -8 |

**총 변경:** 4개 파일, +375줄, -103줄

## 🔍 디버깅 프로세스

### 1. 결과 페이지 문제 진단

**브라우저 콘솔 확인 순서:**

1. **ID 값 확인**
   ```
   [결과 페이지] - user.uid: abc123def456
   [결과 페이지] - interviewId: interview_1234567890
   ```
   → ✅ 둘 다 존재하면 OK

2. **쿼리 생성 확인**
   ```
   [결과 페이지] ✅ 쿼리 생성 성공, onSnapshot 구독 시작...
   ```
   → ✅ 이 메시지가 나오면 쿼리 생성 성공

3. **스냅샷 결과 확인**
   ```
   [결과 페이지] 📥 onSnapshot 콜백 실행
   [결과 페이지] - 문서 개수: 5
   ```
   → ✅ 문서 개수가 0보다 크면 데이터 로드 성공

4. **문서 내용 확인**
   ```
   [결과 페이지] 📄 문서 ID: abc123
   [결과 페이지] - doc.exists(): true
   [결과 페이지] - doc.data(): { question: "...", transcript: "...", ... }
   ```
   → ✅ 각 문서의 데이터 확인 가능

### 2. 히스토리 페이지 문제 진단

**인덱스 누락 에러:**
```
[히스토리 페이지] ❌ getDocs 에러 발생!
[히스토리 페이지] - error.code: failed-precondition
[히스토리 페이지] 🔍 원인: Firestore 복합 인덱스 누락!
[히스토리 페이지] 🔗 인덱스 생성 링크: https://console.firebase.google.com/...
```

**해결 방법:**
1. 콘솔에 출력된 링크 클릭
2. Firebase Console에서 "Create Index" 버튼 클릭
3. 인덱스 생성 완료까지 대기 (몇 분 소요)
4. 페이지 새로고침

**인덱스 폴백 동작:**
```
[히스토리 페이지] ⏳ orderBy 없이 재시도 중...
[히스토리 페이지] 🔄 Fallback: orderBy 없이 재시도
[히스토리 페이지] ✅ 클라이언트 측 정렬 완료: 10개
```
→ ✅ orderBy를 제거하고 클라이언트에서 정렬하여 데이터 표시

### 3. 권한 에러 진단

**permission-denied 에러:**
```
[결과 페이지] ❌ onSnapshot 에러 발생!
[결과 페이지] - error.code: permission-denied
[결과 페이지] 🔍 원인: Firestore Rules 권한 거부
[결과 페이지] - 현재 user.uid: abc123def456
```

**해결 방법:**
1. Firebase Console → Firestore Database → Rules 탭 이동
2. 현재 규칙 확인:
   ```javascript
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /interview_answers/{document} {
         // 수정 전: allow read: if false;
         // 수정 후:
         allow read: if request.auth.uid == resource.data.userId;
       }
     }
   }
   ```
3. "Publish" 버튼 클릭하여 규칙 저장
4. 페이지 새로고침

## 🎯 일반적인 문제와 해결 방법

### 문제 1: "답변 데이터가 0개입니다"

**원인 분석:**
```
[결과 페이지] ⚠️ 경고: 답변 데이터가 0개입니다!
[결과 페이지] 💡 확인 사항:
  1. Firestore에 interview_answers 컬렉션이 존재하는가?
  2. userId와 interviewId가 일치하는 문서가 있는가?
  3. Firestore Rules에서 read 권한이 있는가?
```

**해결 방법:**
1. **Firebase Console에서 수동 확인:**
   - Firestore Database → Data 탭
   - `interview_answers` 컬렉션 확인
   - 해당 userId와 interviewId를 가진 문서가 있는지 확인

2. **쿼리 조건 불일치:**
   - 콘솔 로그에서 실제 쿼리 조건 확인:
     ```
     [결과 페이지] - 쿼리 조건 1: userId == abc123
     [결과 페이지] - 쿼리 조건 2: interviewId == interview_1234567890
     ```
   - Firebase Console에서 실제 문서의 userId, interviewId 필드 값 확인
   - **대소문자, 공백, 언더스코어 등이 정확히 일치하는지 확인**

3. **필드명 불일치:**
   - DB에는 `user_id`로 저장되어 있는데 코드에서는 `userId`로 조회하는 경우
   - 필드명을 일치시키도록 코드 또는 DB 수정

### 문제 2: "인덱스가 필요합니다"

**에러 메시지:**
```
The query requires an index. You can create it here: https://...
```

**해결 방법:**
1. **자동 생성 (권장):**
   - 콘솔에 출력된 링크 클릭
   - Firebase Console에서 "Create Index" 클릭
   - 몇 분 대기 후 "Enabled" 상태 확인

2. **수동 생성:**
   - Firebase Console → Firestore → Indexes 탭
   - "Create Index" 버튼 클릭
   - 컬렉션: `feedbacks`
   - 필드 추가:
     * `userId` - Ascending
     * `createdAt` - Descending
   - "Create" 버튼 클릭

3. **임시 해결책 (폴백):**
   - 코드가 자동으로 orderBy 없이 재시도
   - 클라이언트 측에서 정렬하여 표시
   - 성능이 약간 떨어지지만 작동함

### 문제 3: "권한이 거부되었습니다"

**에러 메시지:**
```
error.code: permission-denied
Missing or insufficient permissions
```

**해결 방법:**

1. **Firestore Rules 확인:**
   ```javascript
   // 개발 중 (임시):
   match /interview_answers/{document} {
     allow read, write: if true; // 누구나 접근 가능 (테스트용)
   }

   // 프로덕션 (권장):
   match /interview_answers/{document} {
     allow read: if request.auth.uid == resource.data.userId;
     allow create: if request.auth.uid == request.resource.data.userId;
   }
   ```

2. **인증 상태 확인:**
   - 콘솔에서 `user.uid` 확인
   - Firebase Authentication에서 해당 사용자 존재 여부 확인
   - 로그인 상태가 유지되는지 확인

3. **userId 일치 여부 확인:**
   - 저장할 때: `userId: user.uid`
   - 조회할 때: `where('userId', '==', user.uid)`
   - Firebase Console에서 실제 문서의 userId 값 확인

### 문제 4: "문서가 비어있습니다"

**증상:**
```
[결과 페이지] 📄 문서 ID: abc123
[결과 페이지] - doc.exists(): true
[결과 페이지] - doc.data(): { }  ← 비어있음
```

**원인:**
- Firestore에 문서는 존재하지만 필드가 없는 경우
- 데이터 저장 시 오류 발생

**해결 방법:**
1. 백그라운드 평가 로직의 Firestore 저장 코드 확인
2. `BACKGROUND_EVALUATION_DEBUG_GUIDE.md` 참고하여 저장 로직 디버깅
3. 콘솔에서 저장 성공 로그 확인:
   ```
   [백그라운드 평가] ✅✅✅ Firestore 저장 성공! ✅✅✅
   ```

## 📋 디버깅 체크리스트

### ✅ 결과 페이지 (InterviewResultPage)
- [ ] user와 interviewId가 undefined가 아닌가?
- [ ] 쿼리 조건이 올바르게 설정되었는가?
- [ ] onSnapshot 콜백이 실행되는가?
- [ ] 문서 개수가 0보다 큰가?
- [ ] 각 문서에 필요한 필드(question, transcript, feedback)가 있는가?

### ✅ 히스토리 페이지 (HistoryPage)
- [ ] user.uid가 존재하는가?
- [ ] feedbacks 컬렉션에 데이터가 있는가?
- [ ] 인덱스 에러가 발생하는가?
- [ ] orderBy 폴백이 정상 작동하는가?
- [ ] 클라이언트 측 정렬이 적용되는가?

### ✅ 공통 에러 핸들링
- [ ] error.code가 로그에 출력되는가?
- [ ] error.message가 로그에 출력되는가?
- [ ] permission-denied 에러 시 해결 방법이 출력되는가?
- [ ] 인덱스 에러 시 생성 링크가 출력되는가?

## 🔧 Firebase Console 체크리스트

### Firestore Database
- [ ] `interview_answers` 컬렉션이 존재하는가?
- [ ] `feedbacks` 컬렉션이 존재하는가?
- [ ] 각 문서에 필요한 필드가 모두 있는가?

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 면접 답변
    match /interview_answers/{document} {
      allow read: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }
    
    // 피드백
    match /feedbacks/{document} {
      allow read: if request.auth.uid == resource.data.userId;
      allow create: if request.auth.uid == request.resource.data.userId;
    }
    
    // 사용자 프로필
    match /users/{userId} {
      allow read, write: if request.auth.uid == userId;
    }
  }
}
```

### Firestore Indexes
필요한 복합 인덱스:
- `feedbacks`: userId (ASC) + createdAt (DESC)
- `interview_answers`: userId (ASC) + interviewId (ASC) + timestamp (ASC)

## 🎉 성공 시나리오

모든 것이 정상 작동할 때의 콘솔 로그:

```
[결과 페이지] useEffect 실행
[결과 페이지] - user.uid: abc123def456
[결과 페이지] - interviewId: interview_1234567890
[결과 페이지] 🔍 Firestore 데이터 조회 시작
[결과 페이지] ✅ 쿼리 생성 성공, onSnapshot 구독 시작...
[결과 페이지] 📥 onSnapshot 콜백 실행
[결과 페이지] - 문서 개수: 5
[결과 페이지] 📄 문서 ID: doc1
[결과 페이지] - doc.exists(): true
[결과 페이지] - doc.data(): { question: "...", transcript: "...", feedback: "{...}" }
[결과 페이지] ✅ 총 5개의 답변 데이터 로드됨
```

## 📞 추가 지원

위의 모든 단계를 시도했지만 여전히 문제가 해결되지 않으면:

1. **브라우저 콘솔 로그 전체 복사**
   - F12 → Console → 전체 선택 후 복사

2. **Firebase Console 스크린샷**
   - Firestore Database → Data 탭 → 해당 컬렉션 스크린샷
   - Firestore Database → Rules 탭 스크린샷

3. **에러 메시지와 함께 이슈 제기**
   - 로그 첨부
   - 스크린샷 첨부
   - 재현 단계 설명

