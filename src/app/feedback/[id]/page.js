'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import Navbar from '../../components/Navbar';
import FeedbackDisplay from '../../components/FeedbackDisplay';
import Button from '../../components/ui/Button';
import Loading from '../../components/ui/Loading';

export default function FeedbackDetailPage({ params }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchFeedback = async () => {
      if (!user) return;

      try {
        const docRef = doc(db, 'feedbacks', params.id);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const data = docSnap.data();
          if (data.userId !== user.uid) {
            alert('접근 권한이 없습니다.');
            router.push('/dashboard');
            return;
          }
          setFeedback(data);
        } else {
          alert('피드백을 찾을 수 없습니다.');
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Error fetching feedback:', error);
        alert('피드백을 불러오는 중 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    fetchFeedback();
  }, [user, params.id, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" text="로딩 중..." />
      </div>
    );
  }

  if (!user || !feedback) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {feedback.type === 'resume' ? '자기소개서 피드백' : '모의 면접 결과'}
          </h1>
          <p className="text-gray-600">
            {new Date(feedback.createdAt).toLocaleString('ko-KR')}
          </p>
        </div>

        {feedback.type === 'resume' && (
          <FeedbackDisplay feedback={feedback.feedback} />
        )}

        {feedback.type === 'voice' && feedback.structured_feedback && (
          <>
            <FeedbackDisplay feedback={feedback.structured_feedback} isStructured={true} />
            
            {/* 음성 피드백 평가 */}
            {!feedback.user_rating && (
              <div className="mt-8">
                <div className="bg-white border border-gray-300 rounded-lg p-6">
                  <h4 className="text-lg font-bold text-gray-800 mb-4 text-center">이 피드백이 충분했나요?</h4>
                  <div className="flex gap-4 justify-center">
                    <button className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                      <span className="text-xl">👍</span>
                      유용했어요
                    </button>
                    <button className="flex items-center gap-2 px-6 py-3 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition-colors">
                      <span className="text-xl">👎</span>
                      아쉬워요
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {feedback.type === 'interview' && (
          <div className="space-y-6">
            {feedback.interviewResults && feedback.interviewResults.map((result, index) => (
              <div key={index} className="bg-white rounded-xl shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-800 mb-3">
                  질문 {index + 1}
                </h3>
                <div className="mb-3">
                  <p className="text-gray-700 font-medium">{result.question}</p>
                </div>
                <div className="mb-3">
                  <span className="text-sm font-medium text-gray-600">당신의 답변:</span>
                  <p className="text-gray-700 mt-1 whitespace-pre-wrap">{result.userAnswer}</p>
                </div>

                {/* 내용 평가 */}
                <div className="border-t pt-3 mb-4">
                  <div className="mb-2">
                    <span className="text-sm font-medium text-gray-600">📝 내용 피드백:</span>
                  </div>
                  <p className="text-gray-700 text-sm">
                    {result.contentAdvice || result.feedback || '평가 없음'}
                  </p>
                </div>

                {/* 전달력 분석 (있는 경우만 표시) */}
                {result.deliveryMetrics && (
                  <div className="border-t pt-3 bg-blue-50 -mx-6 px-6 pb-3 rounded-b-xl">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                      <span className="mr-2">🎙️</span>
                      전달력 분석
                    </h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                      {/* 말 속도 */}
                      {result.deliveryMetrics.spm && (
                        <div className="bg-white p-3 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-600">말 속도</span>
                            <span className="text-lg font-bold text-primary-600">
                              {result.deliveryMetrics.spm} SPM
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {result.deliveryMetrics.speedAdvice || '이상적 범위: 300-400 SPM (음절/분)'}
                          </p>
                        </div>
                      )}

                      {/* 필러 단어 */}
                      {result.deliveryMetrics.fillerCount !== undefined && (
                        <div className="bg-white p-3 rounded-lg">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-600">필러 단어</span>
                            <span className="text-lg font-bold text-orange-600">
                              {result.deliveryMetrics.fillerCount}회
                            </span>
                          </div>
                          <p className="text-xs text-gray-600">
                            {result.deliveryMetrics.fillerAdvice || "'어', '음' 등의 불필요한 단어"}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="text-xs text-gray-500 italic">
                      💡 전달력 분석은 음성 속도와 필러 단어를 기반으로 합니다.
                    </div>
                  </div>
                )}

                {/* 전달력 분석이 없는 경우 안내 */}
                {!result.deliveryMetrics && (
                  <div className="text-xs text-gray-400 italic mt-2">
                    💡 이 답변은 기본 평가 모드로 분석되었습니다.
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex space-x-4">
          <Button onClick={() => router.push('/history')} variant="secondary">
            히스토리로 돌아가기
          </Button>
          <Button onClick={() => router.push('/new-feedback')}>
            새 피드백 받기
          </Button>
        </div>
      </main>
    </div>
  );
}

