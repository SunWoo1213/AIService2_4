# 단일 문서 중심 구조 구현 가이드

**작성일**: 2025-11-12  
**목적**: interview_results 단일 문서 구조로 전환하는 상세 구현 가이드

---

## 🎯 구현 개요

### 목표
- 면접 데이터를 `interview_results` 컬렉션의 **하나의 문서**에 통합 저장
- 조회 시 **1번의 getDoc**으로 모든 데이터 획득
- 히스토리 페이지 성능 대폭 향상

### 변경 흐름
```
[기존]
면접 시작 → interview_reports 생성
각 답변 → answer_evaluations 추가 (5번)
면접 완료 → interview_reports 업데이트

[새로운 방식]
면접 시작 → interview_results 생성 (questions: [])
각 답변 → questions 배열에 추가 (5번)
면접 완료 → completedAt 업데이트
```

---

## 📝 구현 단계

---

## 1단계: InterviewUI 수정

### 파일: `src/app/components/InterviewUI.jsx`

#### 1-1. Import 추가

```javascript
import { 
  collection, 
  addDoc, 
  doc,
  setDoc,      // ← 추가
  updateDoc,   // ← 추가
  arrayUnion,  // ← 추가
  increment,   // ← 추가
  Timestamp, 
  query, 
  where, 
  getDocs 
} from 'firebase/firestore';
```

#### 1-2. 면접 시작 시 초기 문서 생성

**위치**: `useEffect` 또는 컴포넌트 마운트 시

```javascript
useEffect(() => {
  const initializeInterview = async () => {
    console.log('========================================');
    console.log('[면접 초기화] interview_results 문서 생성');
    console.log('[면접 초기화] - interviewId:', interviewId);
    console.log('[면접 초기화] - userId:', userId);
    console.log('========================================');
    
    try {
      await setDoc(doc(db, 'interview_results', interviewId), {
        interviewId: interviewId,
        userId: userId,
        
        // 메타데이터
        resumeText: resumeText || '',
        jobKeywords: jobKeywords || {},
        tonePreference: tonePreference || 'friendly',
        
        // 종합 피드백 (초기값 null)
        overallFeedback: null,
        
        // 질문 배열 (빈 배열로 시작)
        questions: [],
        
        // 통계
        totalQuestions: 5,
        completedQuestions: 0,
        totalDuration: 0,
        averageDuration: 0,
        
        // 타임스탬프
        createdAt: new Date().toISOString(),
        timestamp: Timestamp.now(),
        completedAt: null,
        feedbackGeneratedAt: null,
        updatedAt: null
      });
      
      console.log('[면접 초기화] ✅ interview_results 문서 생성 완료!');
    } catch (error) {
      console.error('[면접 초기화] ❌ 에러:', error);
    }
  };
  
  initializeInterview();
}, []); // 컴포넌트 마운트 시 1번만 실행
```

#### 1-3. 답변 저장 로직 수정

**기존 함수**: `saveAnswerInBackground`  
**변경**: `addDoc(answer_evaluations)` → `updateDoc(interview_results)`

