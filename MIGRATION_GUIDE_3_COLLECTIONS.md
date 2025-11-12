# 3개 독립 컬렉션 마이그레이션 가이드

**작성일**: 2025-11-12  
**목적**: 단일 `feedbacks` 컬렉션 → 3개 독립 컬렉션으로 분리

---

## 📊 변경 사항 요약

### 이전 구조

```
feedbacks/          (단일 컬렉션, type 필드로 구분)
├─ doc1: { type: 'resume', resumeText, structuredFeedback, ... }
├─ doc2: { type: 'interview', interviewId, overallFeedback, ... }
└─ ...

interview_answers/  (개별 답변)
├─ doc1: { interviewId, questionId, transcript, audioURL, ... }
└─ ...
```

### 새 구조

```
resume_feedbacks/        (이력서 피드백 전용)
├─ doc1: { resumeId, resumeText, structuredFeedback, ... }
└─ ...

interview_reports/       (면접 종합 피드백 전용)
├─ doc1: { interviewId, overallFeedback, ... }
└─ ...

answer_evaluations/      (개별 답변 전용)
├─ doc1: { interviewId, questionId, questionIndex, transcript, audioURL, ... }
└─ ...
```

---

## ✅ 완료된 수정 사항

### 1. 백엔드 (저장 로직)

#### ✅ `src/app/interview/page.js`
- `handleInterviewComplete` 함수
- **변경**: `feedbacks` → `interview_reports` 컬렉션에 저장
- **추가 필드**: `overallFeedback: null`, `questionCount: 5`, `feedbackGeneratedAt: null`

#### ✅ `src/app/api/interview/generate-overall-feedback/route.js`
- **조회**: `interview_answers` → `answer_evaluations`에서 개별 답변 조회
- **업데이트**: `feedbacks` → `interview_reports`에 종합 피드백 업데이트
- `where('type', '==', 'interview')` 조건 제거 (더 이상 필요 없음)

#### ✅ `src/app/components/InterviewUI.jsx`
- `saveAnswerInBackground` 함수
- **변경**: `interview_answers` → `answer_evaluations` 컬렉션에 저장
- **추가 필드**: `questionIndex: questionCount + 1`, `audioPath: '...'`

### 2. 프론트엔드 (조회 로직)

#### ✅ `src/app/interview/result/[interviewId]/page.js`
- **개별 답변 조회**: `interview_answers` → `answer_evaluations`
- **정렬 기준**: `orderBy('timestamp', 'asc')` → `orderBy('questionIndex', 'asc')`
- **종합 피드백 조회**: `feedbacks` → `interview_reports`
- `where('type', '==', 'interview')` 조건 제거

---

## ⚠️ 미완료 작업 (추가 수정 필요)

### 1. 히스토리 페이지 (`src/app/history/page.js`)

**현재 상태**: `feedbacks` 컬렉션을 조회하여 모든 피드백 표시

**필요한 수정**:
1. 이력서 피드백과 면접 피드백을 **각각** 조회
2. 두 결과를 합쳐서 표시

#### 수정 코드 (권장)

```javascript
// src/app/history/page.js
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import HistoryList from '@/app/components/HistoryList';
import Card from '@/app/components/Card';

export default function HistoryPage() {
  const { user } = useAuth();
  const [resumeFeedbacks, setResumeFeedbacks] = useState([]);
  const [interviewReports, setInterviewReports] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      try {
        console.log('========================================');
        console.log('[히스토리 페이지] 🔍 3개 컬렉션 분리 적용');
        console.log('[히스토리 페이지] - userId:', user.uid);
        
        // 1. 이력서 피드백 조회
        console.log('[히스토리 페이지] 📄 resume_feedbacks 컬렉션 조회 중...');
        const resumeRef = collection(db, 'resume_feedbacks');
        const resumeQuery = query(
          resumeRef,
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const resumeSnapshot = await getDocs(resumeQuery);
        const resumeData = resumeSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'resume',
          ...doc.data()
        }));
        console.log('[히스토리 페이지] ✅ resume_feedbacks:', resumeData.length, '개');
        
        // 2. 면접 종합 피드백 조회
        console.log('[히스토리 페이지] 🎤 interview_reports 컬렉션 조회 중...');
        const reportRef = collection(db, 'interview_reports');
        const reportQuery = query(
          reportRef,
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const reportSnapshot = await getDocs(reportQuery);
        const reportData = reportSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'interview',
          ...doc.data()
        }));
        console.log('[히스토리 페이지] ✅ interview_reports:', reportData.length, '개');
        
        setResumeFeedbacks(resumeData);
        setInterviewReports(reportData);
        
        console.log('[히스토리 페이지] ✅ 전체 데이터 로드 완료');
        console.log('========================================');
      } catch (error) {
        console.error('[히스토리 페이지] ❌ 에러:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  if (loading) {
    return <div>로딩 중...</div>;
  }

  // 두 배열을 합치고 날짜순 정렬
  const allFeedbacks = [
    ...resumeFeedbacks,
    ...interviewReports
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">피드백 히스토리</h1>
      
      {/* 탭 UI (선택) */}
      <div className="mb-6">
        <button className="mr-4 px-4 py-2 bg-blue-500 text-white rounded">
          전체 ({allFeedbacks.length})
        </button>
        <button className="mr-4 px-4 py-2 bg-gray-200 rounded">
          이력서 ({resumeFeedbacks.length})
        </button>
        <button className="px-4 py-2 bg-gray-200 rounded">
          면접 ({interviewReports.length})
        </button>
      </div>
      
      {/* 통합 리스트 */}
      <HistoryList feedbacks={allFeedbacks} type="all" />
      
      {/* 또는 분리 표시 */}
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold mb-4">이력서 피드백</h2>
          <HistoryList feedbacks={resumeFeedbacks} type="resume" />
        </div>
        
        <div>
          <h2 className="text-2xl font-bold mb-4">면접 기록</h2>
          <HistoryList feedbacks={interviewReports} type="interview" />
        </div>
      </div>
    </div>
  );
}
```

