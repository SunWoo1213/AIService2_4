'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/firebase/config';
import Navbar from '../../../components/Navbar';
import Button from '../../../components/ui/Button';
import Card from '../../../components/ui/Card';
import Loading from '../../../components/ui/Loading';

export default function InterviewResultPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const interviewId = params.interviewId;
  
  // ===== [5대 컬렉션] 면접 답변 + 평가 State =====
  const [interviewSession, setInterviewSession] = useState(null); // 답변 데이터
  const [evaluation, setEvaluation] = useState(null); // 평가 데이터
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    console.log('========================================');
    console.log('[결과 페이지] 데이터 조회 시작');
    console.log('[결과 페이지] - interviewId:', interviewId);
    console.log('[결과 페이지] - userId:', user?.uid);
    console.log('[결과 페이지] 💡 5대 컬렉션 구조: interview_sessions + interview_evaluations');
    console.log('========================================');
    
    if (authLoading) {
      console.log('[결과 페이지] ⏳ Auth 로딩 중...');
      return;
    }
    
    if (!user) {
      console.warn('[결과 페이지] ⚠️ user 없음');
      return;
    }
    
    if (!interviewId) {
      console.error('[결과 페이지] ❌ interviewId 없음');
      setError('면접 ID를 찾을 수 없습니다.');
      setLoading(false);
      return;
    }
    
    // ===== [5대 컬렉션] interview_sessions 조회 (답변 데이터) =====
    console.log('[결과 페이지] 🔍 1. interview_sessions 조회 시작');
    console.log('[결과 페이지] - 문서 경로: interview_sessions/' + interviewId);
    
    const sessionRef = doc(db, 'interview_sessions', interviewId);
    
    const unsubscribeSession = onSnapshot(
      sessionRef,
      (sessionSnapshot) => {
        console.log('========================================');
        console.log('[결과 페이지] 📥 interview_sessions 콜백 실행');
        console.log('[결과 페이지] - 시각:', new Date().toISOString());
        console.log('[결과 페이지] - doc.exists():', sessionSnapshot.exists());
        
        if (sessionSnapshot.exists()) {
          const data = sessionSnapshot.data();
          console.log('[결과 페이지] ✅ interview_sessions 조회 성공!');
          console.log('[결과 페이지] - 질문 개수:', data.questions?.length || 0);
          console.log('[결과 페이지] - status:', data.status);
          
          setInterviewSession(data);
          setError(null);
        } else {
          console.warn('[결과 페이지] ⚠️ interview_sessions 문서가 없습니다!');
          setError('면접 결과를 찾을 수 없습니다.');
        }
        
        setLoading(false);
        console.log('========================================');
      },
      (err) => {
        console.error('========================================');
        console.error('[결과 페이지] ❌ interview_sessions Firestore 에러!');
        console.error('[결과 페이지] - 에러 코드:', err.code);
        console.error('[결과 페이지] - 에러 메시지:', err.message);
        console.error('========================================');
        
        setError('데이터를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );
    
    // ===== [5대 컬렉션] interview_evaluations 조회 (평가 데이터) =====
    console.log('[결과 페이지] 🔍 2. interview_evaluations 조회 시작');
    const evaluationId = `eval_${interviewId}`;
    console.log('[결과 페이지] - 문서 경로: interview_evaluations/' + evaluationId);
    
    const evaluationRef = doc(db, 'interview_evaluations', evaluationId);
    
    const unsubscribeEvaluation = onSnapshot(
      evaluationRef,
      (evalSnapshot) => {
        console.log('========================================');
        console.log('[결과 페이지] 📥 interview_evaluations 콜백 실행');
        console.log('[결과 페이지] - 시각:', new Date().toISOString());
        console.log('[결과 페이지] - doc.exists():', evalSnapshot.exists());
        
        if (evalSnapshot.exists()) {
          const data = evalSnapshot.data();
          console.log('[결과 페이지] ✅ interview_evaluations 조회 성공!');
          console.log('[결과 페이지] - overallReview 존재:', !!data.overallReview);
          console.log('[결과 페이지] - questionEvaluations 개수:', data.questionEvaluations?.length || 0);
          
          setEvaluation(data);
        } else {
          console.warn('[결과 페이지] ⚠️ interview_evaluations 문서가 아직 없습니다.');
          console.warn('[결과 페이지] 💡 AI가 평가를 생성 중일 수 있습니다.');
          setEvaluation(null);
        }
        
        console.log('========================================');
      },
      (err) => {
        console.error('========================================');
        console.error('[결과 페이지] ❌ interview_evaluations Firestore 에러!');
        console.error('[결과 페이지] - 에러 코드:', err.code);
        console.error('[결과 페이지] - 에러 메시지:', err.message);
        console.error('========================================');
        
        // 평가 에러는 치명적이지 않음 (아직 생성 중일 수 있음)
        setEvaluation(null);
      }
    );

    return () => {
      unsubscribeSession();
      unsubscribeEvaluation();
    };
  }, [user, authLoading, interviewId, router]);

  // ===== [피드백 로딩 상태 확인] =====
  const isFeedbackLoading = !evaluation;

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" text="면접 결과 로딩 중..." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-4xl mx-auto px-4 py-8">
          <Card>
            <div className="text-center py-12">
              <div className="text-6xl mb-4">❌</div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">
                {error}
              </h3>
              <Button onClick={() => router.push('/interview')}>
                돌아가기
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  if (!interviewSession) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" text="데이터 로딩 중..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">면접 결과</h1>
          <p className="text-gray-600">
            총 {interviewSession.questionCount}개의 질문에 답변하셨습니다.
          </p>
          <p className="text-sm text-gray-500">
            {new Date(interviewSession.createdAt).toLocaleString('ko-KR')}
          </p>
        </div>

        {/* 종합 피드백 섹션 */}
        <Card className="mb-8 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200">
          <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-3xl">📊</span>
            종합 피드백
          </h2>
          
          {evaluation?.overallReview ? (
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <p className="text-gray-800 leading-relaxed whitespace-pre-line">
                {evaluation.overallReview}
              </p>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-lg text-center">
              <div className="inline-block animate-pulse mb-4">
                <div className="text-5xl">🤖</div>
              </div>
              <h3 className="text-lg font-bold text-gray-800 mb-2">
                AI 면접관이 꼼꼼하게 분석 중입니다...
              </h3>
              <p className="text-gray-600 mb-4">
                전체 답변을 종합적으로 분석하여 깊이 있는 피드백을 작성하고 있습니다.
              </p>
              <div className="flex justify-center items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          )}
        </Card>

        {/* 개별 질문 답변 섹션 */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">질문별 답변</h2>
          
          {evaluation?.questionEvaluations && evaluation.questionEvaluations.length > 0 ? (
            // ===== [통합 구조] evaluation에 모든 데이터가 있으므로 이것만 사용 =====
            evaluation.questionEvaluations.map((item, index) => {
              // interview_sessions에서 audioUrl 보완 (선택사항)
              const sessionQuestion = interviewSession?.questions?.find(
                q => q.qId === item.qId
              );
              const audioUrl = item.audioUrl || sessionQuestion?.audioUrl;
              
              console.log(`[결과 페이지] 질문 ${index + 1} (${item.qId}):`, {
                question: item.question?.substring(0, 30) + '...',
                answer: item.answerTranscript?.substring(0, 30) + '...',
                hasFeedback: !!item.feedback,
                hasAudio: !!audioUrl
              });
              
              return (
                <Card key={item.qId || index}>
                  {/* 질문 */}
                  <div className="mb-4 pb-4 border-b border-gray-200">
                    <span className="text-sm font-bold text-primary-600 mb-2 block">
                      질문 {item.qId || index + 1}
                    </span>
                    <p className="text-lg font-bold text-gray-900">
                      {item.question}
                    </p>
                  </div>

                {/* 답변 (음성 + 텍스트) */}
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">내 답변</h4>
                  
                  {/* 오디오 플레이어 */}
                  {audioUrl && (
                    <div className="mb-3">
                      <audio controls className="w-full">
                        <source src={audioUrl} type="audio/webm" />
                        브라우저가 오디오를 지원하지 않습니다.
                      </audio>
                    </div>
                  )}
                  
                  {/* STT 텍스트 */}
                  {item.answerTranscript && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-700 whitespace-pre-line">
                        {item.answerTranscript}
                      </p>
                    </div>
                  )}
                  
                  {item.duration && (
                    <p className="text-xs text-gray-500 mt-2">
                      답변 시간: {item.duration}초
                    </p>
                  )}
                </div>

                {/* AI 코멘트 섹션 */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-bold text-indigo-700 mb-2 flex items-center gap-2">
                    <span className="text-lg">💡</span>
                    AI 코멘트
                  </h4>
                  
                  {item.feedback ? (
                    <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                      <p className="text-gray-800 leading-relaxed whitespace-pre-line">
                        {item.feedback}
                      </p>
                    </div>
                  ) : (
                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                      <div className="inline-block animate-pulse mb-2">
                        <div className="text-2xl">🤔</div>
                      </div>
                      <p className="text-sm text-gray-600">
                        AI가 이 답변을 분석하고 있습니다...
                      </p>
                      <div className="flex justify-center items-center gap-1 mt-2">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
              );
            })
          ) : interviewSession?.questions && interviewSession.questions.length > 0 ? (
            // ===== [폴백] evaluation이 없으면 interview_sessions 데이터 사용 (피드백 없음) =====
            interviewSession.questions.map((item, index) => (
              <Card key={item.qId || index}>
                <div className="mb-4 pb-4 border-b border-gray-200">
                  <span className="text-sm font-bold text-primary-600 mb-2 block">
                    질문 {item.qId || index + 1}
                  </span>
                  <p className="text-lg font-bold text-gray-900">
                    {item.question}
                  </p>
                </div>
                <div className="mb-4">
                  <h4 className="text-sm font-bold text-gray-700 mb-2">내 답변</h4>
                  {item.audioUrl && (
                    <div className="mb-3">
                      <audio controls className="w-full">
                        <source src={item.audioUrl} type="audio/webm" />
                        브라우저가 오디오를 지원하지 않습니다.
                      </audio>
                    </div>
                  )}
                  {item.answerTranscript && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <p className="text-gray-700 whitespace-pre-line">
                        {item.answerTranscript}
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 text-center">
                    <div className="inline-block animate-pulse mb-2">
                      <div className="text-2xl">🤔</div>
                    </div>
                    <p className="text-sm text-gray-600">
                      AI가 이 답변을 분석하고 있습니다...
                    </p>
                  </div>
                </div>
              </Card>
            ))
          ) : (
            <Card>
              <p className="text-center text-gray-600 py-8">
                답변 데이터가 없습니다.
              </p>
            </Card>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="mt-8 flex gap-4">
          <Button variant="outline" onClick={() => router.push('/history')}>
            히스토리로 돌아가기
          </Button>
          <Button onClick={() => router.push('/interview')}>
            새 면접 시작하기
          </Button>
        </div>
      </main>
    </div>
  );
}