```javascript
const saveAnswerInBackground = async (
  audioBlob,
  transcript,
  question,
  audioURL,
  duration
) => {
  try {
    console.log('========================================');
    console.log('[답변 저장] 🚀 단일 문서 업데이트 시작');
    console.log('[답변 저장] - interviewId:', interviewId);
    console.log('[답변 저장] - questionCount:', questionCount + 1);
    console.log('========================================');
    
    // ===== [단일 문서 구조] 질문 객체 생성 =====
    const questionData = {
      id: questionCount + 1,
      questionId: `q${questionCount + 1}`,
      question: question,
      answer: transcript, // STT 텍스트
      audioUrl: audioURL || null,
      audioPath: `recordings/${userId}/${interviewId}/q${questionCount + 1}_${Date.now()}.webm`,
      duration: duration,
      answeredAt: new Date().toISOString(),
      feedback: null // 개별 피드백은 사용 안함
    };
    
    console.log('[답변 저장] 📝 questions 배열에 추가할 데이터:', {
      id: questionData.id,
      questionId: questionData.questionId,
      answerLength: questionData.answer.length,
      audioUrl: !!questionData.audioUrl,
      duration: questionData.duration
    });
    
    // ===== [Firestore 업데이트] arrayUnion으로 배열에 추가 =====
    const docRef = doc(db, 'interview_results', interviewId);
    
    await updateDoc(docRef, {
      questions: arrayUnion(questionData),      // 배열에 추가
      completedQuestions: increment(1),         // 완료 수 +1
      totalDuration: increment(duration),       // 총 시간 누적
      updatedAt: new Date().toISOString()
    });
    
    console.log('========================================');
    console.log('[답변 저장] ✅✅✅ 업데이트 성공! ✅✅✅');
    console.log('[답변 저장] - 현재까지 완료:', questionCount + 1, '/ 5');
    console.log('[답변 저장] - 저장 경로: interview_results/' + interviewId);
    console.log('========================================');
    
  } catch (error) {
    console.error('========================================');
    console.error('[답변 저장] ❌❌❌ 에러 발생! ❌❌❌');
    console.error('[답변 저장] - 에러:', error);
    console.error('[답변 저장] - error.code:', error.code);
    console.error('[답변 저장] - error.message:', error.message);
    console.error('========================================');
  }
};
```

#### 1-4. 면접 완료 로직 수정

**위치**: `handleStopRecording` 함수 내 `MAX_QUESTIONS` 체크 부분

```javascript
// ===== [면접 완료] 모든 질문 종료 =====
if (nextQuestionCount >= MAX_QUESTIONS) {
  console.log('========================================');
  console.log('=== 면접 완료 ===');
  console.log('총', MAX_QUESTIONS, '개의 질문을 모두 완료했습니다.');
  console.log('========================================');
  
  try {
    // ===== [단일 문서 구조] completedAt 업데이트 =====
    const docRef = doc(db, 'interview_results', interviewId);
    
    await updateDoc(docRef, {
      completedAt: new Date().toISOString(),
      averageDuration: 0, // 클라이언트에서 계산하거나 Cloud Function에서 계산
      updatedAt: new Date().toISOString()
    });
    
    console.log('[면접 완료] ✅ interview_results 업데이트 완료');
    
    // ===== [종합 피드백 생성] 백그라운드 API 호출 =====
    console.log('[종합 피드백] 🚀 생성 API 호출');
    
    fetch('/api/interview/generate-overall-feedback-v2', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        interviewId: interviewId,
        userId: userId
      }),
    }).then(response => {
      if (!response.ok) {
        throw new Error(`종합 피드백 생성 실패: ${response.status}`);
      }
      return response.json();
    }).then(feedbackResult => {
      console.log('========================================');
      console.log('[종합 피드백] ✅✅✅ 생성 완료! ✅✅✅');
      console.log('[종합 피드백] - interviewId:', interviewId);
      console.log('========================================');
    }).catch(error => {
      console.error('========================================');
      console.error('[종합 피드백] ❌ 생성 실패');
      console.error('[종합 피드백] - 에러:', error.message);
      console.error('========================================');
    });
    
    // 결과 페이지로 즉시 이동
    if (onComplete) {
      onComplete(interviewId);
    }
    
  } catch (error) {
    console.error('[면접 완료] ❌ 에러:', error);
    // 에러가 발생해도 결과 페이지로 이동
    if (onComplete) {
      onComplete(interviewId);
    }
  }
}
```

---

## 2단계: 종합 피드백 API 수정

### 파일: `src/app/api/interview/generate-overall-feedback-v2/route.js` (새 파일)

