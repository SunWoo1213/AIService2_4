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

                {/* 오디오 플레이어 */}
                {result.audioURL && (
                  <div className="mb-4">
                    <span className="text-sm font-medium text-gray-600 mb-2 block">🎧 녹음 듣기</span>
                    <audio 
                      controls 
                      className="w-full"
                      style={{ height: '40px' }}
                    >
                      <source src={result.audioURL} type="audio/webm" />
                      <source src={result.audioURL} type="audio/mp4" />
                      브라우저가 오디오 재생을 지원하지 않습니다.
                    </audio>
                  </div>
                )}

                {/* 내용 평가 */}
                <div className="border-t pt-3 mb-4 bg-blue-50 -mx-6 px-6 pb-3 rounded-b-xl">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-semibold text-gray-700">📝 내용 피드백</span>
                    {result.contentScore && (
                      <span className="text-lg font-bold text-primary-600">
                        {result.contentScore}/10점
                      </span>
                    )}
                  </div>
                  <p className="text-gray-700 text-sm bg-white p-3 rounded-lg">
                    {result.contentAdvice || result.feedback || '평가 없음'}
                  </p>
                </div>
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

