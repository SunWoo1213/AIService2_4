'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import Navbar from '../components/Navbar';
import InterviewUI from '../components/InterviewUI';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Loading from '../components/ui/Loading';

export default function InterviewPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState('select'); // 'select', 'configure', 'interview', 'complete'
  const [pastFeedbacks, setPastFeedbacks] = useState([]);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [selectedTone, setSelectedTone] = useState(null); // 사용자가 선택한 말투
  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [defaultTone, setDefaultTone] = useState('friendly'); // API에서 불러온 기본 말투

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchPastFeedbacks = async () => {
      if (!user) return;

      try {
        // 사용자 기본 말투 설정 불러오기
        const preferencesResponse = await fetch(`/api/user/preferences?userId=${user.uid}`);
        if (preferencesResponse.ok) {
          const preferencesData = await preferencesResponse.json();
          setDefaultTone(preferencesData.tone_preference || 'friendly');
          console.log('기본 말투 설정 불러옴:', preferencesData.tone_preference);
        }

        const feedbacksRef = collection(db, 'feedbacks');
        const q = query(
          feedbacksRef,
          where('userId', '==', user.uid),
          where('type', '==', 'resume')
        );
        
        const querySnapshot = await getDocs(q);
        const feedbacks = [];
        querySnapshot.forEach((doc) => {
          feedbacks.push({ id: doc.id, ...doc.data() });
        });
        
        setPastFeedbacks(feedbacks);
      } catch (error) {
        console.error('Error fetching feedbacks:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPastFeedbacks();
  }, [user]);

  const handleSelectFeedback = (feedback) => {
    setSelectedFeedback(feedback);
    setSelectedTone(null); // 말투 선택 초기화
    setStep('configure'); // 설정 단계로 이동
  };

  const handleStartInterview = async () => {
    if (!selectedFeedback || !selectedTone) {
      alert('자기소개서와 말투를 모두 선택해주세요.');
      return;
    }

    setGenerating(true);

    try {
      const response = await fetch('/api/interview/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobKeywords: selectedFeedback.jobKeywords,
          resumeText: selectedFeedback.resumeText,
          tonePreference: selectedTone // 선택한 말투 전달
        }),
      });

      if (!response.ok) {
        throw new Error('질문 생성 실패');
      }

      const data = await response.json();
      setQuestions(data.questions);
      setStep('interview');
    } catch (error) {
      console.error('Question generation error:', error);
      alert('질문 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handleInterviewComplete = async (results) => {
    try {
      // Firestore에 결과 저장
      await addDoc(collection(db, 'feedbacks'), {
        userId: user.uid,
        type: 'interview',
        jobKeywords: selectedFeedback.jobKeywords,
        resumeText: selectedFeedback.resumeText,
        interviewResults: results,
        createdAt: new Date().toISOString()
      });

      setStep('complete');
    } catch (error) {
      console.error('Error saving interview results:', error);
      alert('결과 저장 중 오류가 발생했습니다.');
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loading size="lg" text="로딩 중..." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">모의 면접</h1>
          <p className="text-gray-600">
            AI와 함께 실전 같은 모의 면접을 연습해보세요.
          </p>
        </div>

        {step === 'select' && (
          <div>
            {pastFeedbacks.length === 0 ? (
              <Card>
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-xl font-bold text-gray-800 mb-2">
                    아직 자기소개서 피드백이 없습니다
                  </h3>
                  <p className="text-gray-600 mb-6">
                    먼저 자기소개서 피드백을 받아야 모의 면접을 시작할 수 있습니다.
                  </p>
                  <Button onClick={() => router.push('/new-feedback')}>
                    자기소개서 첨삭받기
                  </Button>
                </div>
              </Card>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  1단계: 면접 기반이 될 자기소개서를 선택하세요
                </h2>
                <div className="space-y-4">
                  {pastFeedbacks.map((feedback) => (
                    <Card key={feedback.id} hover onClick={() => handleSelectFeedback(feedback)}>
                      <div className="flex justify-between items-center">
                        <div className="flex-1">
                          <p className="text-gray-600 text-sm mb-2">
                            {new Date(feedback.createdAt).toLocaleString('ko-KR')}
                          </p>
                          <p className="text-gray-700 text-sm line-clamp-2">
                            {feedback.resumeText.substring(0, 100)}...
                          </p>
                        </div>
                        <Button variant="outline">선택</Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'configure' && selectedFeedback && (
          <div className="space-y-6">
            {/* 선택한 자기소개서 표시 */}
            <Card>
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-bold text-gray-800">1단계: 선택한 자기소개서</h3>
                  <Button 
                    variant="secondary" 
                    onClick={() => {
                      setStep('select');
                      setSelectedFeedback(null);
                      setSelectedTone(null);
                    }}
                  >
                    변경
                  </Button>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  {new Date(selectedFeedback.createdAt).toLocaleString('ko-KR')}
                </p>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded">
                  {selectedFeedback.resumeText.substring(0, 150)}...
                </p>
              </div>
            </Card>

            {/* 말투 선택 UI */}
            <Card>
              <h3 className="text-lg font-bold text-gray-800 mb-4">
                2단계: 면접관 말투를 선택하세요
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                면접관이 질문할 때 사용할 말투를 선택해주세요.
              </p>
              
              <div className="space-y-3 mb-6">
                <button
                  onClick={() => setSelectedTone('friendly')}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedTone === 'friendly'
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">😊</span>
                    <div>
                      <p className="font-bold text-gray-800">친근하고 격려하는 톤</p>
                      <p className="text-sm text-gray-600">부담 없이 편하게 면접을 보고 싶어요</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedTone('professional')}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedTone === 'professional'
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">💼</span>
                    <div>
                      <p className="font-bold text-gray-800">전문적이고 명확한 톤</p>
                      <p className="text-sm text-gray-600">실전 같은 분위기에서 연습하고 싶어요</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setSelectedTone('formal')}
                  className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                    selectedTone === 'formal'
                      ? 'border-primary-600 bg-primary-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🎓</span>
                    <div>
                      <p className="font-bold text-gray-800">격식 있고 정중한 톤</p>
                      <p className="text-sm text-gray-600">격식을 갖춘 정중한 면접을 원해요</p>
                    </div>
                  </div>
                </button>
              </div>

              {/* 면접 시작 버튼 */}
              <Button
                fullWidth
                onClick={handleStartInterview}
                disabled={!selectedTone}
                className={!selectedTone ? 'opacity-50 cursor-not-allowed' : ''}
              >
                {selectedTone ? '🎯 면접 시작하기' : '말투를 선택해주세요'}
              </Button>
            </Card>
          </div>
        )}

        {generating && (
          <Card className="text-center py-12">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">면접 질문 생성 중...</h3>
            <p className="text-gray-600 mb-4">잠시만 기다려주세요...</p>
            <div className="animate-spin mx-auto w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
          </Card>
        )}

        {step === 'interview' && questions && (
          <InterviewUI 
            questions={questions} 
            onComplete={handleInterviewComplete}
            tonePreference={selectedTone || defaultTone}
          />
        )}

        {step === 'complete' && (
          <Card className="text-center py-12">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-gray-800 mb-4">
              모의 면접 완료!
            </h2>
            <p className="text-gray-600 mb-8">
              수고하셨습니다. 결과는 히스토리에서 확인하실 수 있습니다.
            </p>
            <div className="flex justify-center space-x-4">
              <Button onClick={() => router.push('/history')}>
                결과 보러 가기
              </Button>
              <Button variant="secondary" onClick={() => {
                setStep('select');
                setSelectedFeedback(null);
                setSelectedTone(null);
                setQuestions(null);
              }}>
                다시 연습하기
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}