```javascript
import { NextResponse } from 'next/server';
import { db } from '@/firebase/config';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import OpenAI from 'openai';

export const maxDuration = 300;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request) {
  console.log('========================================');
  console.log('[종합 피드백 API V2] 📥 요청 수신');
  console.log('========================================');

  try {
    const { interviewId, userId } = await request.json();

    if (!interviewId || !userId) {
      console.error('[종합 피드백 API V2] ❌ 필수 정보 누락');
      return NextResponse.json(
        { error: 'interviewId와 userId는 필수입니다.' },
        { status: 400 }
      );
    }

    console.log('[종합 피드백 API V2] - interviewId:', interviewId);
    console.log('[종합 피드백 API V2] - userId:', userId);

    // ===== [1단계] interview_results에서 데이터 조회 (1번만!) =====
    console.log('[종합 피드백 API V2] 🔍 1단계: 데이터 조회');
    console.log('[종합 피드백 API V2] - 컬렉션: interview_results');
    console.log('[종합 피드백 API V2] - 문서 ID:', interviewId);
    
    const docRef = doc(db, 'interview_results', interviewId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      console.error('[종합 피드백 API V2] ❌ 문서를 찾을 수 없음');
      return NextResponse.json(
        { error: '해당 면접 데이터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const interviewData = docSnap.data();
    
    if (!interviewData.questions || interviewData.questions.length === 0) {
      console.error('[종합 피드백 API V2] ❌ 질문 데이터 없음');
      return NextResponse.json(
        { error: '답변 데이터가 없습니다.' },
        { status: 400 }
      );
    }

    console.log('[종합 피드백 API V2] ✅ 데이터 조회 완료');
    console.log('[종합 피드백 API V2] - 질문 개수:', interviewData.questions.length);

    // ===== [2단계] LLM 프롬프트 구성 =====
    console.log('[종합 피드백 API V2] 📝 2단계: 프롬프트 구성');
    
    // questions 배열을 id 순으로 정렬
    const sortedQuestions = [...interviewData.questions].sort((a, b) => a.id - b.id);
    
    let userPrompt = "다음은 지원자의 전체 면접 답변 내역(1번부터 5번까지)입니다. 각 질문과 답변을 종합적으로 분석하여 전체적인 일관성, 강점, 약점, 그리고 구체적인 개선 방향을 포함한 종합 피드백을 제공해주세요.\n\n";

    sortedQuestions.forEach((q, index) => {
      userPrompt += `--- 질문 ${q.id} ---\n`;
      userPrompt += `질문: ${q.question}\n`;
      userPrompt += `답변: ${q.answer}\n\n`;
    });

    userPrompt += `
**종합 피드백 지시사항:**
1. **전체 일관성 (overallConsistency)**: 답변들 간의 일관성, 논리적 흐름, 지원자의 가치관이나 경험이 일관되게 드러나는지 평가합니다.
2. **전체 강점 (strengths)**: 모든 답변을 통틀어 드러나는 지원자의 주요 강점 2-3가지를 구체적인 근거와 함께 제시합니다.
3. **개선 필요 사항 (weaknesses)**: 모든 답변을 통틀어 드러나는 주요 약점 2-3가지를 구체적인 근거와 함께 제시합니다.
4. **구체적 개선 방향 (improvements)**: 약점을 보완하고 강점을 더욱 부각시킬 수 있는 2-3가지의 구체적이고 실용적인 개선 방안을 제시합니다.
5. **최종 종합 평가 (summary)**: 2-3문장으로 전체 면접에 대한 최종적인 종합 평가를 제공합니다.

**응답 형식 (JSON):**
{
  "overallConsistency": "전체적인 답변 일관성에 대한 평가",
  "strengths": "강점 텍스트",
  "weaknesses": "약점 텍스트",
  "improvements": "개선 방향 텍스트",
  "summary": "최종 종합 평가 텍스트"
}
`;

    console.log('[종합 피드백 API V2] ✅ 프롬프트 구성 완료');

    // ===== [3단계] LLM 호출 =====
    console.log('[종합 피드백 API V2] 🚀 3단계: LLM 호출');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are a senior technical interviewer. Provide comprehensive, critical, and constructive feedback based on the entire interview. Always respond with valid JSON only in Korean.'
        },
        {
          role: 'user',
          content: userPrompt
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000,
    });

    const feedbackText = completion.choices[0].message.content;
    const feedbackData = JSON.parse(feedbackText);

    console.log('[종합 피드백 API V2] ✅ LLM 응답 수신 및 파싱 완료');
    console.log('[종합 피드백 API V2] - 필드:', Object.keys(feedbackData).join(', '));

    // ===== [4단계] interview_results 문서 업데이트 =====
    console.log('[종합 피드백 API V2] 💾 4단계: 문서 업데이트');
    
    await updateDoc(docRef, {
      overallFeedback: feedbackData,
      feedbackGeneratedAt: Timestamp.now(),
      updatedAt: new Date().toISOString()
    });

    console.log('========================================');
    console.log('[종합 피드백 API V2] ✅✅✅ 성공! ✅✅✅');
    console.log('[종합 피드백 API V2] - interviewId:', interviewId);
    console.log('========================================');

    return NextResponse.json({
      success: true,
      interviewId: interviewId,
      message: '종합 피드백이 성공적으로 생성되었습니다.'
    });

  } catch (error) {
    console.error('========================================');
    console.error('[종합 피드백 API V2] ❌❌❌ 에러 발생! ❌❌❌');
    console.error('[종합 피드백 API V2] - 에러:', error);
    console.error('[종합 피드백 API V2] - error.message:', error.message);
    console.error('========================================');

    return NextResponse.json(
      { error: '종합 피드백 생성 중 서버 오류가 발생했습니다.', details: error.message },
      { status: 500 }
    );
  }
}
```

---

## 3단계: 결과 페이지 수정

### 파일: `src/app/interview/result/[interviewId]/page.js`

**핵심 변경**: 여러 컬렉션 조회 → 단일 문서 조회

