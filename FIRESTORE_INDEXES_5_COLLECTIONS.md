# 🔍 Firestore 인덱스 가이드 (5대 컬렉션)

> **작성일**: 2025-11-12  
> **목적**: 5대 컬렉션 구조에 필요한 Firestore 복합 인덱스 정의  
> **인덱스 파일**: `firestore.indexes.5collections.json`

---

## 📋 목차

1. [개요](#개요)
2. [인덱스가 필요한 이유](#인덱스가-필요한-이유)
3. [컬렉션별 인덱스](#컬렉션별-인덱스)
4. [인덱스 배포 방법](#인덱스-배포-방법)
5. [쿼리 예시](#쿼리-예시)
6. [성능 최적화 팁](#성능-최적화-팁)

---

## 개요

### 5대 컬렉션 구조
```
1. users               - 유저 정보
2. job_postings        - 구인공고 정보
3. resume_feedbacks    - 자기소개서 피드백
4. interview_sessions  - 면접 질문/답변 세트
5. interview_evaluations - 면접 답변 피드백
```

### 인덱스 개수
- **총 14개** 복합 인덱스
- `users` 제외 (단일 문서 조회만 사용)

---

## 인덱스가 필요한 이유

### Firestore의 쿼리 제약

Firestore에서 다음과 같은 쿼리를 실행하려면 **복합 인덱스**가 필수입니다:

```javascript
// ❌ 인덱스 없이는 실행 불가
query(
  collection(db, 'interview_sessions'),
  where('userId', '==', 'user123'),
  where('status', '==', 'completed'),
  orderBy('createdAt', 'desc')
);
```

**에러 메시지:**
```
The query requires an index. You can create it here: 
https://console.firebase.google.com/...
```

### 인덱스의 역할
1. **복합 조건 쿼리**: 2개 이상의 필드를 동시에 필터링
2. **정렬 최적화**: 필터링 + 정렬 조합
3. **성능 향상**: O(log n) 검색 속도

---

## 컬렉션별 인덱스

### 1. users (유저 정보)

#### 인덱스: 없음

**이유:**
- Firebase Auth UID를 문서 ID로 사용
- 단일 문서 조회만 수행 (`doc(db, 'users', uid)`)
- 복합 쿼리 불필요

**쿼리 패턴:**
```javascript
// 단일 문서 조회 (인덱스 불필요)
const userDoc = await getDoc(doc(db, 'users', user.uid));
```

---

### 2. job_postings (구인공고 정보)

#### 인덱스 1: userId + createdAt

**목적:** 특정 사용자의 공고 목록 조회 (최신순)

**지원 쿼리:**
```javascript
// 사용자가 등록한 모든 공고 (최신순)
const q = query(
  collection(db, 'job_postings'),
  where('userId', '==', currentUserId),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 대시보드: 내가 등록한 공고 목록
- 공고 관리 페이지

---

#### 인덱스 2: status + createdAt

**목적:** 공고 상태별 조회 (관리자용)

**지원 쿼리:**
```javascript
// 활성화된 모든 공고
const q = query(
  collection(db, 'job_postings'),
  where('status', '==', 'active'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 관리자 대시보드: 전체 공고 현황
- 통계 페이지

---

#### 인덱스 3: userId + status + createdAt

**목적:** 사용자별 공고 상태 필터링

**지원 쿼리:**
```javascript
// 내가 등록한 활성 공고만
const q = query(
  collection(db, 'job_postings'),
  where('userId', '==', currentUserId),
  where('status', '==', 'active'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 공고 관리: "진행 중인 공고만 보기"
- 필터링 기능

---

### 3. resume_feedbacks (자기소개서 피드백)

#### 인덱스 4: userId + createdAt

**목적:** 사용자의 자소서 피드백 히스토리

**지원 쿼리:**
```javascript
// 내가 받은 모든 자소서 피드백
const q = query(
  collection(db, 'resume_feedbacks'),
  where('userId', '==', currentUserId),
  orderBy('createdAt', 'desc'),
  limit(20)
);
```

**사용 사례:**
- 히스토리 페이지: 자소서 피드백 목록
- 대시보드: 최근 피드백 3개

---

#### 인덱스 5: jobPostingId + createdAt

**목적:** 특정 공고에 대한 자소서 피드백 조회

**지원 쿼리:**
```javascript
// 특정 공고에 대한 자소서들
const q = query(
  collection(db, 'resume_feedbacks'),
  where('jobPostingId', '==', 'job_abc123'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 공고 상세 페이지: "이 공고로 작성한 자소서들"
- 연관 피드백 조회

---

#### 인덱스 6: userId + jobPostingId + createdAt

**목적:** 특정 사용자가 특정 공고에 대해 작성한 자소서들

**지원 쿼리:**
```javascript
// 내가 이 공고에 대해 작성한 자소서들
const q = query(
  collection(db, 'resume_feedbacks'),
  where('userId', '==', currentUserId),
  where('jobPostingId', '==', 'job_abc123'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- "이 공고에 대한 내 자소서 히스토리"
- 버전 관리

---

### 4. interview_sessions (면접 질문/답변 세트)

#### 인덱스 7: userId + createdAt

**목적:** 사용자의 면접 히스토리 (전체)

**지원 쿼리:**
```javascript
// 내가 진행한 모든 면접
const q = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', currentUserId),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- **히스토리 페이지 (핵심!)**
- 대시보드: 면접 횟수 통계

---

#### 인덱스 8: userId + status + createdAt

**목적:** 사용자의 면접 상태별 필터링

**지원 쿼리:**
```javascript
// 완료된 면접만
const q = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', currentUserId),
  where('status', '==', 'completed'),
  orderBy('createdAt', 'desc')
);

// 진행 중인 면접만
const q2 = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', currentUserId),
  where('status', '==', 'in_progress'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 히스토리: "완료된 면접만 보기"
- 미완료 면접 복구

---

#### 인덱스 9: status + createdAt

**목적:** 전체 면접 상태별 조회 (관리자용)

**지원 쿼리:**
```javascript
// 모든 사용자의 완료된 면접
const q = query(
  collection(db, 'interview_sessions'),
  where('status', '==', 'completed'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 관리자 대시보드
- 시스템 통계

---

#### 인덱스 10: jobPostingId + createdAt

**목적:** 특정 공고에 대한 면접 세션들

**지원 쿼리:**
```javascript
// 이 공고로 진행된 면접들
const q = query(
  collection(db, 'interview_sessions'),
  where('jobPostingId', '==', 'job_abc123'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 공고 분석: "이 공고로 몇 번 면접했는지"
- 연관 데이터 조회

---

#### 인덱스 11: userId + jobPostingId + createdAt

**목적:** 특정 사용자가 특정 공고에 대해 진행한 면접들

**지원 쿼리:**
```javascript
// 내가 이 공고로 진행한 면접들
const q = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', currentUserId),
  where('jobPostingId', '==', 'job_abc123'),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- "이 공고로 몇 번 면접 연습했는지"
- 공고별 면접 히스토리

---

### 5. interview_evaluations (면접 답변 피드백)

#### 인덱스 12: interviewId + createdAt

**목적:** 특정 면접 세션의 평가 조회 (1:1 관계)

**지원 쿼리:**
```javascript
// 특정 면접의 평가 가져오기
const q = query(
  collection(db, 'interview_evaluations'),
  where('interviewId', '==', 'interview_20241112_001'),
  orderBy('createdAt', 'desc'),
  limit(1)
);
```

**사용 사례:**
- **결과 페이지: 면접 평가 로드 (핵심!)**
- 1:1 관계 유지

---

#### 인덱스 13: userId + createdAt

**목적:** 사용자의 모든 평가 조회

**지원 쿼리:**
```javascript
// 내가 받은 모든 면접 평가
const q = query(
  collection(db, 'interview_evaluations'),
  where('userId', '==', currentUserId),
  orderBy('createdAt', 'desc')
);
```

**사용 사례:**
- 평가 히스토리
- 피드백 분석

---

#### 인덱스 14: userId + generatedAt

**목적:** 평가 생성 시각 기준 정렬

**지원 쿼리:**
```javascript
// 최근 생성된 평가들
const q = query(
  collection(db, 'interview_evaluations'),
  where('userId', '==', currentUserId),
  orderBy('generatedAt', 'desc')
);
```

**사용 사례:**
- "최근 피드백 받은 순"
- createdAt vs generatedAt 구분

---

## 인덱스 배포 방법

### 방법 1: Firebase CLI (권장)

```bash
# 1. Firebase CLI 설치 (처음 1번만)
npm install -g firebase-tools

# 2. 로그인
firebase login

# 3. 프로젝트 초기화 (처음 1번만)
firebase init firestore

# 4. 인덱스 배포
firebase deploy --only firestore:indexes
```

**배포 파일:**
```bash
firestore.indexes.5collections.json
```

---

### 방법 2: Firebase Console (수동)

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택
3. **Firestore Database** → **인덱스** 탭
4. **복합 인덱스 추가**
5. 각 인덱스를 수동으로 입력

**주의:** 14개를 수동으로 추가하는 것은 번거로움 → CLI 사용 권장

---

### 방법 3: 자동 생성 링크

쿼리 실행 시 인덱스가 없으면 에러와 함께 **자동 생성 링크**가 제공됩니다:

```
The query requires an index. You can create it here:
https://console.firebase.google.com/v1/r/project/[PROJECT_ID]/firestore/indexes?create_composite=...
```

링크를 클릭하면 자동으로 인덱스 생성 페이지로 이동합니다.

---

## 쿼리 예시

### 예시 1: 히스토리 페이지 (면접 목록)

```javascript
'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';

export default function InterviewHistoryPage() {
  const [interviews, setInterviews] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    async function loadHistory() {
      // ✅ 인덱스 7번 사용: userId + createdAt
      const q = query(
        collection(db, 'interview_sessions'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setInterviews(data);
    }
    
    if (user) loadHistory();
  }, [user]);

  return (
    <div>
      {interviews.map(interview => (
        <InterviewCard key={interview.id} data={interview} />
      ))}
    </div>
  );
}
```

---

### 예시 2: 결과 페이지 (면접 평가 조회)

```javascript
'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/firebase/config';

export default function ResultPage({ interviewId }) {
  const [evaluation, setEvaluation] = useState(null);

  useEffect(() => {
    async function loadEvaluation() {
      // ✅ 인덱스 12번 사용: interviewId + createdAt
      const q = query(
        collection(db, 'interview_evaluations'),
        where('interviewId', '==', interviewId),
        orderBy('createdAt', 'desc'),
        limit(1)
      );
      
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        setEvaluation(snapshot.docs[0].data());
      }
    }
    
    loadEvaluation();
  }, [interviewId]);

  return (
    <div>
      {evaluation ? (
        <>
          <h2>종합 평가</h2>
          <p>{evaluation.overallReview}</p>
          
          {evaluation.questionEvaluations.map(qe => (
            <div key={qe.qId}>
              <h3>질문 {qe.qId}</h3>
              <p>{qe.feedback}</p>
            </div>
          ))}
        </>
      ) : (
        <p>평가를 불러오는 중...</p>
      )}
    </div>
  );
}
```

---

### 예시 3: 필터링 (완료된 면접만)

```javascript
// ✅ 인덱스 8번 사용: userId + status + createdAt
const q = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', user.uid),
  where('status', '==', 'completed'),
  orderBy('createdAt', 'desc')
);

const completedInterviews = await getDocs(q);
```

---

### 예시 4: 공고별 자소서 조회

```javascript
// ✅ 인덱스 6번 사용: userId + jobPostingId + createdAt
const q = query(
  collection(db, 'resume_feedbacks'),
  where('userId', '==', user.uid),
  where('jobPostingId', '==', selectedJobId),
  orderBy('createdAt', 'desc')
);

const resumes = await getDocs(q);
```

---

## 성능 최적화 팁

### 1. limit() 사용

**권장:**
```javascript
// 최신 10개만 조회
const q = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', user.uid),
  orderBy('createdAt', 'desc'),
  limit(10)  // ✅
);
```

**비권장:**
```javascript
// 모든 데이터 조회 후 클라이언트에서 필터링
const q = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', user.uid),
  orderBy('createdAt', 'desc')
);
const all = await getDocs(q);
const first10 = all.docs.slice(0, 10);  // ❌ 비효율적
```

---

### 2. 페이지네이션

```javascript
// 첫 페이지
const firstQuery = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', user.uid),
  orderBy('createdAt', 'desc'),
  limit(10)
);

const firstPage = await getDocs(firstQuery);
const lastDoc = firstPage.docs[firstPage.docs.length - 1];

// 다음 페이지
const nextQuery = query(
  collection(db, 'interview_sessions'),
  where('userId', '==', user.uid),
  orderBy('createdAt', 'desc'),
  startAfter(lastDoc),  // ✅ 커서 기반 페이지네이션
  limit(10)
);

const nextPage = await getDocs(nextQuery);
```

---

### 3. 인덱스 용량 모니터링

Firebase Console에서 인덱스 크기 확인:
- **Firestore Database** → **사용량** 탭
- 인덱스가 문서 크기보다 클 수 있음
- 불필요한 인덱스는 삭제

---

### 4. 쿼리 최적화

**나쁜 예:**
```javascript
// ❌ 3개의 독립 쿼리
const users = await getDocs(collection(db, 'users'));
const interviews = await getDocs(collection(db, 'interview_sessions'));
const evaluations = await getDocs(collection(db, 'interview_evaluations'));
// 클라이언트에서 조인
```

**좋은 예:**
```javascript
// ✅ 1개의 최적화된 쿼리
const interviews = await getDocs(query(
  collection(db, 'interview_sessions'),
  where('userId', '==', user.uid),
  orderBy('createdAt', 'desc'),
  limit(20)
));

// 필요할 때만 평가 조회
for (const interview of interviews.docs) {
  const evalQuery = query(
    collection(db, 'interview_evaluations'),
    where('interviewId', '==', interview.id),
    limit(1)
  );
  const evaluation = await getDocs(evalQuery);
}
```

---

## 인덱스 비용

### Firestore 요금제

| 항목 | 무료 (Spark) | 유료 (Blaze) |
|------|-------------|-------------|
| 문서 읽기 | 50,000/일 | $0.06 / 100,000 |
| 문서 쓰기 | 20,000/일 | $0.18 / 100,000 |
| 저장 용량 | 1 GB | $0.18 / GB |
| **인덱스 용량** | 1 GB 포함 | 저장 용량에 포함 |

**주의:**
- 인덱스는 저장 용량을 차지함
- 복합 인덱스는 문서당 추가 용량 소요
- 14개 인덱스 = 약 30-50% 추가 저장 용량

---

## 문제 해결

### 문제 1: "The query requires an index"

**해결:**
1. 에러 메시지의 링크 클릭 → 자동 생성
2. 또는 Firebase CLI로 배포:
```bash
firebase deploy --only firestore:indexes
```

---

### 문제 2: 인덱스 빌드 시간이 오래 걸림

**원인:** 기존 데이터가 많을 경우 인덱스 생성에 수 분~수 시간 소요

**확인:**
- Firebase Console → Firestore → 인덱스
- 상태: "빌드 중" → "사용 가능"

---

### 문제 3: 불필요한 인덱스

**해결:**
1. Firebase Console에서 사용하지 않는 인덱스 삭제
2. `firestore.indexes.5collections.json`에서 제거 후 재배포

---

## 체크리스트

배포 전 확인 사항:

- [ ] `firestore.indexes.5collections.json` 파일 존재
- [ ] Firebase CLI 설치 및 로그인 완료
- [ ] 프로젝트 ID 확인
- [ ] 테스트 환경에서 먼저 배포
- [ ] 인덱스 빌드 완료 확인 (Console)
- [ ] 각 쿼리 테스트 실행
- [ ] 성능 모니터링 설정

---

## 참고 자료

- [Firestore 인덱스 문서](https://firebase.google.com/docs/firestore/query-data/indexing)
- [복합 인덱스 가이드](https://firebase.google.com/docs/firestore/query-data/index-overview#composite_indexes)
- [인덱스 관리](https://firebase.google.com/docs/firestore/query-data/index-management)

---

**작성자**: AI Assistant  
**마지막 업데이트**: 2025-11-12

