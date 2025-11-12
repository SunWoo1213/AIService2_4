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
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-800 mb-2">면접 분석 현황</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    총 {answers.length}개의 질문에 답변하셨습니다.
                  </p>
                  <div className="flex items-center space-x-4">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-sm text-gray-700">
                        분석 완료: <strong>{answers.filter(a => a.feedback && a.feedback !== '평가 중...').length}개</strong>
                      </span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500 animate-pulse"></div>
                      <span className="text-sm text-gray-700">
                        분석 중: <strong>{answers.filter(a => !a.feedback || a.feedback === '평가 중...').length}개</strong>
                      </span>
                    </div>
                  </div>
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

                  {/* ===== [재생용] 오디오 플레이어 (상단 배치) ===== */}
                  {answer.audioURL && (
                    <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 p-5 rounded-xl border-2 border-indigo-200">
                      <div className="flex items-start space-x-3 mb-3">
                        <span className="text-2xl">🎧</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-indigo-900 mb-1">답변 녹음 다시 듣기 (Playback)</p>
                          <p className="text-xs text-indigo-700 mb-3">
                            💡 이 오디오는 <strong>재생 전용</strong>입니다. 아래 피드백은 <strong>텍스트 내용</strong>을 기반으로 평가되었습니다.
                          </p>
                        </div>
                      </div>
                      <audio 
                        controls 
                        className="w-full rounded-lg shadow-sm"
                        style={{ height: '48px' }}
                        preload="metadata"
                      >
                        <source src={answer.audioURL} type="audio/webm" />
                        <source src={answer.audioURL} type="audio/mp4" />
                        브라우저가 오디오 재생을 지원하지 않습니다.
                      </audio>
                    </div>
                  )}

                  {/* ===== [분석용] 내 답변 텍스트 ===== */}
                  <div className="mb-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <p className="text-xs font-semibold text-gray-500">내 답변 텍스트 (Transcript)</p>
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        분석 대상
                      </span>
                    </div>
                    {answer.transcript && answer.transcript !== '답변 없음' ? (
                      <p className="text-sm text-gray-700 bg-gray-50 p-4 rounded-lg border border-gray-200 whitespace-pre-wrap leading-relaxed">
                        {answer.transcript}
                      </p>
                    ) : (
                      <p className="text-sm text-gray-400 italic bg-gray-50 p-4 rounded-lg border border-gray-200">
                        답변이 감지되지 않았습니다.
                      </p>
                    )}
                    <p className="text-xs text-gray-500 mt-2 italic">
                      ℹ️ AI는 위 텍스트 내용을 분석하여 피드백을 제공합니다.
                    </p>
                  </div>

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
                    ) : (() => {
                      try {
                        // JSON 파싱 시도
                        const feedbackData = typeof answer.feedback === 'string' 
                          ? JSON.parse(answer.feedback) 
                          : answer.feedback;
                        
                        return (
                          <div className="space-y-4">
                            {/* 강점 */}
                            {feedbackData.strengths && feedbackData.strengths.trim() !== '' && 
                             feedbackData.strengths !== '특별한 강점이 없음' && 
                             feedbackData.strengths !== '특별한 강점을 찾기 어렵습니다' && (
                              <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-xl border-l-4 border-green-500 shadow-sm">
                                <div className="flex items-start space-x-3">
                                  <span className="text-2xl">✓</span>
                                  <div className="flex-1">
                                    <p className="text-sm font-bold text-green-900 mb-2">강점 (Strengths)</p>
                                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{feedbackData.strengths}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* 약점 */}
                            {feedbackData.weaknesses && feedbackData.weaknesses.trim() !== '' && (
                              <div className="bg-gradient-to-r from-red-50 to-orange-50 p-4 rounded-xl border-l-4 border-red-500 shadow-sm">
                                <div className="flex items-start space-x-3">
                                  <span className="text-2xl">✗</span>
                                  <div className="flex-1">
                                    <p className="text-sm font-bold text-red-900 mb-2">약점 및 개선 필요 사항 (Weaknesses)</p>
                                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{feedbackData.weaknesses}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* 개선 방향 */}
                            {feedbackData.improvements && feedbackData.improvements.trim() !== '' && (
                              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border-l-4 border-blue-500 shadow-sm">
                                <div className="flex items-start space-x-3">
                                  <span className="text-2xl">💡</span>
                                  <div className="flex-1">
                                    <p className="text-sm font-bold text-blue-900 mb-2">구체적인 개선 가이드 (Actionable Advice)</p>
                                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{feedbackData.improvements}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {/* 종합 평가 */}
                            {feedbackData.summary && feedbackData.summary.trim() !== '' && (
                              <div className="bg-gradient-to-r from-purple-50 to-pink-50 p-4 rounded-xl border-l-4 border-purple-500 shadow-sm">
                                <div className="flex items-start space-x-3">
                                  <span className="text-2xl">📝</span>
                                  <div className="flex-1">
                                    <p className="text-sm font-bold text-purple-900 mb-2">종합 평가 (Overall Assessment)</p>
                                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{feedbackData.summary}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      } catch (e) {
                        // JSON 파싱 실패 시 오류 메시지 표시
                        console.error('[결과 페이지] JSON 파싱 실패:', e);
                        console.error('[결과 페이지] 원본 feedback 데이터:', answer.feedback);
                        
                        return (
                          <div className="bg-orange-50 p-4 rounded-xl border-l-4 border-orange-400 shadow-sm">
                            <div className="flex items-start space-x-3">
                              <span className="text-orange-600 text-xl">⚠️</span>
                              <div className="flex-1">
                                <p className="text-sm font-bold text-orange-900 mb-2">피드백 형식 오류</p>
                                <p className="text-xs text-orange-700 mb-2">
                                  피드백 데이터 형식이 올바르지 않습니다. 백그라운드 평가가 진행 중이거나 오류가 발생했을 수 있습니다.
                                </p>
                                <details className="text-xs text-gray-600 mt-2">
                                  <summary className="cursor-pointer hover:text-gray-800 font-medium">원본 데이터 보기</summary>
                                  <pre className="mt-2 p-2 bg-white rounded border border-gray-200 overflow-x-auto text-xs">
                                    {typeof answer.feedback === 'string' 
                                      ? answer.feedback 
                                      : JSON.stringify(answer.feedback, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            </div>
                          </div>
                        );
                      }
                    })()}
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