### 2. 이력서 피드백 저장 로직 (`src/app/api/interview/evaluate-delivery/route.js` 등)

**현재**: 이력서 분석 결과가 어디에 저장되는지 확인 필요

**필요한 수정**: 이력서 분석 결과를 `resume_feedbacks` 컬렉션에 저장

#### 수정 예시

```javascript
// 이력서 분석 완료 후
const resumeFeedbackData = {
  userId: userId,
  resumeId: `resume_${Date.now()}`, // 고유 ID 생성
  resumeText: originalResumeText,
  inputMode: 'text', // or 'voice'
  jobKeywords: extractedKeywords,
  structuredFeedback: {
    oneSentenceSummary: '...',
    actionableFeedback: [...],
    fullAnalysis: '...'
  },
  userRating: null,
  tonePreference: userPreference,
  createdAt: new Date().toISOString(),
  timestamp: new Date()
};

// feedbacks가 아닌 resume_feedbacks에 저장
await addDoc(collection(db, 'resume_feedbacks'), resumeFeedbackData);
```

### 3. Firestore 보안 규칙 업데이트

**파일**: Firebase Console → Firestore Database → Rules

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // resume_feedbacks: 본인만 읽기/쓰기 가능
    match /resume_feedbacks/{feedbackId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
    
    // interview_reports: 본인만 읽기/쓰기 가능
    match /interview_reports/{reportId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
    
    // answer_evaluations: 본인만 읽기/쓰기 가능
    match /answer_evaluations/{answerId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
    
    // 기존 컬렉션도 유지 (마이그레이션 기간)
    match /feedbacks/{feedbackId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
    
    match /interview_answers/{answerId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## 🚀 Firestore 인덱스 배포

### 방법 1: Firebase CLI 사용 (권장)

```bash
# 1. Firebase CLI 로그인
firebase login

# 2. 프로젝트 초기화 (기존 프로젝트라면 건너뛰기)
firebase init firestore

# 3. 인덱스 파일 배포
firebase deploy --only firestore:indexes
```

### 방법 2: Firebase Console에서 수동 생성

1. [Firebase Console](https://console.firebase.google.com/) 접속
2. 프로젝트 선택
3. Firestore Database → 인덱스 탭
4. "복합 인덱스 추가" 클릭

#### 인덱스 1: `answer_evaluations`

- 컬렉션 ID: `answer_evaluations`
- 필드 1: `userId` (오름차순)
- 필드 2: `interviewId` (오름차순)
- 필드 3: `questionIndex` (오름차순)

#### 인덱스 2: `interview_reports`

- 컬렉션 ID: `interview_reports`
- 필드 1: `userId` (오름차순)
- 필드 2: `createdAt` (내림차순)

#### 인덱스 3: `resume_feedbacks`

- 컬렉션 ID: `resume_feedbacks`
- 필드 1: `userId` (오름차순)
- 필드 2: `createdAt` (내림차순)

---

## 📝 테스트 체크리스트

### 면접 시스템 테스트

- [ ] 면접 시작 → `interview_reports` 문서 생성 확인
- [ ] 답변 녹음 → `answer_evaluations` 문서 생성 확인 (5개)
- [ ] 면접 완료 → 종합 피드백 API 호출 확인
- [ ] 결과 페이지 → `answer_evaluations` 조회 확인
- [ ] 결과 페이지 → `interview_reports` 조회 확인
- [ ] 결과 페이지 → 오디오 재생 확인
- [ ] 결과 페이지 → 종합 피드백 표시 확인

### 히스토리 페이지 테스트

- [ ] 이력서 피드백 표시 확인
- [ ] 면접 기록 표시 확인
- [ ] 날짜순 정렬 확인
- [ ] 상세 페이지 이동 확인

### 데이터 무결성 테스트

- [ ] `interviewId` 일치 확인 (`interview_reports` ↔ `answer_evaluations`)
- [ ] `questionIndex` 순서 확인 (1, 2, 3, 4, 5)
- [ ] 중복 데이터 없음 확인

---

## 🔄 기존 데이터 마이그레이션 (선택)

기존 `feedbacks` 컬렉션의 데이터를 새로운 구조로 이전하려면:

### 마이그레이션 스크립트

```javascript
// migrate-to-3-collections.js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrate() {
  console.log('🚀 마이그레이션 시작...');
  
  // 1. feedbacks의 이력서 피드백 이동
  const resumeQuery = await db.collection('feedbacks')
    .where('type', '==', 'resume')
    .get();
  
  console.log(`📄 이력서 피드백: ${resumeQuery.size}개`);
  
  for (const doc of resumeQuery.docs) {
    const data = doc.data();
    await db.collection('resume_feedbacks').add({
      userId: data.userId,
      resumeId: data.id || `resume_${Date.now()}`,
      resumeText: data.resumeText,
      inputMode: data.inputMode || 'text',
      jobKeywords: data.jobKeywords || {},
      structuredFeedback: data.structuredFeedback || {},
      userRating: data.userRating || null,
      tonePreference: data.tonePreference || '친근한',
      createdAt: data.createdAt,
      timestamp: data.timestamp || admin.firestore.Timestamp.now()
    });
  }
  
  // 2. feedbacks의 면접 종합 피드백 이동
  const interviewQuery = await db.collection('feedbacks')
    .where('type', '==', 'interview')
    .get();
  
  console.log(`🎤 면접 피드백: ${interviewQuery.size}개`);
  
  for (const doc of interviewQuery.docs) {
    const data = doc.data();
    await db.collection('interview_reports').add({
      userId: data.userId,
      interviewId: data.interviewId,
      resumeText: data.resumeText || '',
      jobKeywords: data.jobKeywords || {},
      tonePreference: data.tonePreference || '친근한',
      overallFeedback: data.overallFeedback || null,
      questionCount: 5,
      createdAt: data.createdAt,
      timestamp: data.timestamp || admin.firestore.Timestamp.now(),
      feedbackGeneratedAt: data.feedbackGeneratedAt || null,
      updatedAt: data.updatedAt || null
    });
  }
  
  // 3. interview_answers → answer_evaluations 이동
  const answersQuery = await db.collection('interview_answers').get();
  
  console.log(`💬 개별 답변: ${answersQuery.size}개`);
  
  for (const doc of answersQuery.docs) {
    const data = doc.data();
    await db.collection('answer_evaluations').add({
      userId: data.userId,
      interviewId: data.interviewId,
      questionId: data.questionId,
      questionIndex: parseInt(data.questionId.replace('q', '')) || 1,
      question: data.question,
      transcript: data.transcript,
      audioURL: data.audioURL || null,
      audioPath: data.audioPath || `recordings/${data.userId}/${data.interviewId}/${data.questionId}.webm`,
      feedback: null,
      duration: data.duration || 0,
      timestamp: data.timestamp || admin.firestore.Timestamp.now(),
      createdAt: data.createdAt
    });
  }
  
  console.log('✅ 마이그레이션 완료!');
  console.log('⚠️ 기존 컬렉션(feedbacks, interview_answers)은 백업 후 삭제 권장');
}

migrate().catch(console.error);
```

### 실행 방법

```bash
# 1. Firebase Admin SDK 설치
npm install firebase-admin

# 2. 서비스 계정 키 다운로드 (Firebase Console → 프로젝트 설정 → 서비스 계정)

# 3. 스크립트 실행
node migrate-to-3-collections.js

# 4. Firestore Console에서 데이터 확인

# 5. (선택) 기존 컬렉션 백업 후 삭제
```

---

## 📚 참고 자료

- [DB_SCHEMA_V2_3_COLLECTIONS.md](./DB_SCHEMA_V2_3_COLLECTIONS.md) - 새로운 DB 스키마
- [firestore.indexes.v2.json](./firestore.indexes.v2.json) - 인덱스 설정 파일
- [Firestore 복합 쿼리 문서](https://firebase.google.com/docs/firestore/query-data/queries)
- [Firestore 인덱스 관리](https://firebase.google.com/docs/firestore/query-data/indexing)

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant

