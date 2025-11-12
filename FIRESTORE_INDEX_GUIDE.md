# Firebase Firestore 인덱스 구성 가이드

## 📋 개요

`interview_answers` 컬렉션에서 사용하는 쿼리에 필요한 **복합 인덱스(Composite Index)** 구성 방법을 설명합니다.

## 🔍 현재 쿼리 패턴 분석

### 사용 위치: `src/app/interview/result/[interviewId]/page.js`

```javascript
const q = query(
  answersRef,
  where('userId', '==', user.uid),           // 조건 1: userId로 필터링
  where('interviewId', '==', interviewId),   // 조건 2: interviewId로 필터링
  orderBy('timestamp', 'asc')                // 정렬: timestamp 오름차순
);
```

**쿼리 목적:**
- 특정 사용자(`userId`)의
- 특정 면접 세션(`interviewId`)에 대한
- 모든 답변을 시간순(`timestamp` 오름차순)으로 조회

## ✅ 필요한 인덱스 구성

### Firebase Console에서 생성해야 할 인덱스

```
컬렉션: interview_answers

필드 구성:
1. userId         → ASCENDING
2. interviewId    → ASCENDING  
3. timestamp      → ASCENDING
```

## 🎯 인덱스 생성 방법

### 방법 1: Firebase Console에서 직접 생성 (권장)

#### 1단계: Firebase Console 접속
1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택
3. 좌측 메뉴에서 **Firestore Database** 클릭

#### 2단계: 인덱스 탭으로 이동
1. 상단 탭에서 **인덱스(Indexes)** 클릭
2. **복합(Composite)** 탭 선택
3. **인덱스 추가(Add Index)** 버튼 클릭

#### 3단계: 인덱스 설정
```
컬렉션 ID: interview_answers

필드:
  ┌─────────────┬──────────┐
  │ 필드 경로    │ 정렬     │
  ├─────────────┼──────────┤
  │ userId      │ 오름차순 │
  │ interviewId │ 오름차순 │
  │ timestamp   │ 오름차순 │
  └─────────────┴──────────┘

쿼리 범위: Collection
```

#### 4단계: 생성
- **만들기(Create)** 버튼 클릭
- 생성 완료까지 약 5-10분 소요 (상태: 🟢 사용 설정됨)

### 방법 2: 에러 메시지의 링크 사용 (자동)

#### 인덱스가 없을 때 발생하는 에러:
```
FirebaseError: The query requires an index. 
You can create it here: https://console.firebase.google.com/v1/r/project/[PROJECT_ID]/firestore/indexes?create_composite=...
```

**조치:**
1. 콘솔에 출력된 에러 메시지 확인
2. 에러 메시지 안의 URL 링크 클릭
3. Firebase Console이 자동으로 열리며 인덱스 설정이 미리 채워짐
4. **만들기** 버튼만 클릭하면 완료!

### 방법 3: firestore.indexes.json 파일 사용 (배포 자동화)

#### 프로젝트 루트에 `firestore.indexes.json` 생성:

```json
{
  "indexes": [
    {
      "collectionGroup": "interview_answers",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "interviewId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "timestamp",
          "order": "ASCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

#### Firebase CLI로 배포:

```bash
# Firebase CLI 설치 (한 번만)
npm install -g firebase-tools

# 로그인
firebase login

# 프로젝트 초기화 (한 번만)
firebase init firestore

# 인덱스 배포
firebase deploy --only firestore:indexes
```

## 🔧 DB_SCHEMA.md 업데이트 필요

현재 `DB_SCHEMA.md`에 명시된 인덱스와 실제 코드가 **불일치**합니다.

### 현재 DB_SCHEMA.md (잘못된 설정):
```javascript
{
  collection: 'interview_answers',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'interviewId', order: 'ASCENDING' },
    { fieldPath: 'timestamp', order: 'DESCENDING' }  // ❌ DESC
  ]
}
```

### 올바른 설정 (실제 쿼리에 맞춤):
```javascript
{
  collection: 'interview_answers',
  fields: [
    { fieldPath: 'userId', order: 'ASCENDING' },
    { fieldPath: 'interviewId', order: 'ASCENDING' },
    { fieldPath: 'timestamp', order: 'ASCENDING' }  // ✅ ASC
  ]
}
```

**이유:**
- 실제 코드에서 `orderBy('timestamp', 'asc')`를 사용 중
- 인덱스도 `ASCENDING`으로 맞춰야 함

## 🚨 인덱스가 없을 때 발생하는 문제

### 증상:
1. **결과 페이지가 로딩되지 않음**
   - `interview_answers` 데이터가 화면에 표시되지 않음
   - 콘솔에 "The query requires an index" 에러

2. **히스토리 페이지가 비어있음**
   - 과거 면접 기록이 나타나지 않음

3. **Firestore 권한 에러로 오인**
   - 실제로는 인덱스 문제인데 권한 문제로 착각할 수 있음

### 콘솔 에러 예시:
```javascript
FirebaseError: The query requires an index. 
You can create it here: https://console.firebase.google.com/v1/r/project/ai-service2-1/firestore/indexes?create_composite=Clt...
```

## 📊 추가 필요한 인덱스 (선택사항)

### 1. 히스토리 페이지용 (모든 면접 조회)

만약 사용자의 모든 면접 기록을 최신순으로 조회하는 기능이 있다면:

```javascript
// 쿼리 예시
query(
  collection(db, 'interview_answers'),
  where('userId', '==', user.uid),
  orderBy('timestamp', 'desc'),
  limit(50)
);
```

**필요한 인덱스:**
```
컬렉션: interview_answers
필드:
  - userId: ASCENDING
  - timestamp: DESCENDING
