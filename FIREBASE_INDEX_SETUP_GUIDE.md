# Firebase 인덱스 설정 가이드

**작성일**: 2025-11-12  
**중요도**: 🔴 필수 (인덱스 없으면 앱이 작동하지 않음)

---

## ⚠️ 왜 인덱스가 필요한가?

### 문제 상황
```javascript
// 히스토리 페이지에서 실행하는 쿼리
const q = query(
  collection(db, 'interview_results'),
  where('userId', '==', user.uid),      // 필터링
  orderBy('createdAt', 'desc')          // 정렬
);

const snapshot = await getDocs(q);
```

### 에러 발생
```
❌ FirebaseError: The query requires an index.
You can create it here: https://console.firebase.google.com/...
```

### 원인
Firestore는 **where + orderBy 복합 쿼리**에 대해 **복합 인덱스(Composite Index)**를 요구합니다.

---

## 🚀 인덱스 설정 방법

### ✅ 방법 1: Firebase CLI 사용 (권장)

**장점**: 코드로 관리 가능, 버전 관리 용이, 자동화 가능

#### 1단계: Firebase CLI 설치 확인

```bash
# Firebase CLI 설치 확인
firebase --version

# 설치 안 되어 있다면
npm install -g firebase-tools
```

#### 2단계: 로그인

```bash
firebase login
```

브라우저가 열리면 Google 계정으로 로그인합니다.

#### 3단계: 프로젝트 초기화 (처음만)

```bash
# 프로젝트 루트에서 실행
firebase init firestore
```

다음 옵션 선택:
- **Firestore Rules**: Yes (또는 이미 있으면 No)
- **Firestore Indexes**: Yes (또는 이미 있으면 No)
- **Use existing project**: 본인의 Firebase 프로젝트 선택

이미 `firestore.indexes.json` 파일이 있으면 이 단계는 건너뛰어도 됩니다.

#### 4단계: 인덱스 파일 확인

프로젝트 루트에 `firestore.indexes.json` 파일이 있는지 확인:

```json
{
  "indexes": [
    {
      "collectionGroup": "interview_results",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "resume_feedbacks",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    }
  ]
}
```

#### 5단계: 인덱스 배포 🚀

```bash
# 인덱스만 배포
firebase deploy --only firestore:indexes
```

성공 메시지:
```
✔ Deploy complete!

Project Console: https://console.firebase.google.com/project/your-project/overview
```

#### 6단계: 인덱스 생성 확인

Firebase Console → Firestore Database → 인덱스 탭으로 이동하여 확인합니다.

- **상태**: "Building..." → 몇 분 후 → "Enabled" ✅

---

### ✅ 방법 2: Firebase Console에서 수동 생성

**장점**: GUI로 직관적, CLI 없이 가능

#### 1단계: Firebase Console 접속