```javascript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { db } from '@/firebase/config';
import { doc, onSnapshot } from 'firebase/firestore';
import Card from '@/app/components/Card';
import Button from '@/app/components/ui/Button';

export default function InterviewResultPage() {
  const { user, authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const interviewId = params.interviewId;

  const [interviewData, setInterviewData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }

    console.log('========================================');
    console.log('[결과 페이지 V2] 🔍 단일 문서 조회 시작');
    console.log('[결과 페이지 V2] - interviewId:', interviewId);
    console.log('[결과 페이지 V2] - userId:', user.uid);
    console.log('[결과 페이지 V2] - 컬렉션: interview_results');
    console.log('========================================');

    // ===== [단일 문서 구조] 1번의 onSnapshot으로 모든 데이터 구독 =====
    const docRef = doc(db, 'interview_results', interviewId);

    const unsubscribe = onSnapshot(
      docRef,
      (docSnapshot) => {
        console.log('========================================');
        console.log('[결과 페이지 V2] 📥 스냅샷 수신');
        console.log('[결과 페이지 V2] - 문서 존재:', docSnapshot.exists());
        console.log('========================================');

        if (!docSnapshot.exists()) {
          console.error('[결과 페이지 V2] ❌ 문서를 찾을 수 없음');
          setError('면접 데이터를 찾을 수 없습니다.');
          setLoading(false);
          return;
        }

        const data = docSnapshot.data();

        // 권한 확인
        if (data.userId !== user.uid) {
          console.error('[결과 페이지 V2] ❌ 권한 없음');
          setError('이 면접 결과에 접근할 권한이 없습니다.');
          setLoading(false);
          return;
        }

        console.log('[결과 페이지 V2] ✅ 데이터 로드 완료');
        console.log('[결과 페이지 V2] - 질문 개수:', data.questions?.length || 0);
        console.log('[결과 페이지 V2] - 종합 피드백 존재:', !!data.overallFeedback);

        // questions 배열을 id 순으로 정렬
        if (data.questions) {
          data.questions.sort((a, b) => a.id - b.id);
        }

        setInterviewData(data);
        setLoading(false);
      },
      (err) => {
        console.error('========================================');
        console.error('[결과 페이지 V2] ❌ 조회 에러');
        console.error('[결과 페이지 V2] - 에러:', err);
        console.error('[결과 페이지 V2] - error.code:', err.code);
        console.error('[결과 페이지 V2] - error.message:', err.message);
        console.error('========================================');

        setError('데이터를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => {
      console.log('[결과 페이지 V2] 🔌 onSnapshot 구독 해제');
      unsubscribe();
    };
  }, [user, authLoading, interviewId, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">면접 결과를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">오류</h2>
            <p className="text-gray-700 mb-6">{error}</p>
            <Button onClick={() => router.push('/history')}>
              히스토리로 돌아가기
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">면접 결과</h1>
        <Button variant="secondary" onClick={() => router.push('/history')}>
          목록으로
        </Button>
      </div>

      {/* 종합 피드백 섹션 */}
      <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 mb-6">
        <div className="flex items-center space-x-3 mb-4">
          <span className="text-3xl">🎯</span>
          <h2 className="text-2xl font-bold text-gray-900">종합 피드백</h2>
        </div>

        {!interviewData.overallFeedback ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="inline-block w-16 h-16 mb-4">
                <div className="w-full h-full border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">종합 피드백 생성 중...</h3>
              <p className="text-gray-600 text-sm">
                AI가 {interviewData.questions?.length || 5}개의 답변을 종합 분석하고 있습니다.
              </p>
              <p className="text-gray-500 text-xs mt-2">
                최대 1-2분 소요될 수 있습니다. 잠시만 기다려 주세요.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* 일관성 평가 */}
            {interviewData.overallFeedback.overallConsistency && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                  <span className="text-xl mr-2">🔄</span>
                  전체 일관성
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {interviewData.overallFeedback.overallConsistency}
                </p>
              </div>
            )}

            {/* 강점 */}
            {interviewData.overallFeedback.strengths && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h3 className="text-lg font-bold text-green-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">✅</span>
                  전체 강점
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {interviewData.overallFeedback.strengths}
                </p>
              </div>
            )}

            {/* 약점 */}
            {interviewData.overallFeedback.weaknesses && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h3 className="text-lg font-bold text-red-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">⚠️</span>
                  개선 필요 사항
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {interviewData.overallFeedback.weaknesses}
                </p>
              </div>
            )}

            {/* 개선 방향 */}
            {interviewData.overallFeedback.improvements && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h3 className="text-lg font-bold text-blue-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">💡</span>
                  구체적 개선 방향
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {interviewData.overallFeedback.improvements}
                </p>
              </div>
            )}

            {/* 종합 평가 */}
            {interviewData.overallFeedback.summary && (
              <div className="bg-white rounded-lg p-6 shadow-sm border-2 border-indigo-300">
                <h3 className="text-lg font-bold text-indigo-700 mb-3 flex items-center">
                  <span className="text-xl mr-2">📊</span>
                  최종 종합 평가
                </h3>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {interviewData.overallFeedback.summary}
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 개별 답변 섹션 */}
      <div className="border-t-4 border-gray-300 pt-8 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">개별 답변 내역</h2>
      </div>

      <Card className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 mb-2">답변 기록</h3>
            <p className="text-sm text-gray-600 mb-3">
              총 {interviewData.questions?.length || 0}개의 질문에 답변하셨습니다.
            </p>
          </div>
        </div>
      </Card>

      {/* 답변 리스트 */}
      <div className="space-y-6">
        {interviewData.questions?.map((q, index) => (
          <Card key={q.id} className="hover:shadow-lg transition-shadow">
            <div className="mb-4">
              <div className="flex items-center space-x-2 mb-2">
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-bold">
                  질문 {q.id}
                </span>
              </div>
              <h3 className="text-xl font-bold text-gray-900">{q.question}</h3>
            </div>

            {/* 오디오 플레이어 */}
            {q.audioUrl && (
              <div className="mb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-2">🎤 녹음 파일</h4>
                <audio controls src={q.audioUrl} className="w-full" />
              </div>
            )}

            {/* 답변 텍스트 */}
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">💬 내 답변</h4>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {q.answer}
                </p>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                답변 시간: {q.duration}초 | 답변 시각: {new Date(q.answeredAt).toLocaleString('ko-KR')}
              </p>
            </div>
          </Card>
        ))}
      </div>

      {/* 하단 버튼 */}
      <div className="mt-8 flex justify-center space-x-4">
        <Button variant="secondary" onClick={() => router.push('/history')}>
          히스토리로 돌아가기
        </Button>
        <Button onClick={() => router.push('/interview')}>
          새 면접 시작
        </Button>
      </div>
    </main>
  );
}
```