```

### 2. 특정 질문 조회용 (디버깅용)

```javascript
// 쿼리 예시
query(
  collection(db, 'interview_answers'),
  where('userId', '==', user.uid),
  where('questionId', '==', 'q1')
);
```

**필요한 인덱스:**
```
컬렉션: interview_answers
필드:
  - userId: ASCENDING
  - questionId: ASCENDING
```

## 🎯 인덱스 생성 우선순위

### 🔴 최우선 (필수):
```
userId (ASC) + interviewId (ASC) + timestamp (ASC)
```
→ 결과 페이지가 작동하지 않으면 이 인덱스가 필요합니다.

### 🟡 선택사항:
- 히스토리 페이지: `userId + timestamp DESC`
- 질문별 조회: `userId + questionId`

## 🔍 인덱스 생성 확인 방법

### 1. Firebase Console에서 확인
1. Firestore Database → 인덱스 → 복합 탭
2. `interview_answers` 컬렉션 인덱스 확인
3. 상태: **🟢 사용 설정됨** 확인

### 2. 실제 애플리케이션에서 테스트
```javascript
// 결과 페이지로 이동
// 브라우저 콘솔 확인
// ✅ 정상: "총 5개의 답변 데이터 로드됨"
// ❌ 에러: "The query requires an index"
```

### 3. 개발자 도구 네트워크 탭
- Firestore 요청이 `200 OK`로 성공하는지 확인
- `permission-denied` 에러가 없는지 확인

## 📋 체크리스트

면접 시스템이 정상 작동하려면 다음을 확인하세요:

- [ ] **인덱스 생성 완료**
  - [ ] Firebase Console → Firestore → 인덱스 탭
  - [ ] `interview_answers` 복합 인덱스 존재
  - [ ] 상태: 🟢 사용 설정됨
  
- [ ] **필드 구성 확인**
  - [ ] userId: ASCENDING ✅
  - [ ] interviewId: ASCENDING ✅
  - [ ] timestamp: ASCENDING ✅
  
- [ ] **DB_SCHEMA.md 업데이트**
  - [ ] timestamp 정렬 방향을 `ASCENDING`으로 수정
  
- [ ] **실제 테스트**
  - [ ] 면접 진행 후 결과 페이지 접속
  - [ ] 답변 데이터가 화면에 표시됨
  - [ ] 콘솔 에러 없음

## 🎉 완료 후 기대 효과

### Before (인덱스 없음):
- ❌ 결과 페이지 로딩 실패
- ❌ "The query requires an index" 에러
- ❌ 답변 데이터 표시 안 됨

### After (인덱스 생성):
- ✅ 결과 페이지 즉시 로딩
- ✅ 실시간 피드백 업데이트 (`onSnapshot` 작동)
- ✅ 답변 데이터 시간순 정렬

## 🆘 문제 해결

### Q1: 인덱스를 생성했는데도 에러가 발생합니다
**A:** 인덱스 생성 후 5-10분 정도 기다려주세요. 대규모 컬렉션의 경우 더 오래 걸릴 수 있습니다.

### Q2: 여러 개의 인덱스가 필요한가요?
**A:** 현재는 **하나의 인덱스**만 있으면 됩니다:
```
userId (ASC) + interviewId (ASC) + timestamp (ASC)
```

### Q3: 인덱스를 잘못 만들었어요
**A:** Firebase Console → Firestore → 인덱스에서 잘못된 인덱스를 삭제하고 다시 생성하세요.

### Q4: 인덱스 비용이 궁금합니다
**A:** Firestore 인덱스 자체는 무료입니다. 다만 쿼리 비용은 읽은 문서 수에 비례합니다.

### Q5: 개발/프로덕션 환경마다 인덱스를 따로 만들어야 하나요?
**A:** 네, 각 Firebase 프로젝트마다 별도로 인덱스를 생성해야 합니다.

## 📞 추가 정보

### Firebase 공식 문서:
- [Firestore 인덱스 개요](https://firebase.google.com/docs/firestore/query-data/indexing)
- [복합 인덱스 관리](https://firebase.google.com/docs/firestore/query-data/index-overview)

### 프로젝트 파일:
- `DB_SCHEMA.md`: 데이터베이스 스키마 문서 (업데이트 필요)
- `src/app/interview/result/[interviewId]/page.js`: 인덱스를 사용하는 쿼리 코드

---

이 가이드대로 인덱스를 생성하시면 면접 결과 페이지가 정상적으로 작동할 것입니다! 🚀