[Firebase Console](https://console.firebase.google.com/) → 본인의 프로젝트 선택

#### 2단계: Firestore Database로 이동

좌측 메뉴 → **Firestore Database** → 상단 탭에서 **인덱스(Indexes)** 클릭

#### 3단계: 복합 인덱스 추가

**"복합 인덱스 추가(Add Composite Index)"** 버튼 클릭

#### 4단계: 인덱스 1 생성 - interview_results

| 설정 항목 | 값 |
|----------|-----|
| **컬렉션 ID** | `interview_results` |
| **필드 1** | `userId` (Ascending) |
| **필드 2** | `createdAt` (Descending) |
| **Query scope** | Collection |

**"만들기(Create)"** 버튼 클릭

#### 5단계: 인덱스 2 생성 - resume_feedbacks

다시 **"복합 인덱스 추가"** 버튼 클릭

| 설정 항목 | 값 |
|----------|-----|
| **컬렉션 ID** | `resume_feedbacks` |
| **필드 1** | `userId` (Ascending) |
| **필드 2** | `createdAt` (Descending) |
| **Query scope** | Collection |

**"만들기"** 버튼 클릭

#### 6단계: 빌드 대기

인덱스 상태가 **"Building..."**에서 **"Enabled"**로 변경될 때까지 기다립니다.

- **소요 시간**: 데이터 양에 따라 수 초 ~ 수 분
- **빈 데이터베이스**: 즉시 완료

---

## 📊 필요한 인덱스 목록

### 현재 프로젝트에 필요한 인덱스

| 컬렉션 | 필드 1 | 필드 2 | 사용 위치 |
|--------|--------|--------|----------|
| `interview_results` | userId (ASC) | createdAt (DESC) | 히스토리 페이지 |
| `resume_feedbacks` | userId (ASC) | createdAt (DESC) | 히스토리 페이지 |

### 추가로 필요할 수 있는 인덱스 (3개 컬렉션 구조 사용 시)

| 컬렉션 | 필드 1 | 필드 2 | 필드 3 | 사용 위치 |
|--------|--------|--------|--------|----------|
| `answer_evaluations` | userId (ASC) | interviewId (ASC) | questionIndex (ASC) | 결과 페이지 |
| `interview_reports` | userId (ASC) | createdAt (DESC) | - | 히스토리 페이지 |

---

## 🧪 인덱스 테스트

### 1. 인덱스 확인

Firebase Console → Firestore Database → 인덱스 탭

상태가 **"Enabled"** ✅ 인지 확인

### 2. 앱에서 테스트

```javascript
// 히스토리 페이지 접속
// 브라우저 콘솔에서 에러 확인

// ✅ 성공: 데이터가 정상적으로 로드됨
// ❌ 실패: "The query requires an index" 에러
```

### 3. 에러 발생 시

에러 메시지에 포함된 링크를 클릭하면 **자동으로 인덱스 생성 페이지**로 이동합니다:

```
FirebaseError: The query requires an index. 
You can create it here: https://console.firebase.google.com/v1/r/project/YOUR_PROJECT/firestore/indexes?create_composite=...
```

이 링크를 클릭하면 → **인덱스가 자동으로 미리 설정됨** → "만들기" 버튼만 누르면 됩니다!

---

## 🔧 문제 해결

### Q1: "Building..." 상태가 너무 오래 걸려요

**A**: 데이터가 많으면 시간이 걸립니다.
- **빈 DB**: 즉시 완료
- **데이터 있음**: 수 분 ~ 수십 분
- **대량 데이터**: 1시간 이상

**해결**: 인덱스 빌드 중에도 앱은 사용 가능하지만, 해당 쿼리는 느리거나 실패할 수 있습니다.

### Q2: 인덱스를 만들었는데도 에러가 나요

**확인사항**:
1. 인덱스 상태가 **"Enabled"**인가? (Building 중이면 안 됨)
2. **컬렉션 이름**이 정확한가? (대소문자 구분)
3. **필드 이름**이 정확한가? (`userId`, `createdAt`)
4. **정렬 순서**가 맞나? (Ascending/Descending)

### Q3: CLI로 배포했는데 적용이 안 돼요

```bash
# 현재 배포된 인덱스 확인
firebase firestore:indexes

# 강제 재배포
firebase deploy --only firestore:indexes --force
```

### Q4: 인덱스 파일이 없어요

```bash
# Firebase 프로젝트 초기화
firebase init firestore

# 인덱스 파일만 초기화
firebase init firestore:indexes
```

그러면 `firestore.indexes.json` 파일이 생성됩니다.

---

## 📝 체크리스트

### 인덱스 설정 완료 확인

- [ ] Firebase CLI 설치 완료
- [ ] `firebase login` 완료
- [ ] `firestore.indexes.json` 파일 존재
- [ ] `firebase deploy --only firestore:indexes` 실행 완료
- [ ] Firebase Console에서 인덱스 "Enabled" 확인
- [ ] 히스토리 페이지 접속 → 데이터 정상 로드 확인

---

## 🎯 권장 작업 순서

1. **먼저 인덱스 배포** (앱 실행 전)
   ```bash
   firebase deploy --only firestore:indexes
   ```

2. **인덱스 빌드 대기** (몇 분)

3. **앱 테스트**
   - 히스토리 페이지 접속
   - 에러 없이 로드되는지 확인

4. **추가 개발 진행**

---

## 💡 팁

### 개발 중 인덱스 관리

1. **자동 인덱스 감지**
   - 앱을 실행하다가 "The query requires an index" 에러가 나면
   - 에러 메시지의 링크를 클릭
   - 자동으로 필요한 인덱스가 설정됨
   - "만들기" 버튼만 클릭

2. **인덱스 내보내기**
   ```bash
   # 현재 인덱스를 파일로 저장
   firebase firestore:indexes > firestore.indexes.json
   ```

3. **버전 관리**
   - `firestore.indexes.json` 파일을 Git에 커밋
   - 팀원들이 동일한 인덱스 사용 가능

---

## 🔗 참고 자료

- [Firestore 인덱스 공식 문서](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Firebase CLI 참조](https://firebase.google.com/docs/cli)
- [복합 쿼리 가이드](https://firebase.google.com/docs/firestore/query-data/queries)

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant  
**버전**: 1.0.0