---

## 4단계: 히스토리 페이지 수정

### 파일: `src/app/history/page.js`

**핵심 변경**: `interview_reports` 조회 → `interview_results` 조회

```javascript
'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/firebase/config';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import Card from '@/app/components/Card';
import Button from '@/app/components/ui/Button';

export default function HistoryPage() {
  const { user, authLoading } = useAuth();
  const router = useRouter();
  
  const [resumeFeedbacks, setResumeFeedbacks] = useState([]);
  const [interviewResults, setInterviewResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'resume', 'interview'

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/');
      return;
    }

    const fetchData = async () => {
      try {
        console.log('========================================');
        console.log('[히스토리 페이지 V2] 🔍 데이터 조회 시작');
        console.log('[히스토리 페이지 V2] - userId:', user.uid);
        console.log('========================================');

        // 1. 이력서 피드백 조회
        console.log('[히스토리 페이지 V2] 📄 resume_feedbacks 조회 중...');
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
        console.log('[히스토리 페이지 V2] ✅ resume_feedbacks:', resumeData.length, '개');

        // 2. 면접 결과 조회 (단일 문서 구조)
        console.log('[히스토리 페이지 V2] 🎤 interview_results 조회 중...');
        const interviewRef = collection(db, 'interview_results');
        const interviewQuery = query(
          interviewRef,
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        const interviewSnapshot = await getDocs(interviewQuery);
        const interviewData = interviewSnapshot.docs.map(doc => ({
          id: doc.id,
          type: 'interview',
          ...doc.data()
        }));
        console.log('[히스토리 페이지 V2] ✅ interview_results:', interviewData.length, '개');

        setResumeFeedbacks(resumeData);
        setInterviewResults(interviewData);

        console.log('[히스토리 페이지 V2] ✅ 전체 데이터 로드 완료');
        console.log('========================================');
      } catch (error) {
        console.error('========================================');
        console.error('[히스토리 페이지 V2] ❌ 에러 발생');
        console.error('[히스토리 페이지 V2] - 에러:', error);
        console.error('[히스토리 페이지 V2] - error.code:', error.code);
        console.error('[히스토리 페이지 V2] - error.message:', error.message);
        console.error('========================================');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, authLoading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-block w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-gray-600">히스토리를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 전체 데이터 병합 및 정렬
  const allData = [
    ...resumeFeedbacks,
    ...interviewResults
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // 필터링
  const filteredData = activeTab === 'all' 
    ? allData 
    : activeTab === 'resume' 
    ? resumeFeedbacks 
    : interviewResults;

  return (
    <main className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">피드백 히스토리</h1>

      {/* 탭 UI */}
      <div className="flex space-x-2 mb-6">
        <Button
          variant={activeTab === 'all' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('all')}
        >
          전체 ({allData.length})
        </Button>
        <Button
          variant={activeTab === 'resume' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('resume')}
        >
          이력서 ({resumeFeedbacks.length})
        </Button>
        <Button
          variant={activeTab === 'interview' ? 'primary' : 'secondary'}
          onClick={() => setActiveTab('interview')}
        >
          면접 ({interviewResults.length})
        </Button>
      </div>

      {/* 리스트 */}
      {filteredData.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">아직 히스토리가 없습니다.</p>
            <div className="space-x-4">
              <Button onClick={() => router.push('/resume')}>
                이력서 피드백 받기
              </Button>
              <Button variant="secondary" onClick={() => router.push('/interview')}>
                면접 연습 하기
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {filteredData.map((item) => (
            <Card 
              key={item.id} 
              hover
              onClick={() => {
                if (item.type === 'interview') {
                  router.push(`/interview/result/${item.interviewId}`);
                } else {
                  router.push(`/feedback/${item.id}`);
                }
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="text-2xl">
                      {item.type === 'resume' ? '📄' : '🎤'}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(item.createdAt).toLocaleDateString('ko-KR')}
                    </span>
                  </div>

                  {item.type === 'interview' && (
                    <div className="space-y-2">
                      <div className="flex items-center space-x-2">
                        <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                          {item.questions?.length || 0}개 질문 세트
                        </span>
                        {item.overallFeedback ? (
                          <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                            ✅ 종합 피드백 완료
                          </span>
                        ) : (
                          <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                            ⏳ 피드백 생성 중...
                          </span>
                        )}
                      </div>
                      {item.overallFeedback?.summary && (
                        <p className="text-gray-700 text-sm line-clamp-2">
                          {item.overallFeedback.summary}
                        </p>
                      )}
                    </div>
                  )}

                  {item.type === 'resume' && (
                    <p className="text-gray-700 text-sm line-clamp-2">
                      {item.resumeText?.substring(0, 100)}...
                    </p>
                  )}
                </div>
                <div className="ml-4">
                  <span className="text-gray-400">→</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
```

