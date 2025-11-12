'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
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
  
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user || !interviewId) return;

    console.log('면접 결과 페이지 로드:', interviewId);

    // Firestore에서 해당 interviewId의 모든 답변을 실시간으로 구독
    const answersRef = collection(db, 'interview_answers');
    const q = query(
      answersRef,
      where('userId', '==', user.uid),
      where('interviewId', '==', interviewId),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(
      q,
      (querySnapshot) => {
        const answersData = [];
        querySnapshot.forEach((doc) => {
          answersData.push({ id: doc.id, ...doc.data() });
        });
        
        console.log('실시간 답변 데이터 업데이트:', answersData.length, '개');
        setAnswers(answersData);
        setLoading(false);
      },
      (error) => {
        console.error('답변 데이터 구독 오류:', error);
        setError('답변 데이터를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    // 컴포넌트 언마운트 시 구독 해제
    return () => unsubscribe();
  }, [user, interviewId, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" text="결과를 불러오는 중..." />
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
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">😢</div>
            <h2 className="text-2xl font-bold text-gray-800 mb-4">오류가 발생했습니다</h2>
            <p className="text-gray-600 mb-6">{error}</p>
            <Button onClick={() => router.push('/interview')}>
              돌아가기
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">면접 결과</h1>
          <p className="text-gray-600">
            AI가 답변을 분석하고 있습니다. 피드백이 완료되는 대로 실시간으로 표시됩니다.
          </p>
        </div>

        {answers.length === 0 ? (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">
              답변 데이터를 찾을 수 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              면접이 제대로 완료되지 않았거나, 데이터를 불러오는 중입니다.
            </p>
            <Button onClick={() => router.push('/interview')}>
              면접 페이지로 돌아가기
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            {/* 진행률 표시 */}
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-800 mb-1">면접 진행 상황</h3>
                  <p className="text-sm text-gray-600">
                    총 {answers.length}개의 질문에 답변하셨습니다.
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary-600">
                    {answers.filter(a => a.feedback && a.feedback !== '평가 중...').length} / {answers.length}
                  </p>
                  <p className="text-xs text-gray-500">피드백 완료</p>
                </div>
              </div>
            </Card>

            {/* 답변 리스트 */}
            {answers.map((answer, index) => (
              <Card key={answer.id}>
                <div className="mb-4">
                  <span className="inline-block px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-medium mb-3">
                    질문 {index + 1}
                  </span>
                  
                  {/* 질문 */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">질문 (Question)</p>
                    <p className="text-lg font-medium text-gray-800 bg-blue-50 p-4 rounded-lg border border-blue-200">
                      {answer.question}
                    </p>
                  </div>

                  {/* 내 답변 */}
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-gray-500 mb-2">내 답변 (Transcript)</p>
                    {answer.transcript && answer.transcript !== '답변 없음' ? (
                      <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200 whitespace-pre-wrap">
                        {answer.transcript}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic bg-gray-50 p-4 rounded-lg border border-gray-200">
                        답변이 감지되지 않았습니다.
                      </p>
                    )}
                  </div>

                  {/* 다시 듣기 (오디오) */}
                  {answer.audioURL && (
                    <div className="mb-4">
                      <p className="text-xs font-semibold text-gray-500 mb-2">🎧 다시 듣기</p>
                      <audio 
                        controls 
                        className="w-full"
                        style={{ height: '48px' }}
                        preload="metadata"
                      >
                        <source src={answer.audioURL} type="audio/webm" />
                        <source src={answer.audioURL} type="audio/mp4" />
                        브라우저가 오디오 재생을 지원하지 않습니다.
                      </audio>
                    </div>
                  )}

                  {/* AI 피드백 */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 mb-2">💡 AI 피드백</p>
                    {!answer.feedback || answer.feedback === '평가 중...' ? (
                      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <div className="flex items-center space-x-3">
                          <div className="animate-spin w-5 h-5 border-2 border-yellow-600 border-t-transparent rounded-full"></div>
                          <p className="text-sm text-yellow-800 font-medium">
                            AI가 답변을 분석 중입니다...
                          </p>
                        </div>
                        <p className="text-xs text-yellow-600 mt-2">
                          잠시만 기다려주세요. 분석이 완료되면 자동으로 표시됩니다.
                        </p>
                      </div>
                    ) : (
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <div className="flex items-start space-x-2">
                          <span className="text-green-600 font-bold text-lg">✓</span>
                          <div className="flex-1">
                            <p className="text-sm text-gray-800 whitespace-pre-wrap">
                              {answer.feedback}
                            </p>
                            {answer.score && (
                              <p className="text-xs text-green-700 font-semibold mt-2">
                                평가 점수: {answer.score}/10
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}

            {/* 하단 버튼 */}
            <div className="flex justify-center space-x-4 pt-4">
              <Button onClick={() => router.push('/history')}>
                히스토리 보기
              </Button>
              <Button 
                variant="secondary" 
                onClick={() => router.push('/interview')}
              >
                새로운 면접 시작
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