---

## 5단계: Firestore 인덱스 업데이트

### 파일: `firestore.indexes.v3.json` (새 파일)

```json
{
  "indexes": [
    {
      "collectionGroup": "interview_results",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "resume_feedbacks",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

### 배포 명령

```bash
firebase deploy --only firestore:indexes
```

---

## 6단계: Firestore 보안 규칙 업데이트

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // interview_results: 본인만 읽기/쓰기 가능
    match /interview_results/{interviewId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow create: if request.auth != null &&
                       request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null &&
                       resource.data.userId == request.auth.uid &&
                       request.resource.data.userId == resource.data.userId;
      allow delete: if request.auth != null &&
                       resource.data.userId == request.auth.uid;
    }
    
    // resume_feedbacks: 본인만 읽기/쓰기 가능
    match /resume_feedbacks/{feedbackId} {
      allow read: if request.auth != null && 
                     resource.data.userId == request.auth.uid;
      allow write: if request.auth != null &&
                      request.resource.data.userId == request.auth.uid;
    }
  }
}
```

---

## 📊 성능 비교

| 작업 | 기존 구조 | 단일 문서 구조 | 개선율 |
|------|----------|---------------|--------|
| 결과 페이지 로딩 | 6번 조회 (1 report + 5 answers) | **1번 조회** | **83% 감소** ✅ |
| 히스토리 상세 | 6번 조회 | **1번 조회** | **83% 감소** ✅ |
| 실시간 업데이트 | 2개 구독 | **1개 구독** | **50% 감소** ✅ |
| 답변 저장 | 1번 쓰기 (addDoc) | 1번 쓰기 (updateDoc) | 동일 |

---

## ✅ 체크리스트

### 필수 작업
- [ ] InterviewUI에서 면접 시작 시 `interview_results` 초기 문서 생성
- [ ] InterviewUI에서 각 답변 저장 시 `updateDoc` + `arrayUnion` 사용
- [ ] InterviewUI에서 면접 완료 시 `completedAt` 업데이트
- [ ] 종합 피드백 API V2 생성 (`/api/interview/generate-overall-feedback-v2/route.js`)
- [ ] 결과 페이지를 단일 문서 조회로 수정
- [ ] 히스토리 페이지를 `interview_results` 조회로 수정
- [ ] Firestore 인덱스 배포
- [ ] Firestore 보안 규칙 업데이트

### 테스트
- [ ] 새로운 면접 시작 → `interview_results` 문서 생성 확인
- [ ] 각 질문 답변 → `questions` 배열 업데이트 확인
- [ ] 면접 완료 → 종합 피드백 생성 확인
- [ ] 결과 페이지에서 단일 문서 조회 확인
- [ ] 히스토리 페이지에서 리스트 표시 확인

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant  
**버전**: 1.0.0

