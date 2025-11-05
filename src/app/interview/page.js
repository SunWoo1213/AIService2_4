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
  const [step, setStep] = useState('select'); // 'select', 'interview', 'complete'
  const [pastFeedbacks, setPastFeedbacks] = useState([]);
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tonePreference, setTonePreference] = useState('friendly'); // 말투 설정

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchPastFeedbacks = async () => {
      if (!user) return;

      try {
        // 사용자 말투 설정 불러오기
        const preferencesResponse = await fetch(`/api/user/preferences?userId=${user.uid}`);
        if (preferencesResponse.ok) {
          const preferencesData = await preferencesResponse.json();
          setTonePreference(preferencesData.tone_preference || 'friendly');
          console.log('말투 설정 불러옴:', preferencesData.tone_preference);
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

  const handleSelectFeedback = async (feedback) => {
    setSelectedFeedback(feedback);
    setGenerating(true);

    try {
      const response = await fetch('/api/interview/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobKeywords: feedback.jobKeywords,
          resumeText: feedback.resumeText
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
                  면접 기반이 될 자기소개서를 선택하세요
                </h2>
                <div className="space-y-4">
                  {pastFeedbacks.map((feedback) => (
                    <Card key={feedback.id} hover onClick={() => handleSelectFeedback(feedback)}>
                      <div className="flex justify-between items-center">
                        <div>
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

        {generating && (
          <Card className="text-center py-12">
            <div className="text-4xl mb-4">✨</div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">면접 질문 생성 중...</h3>
            <div className="animate-spin mx-auto w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
          </Card>
        )}

        {step === 'interview' && questions && (
          <InterviewUI 
            questions={questions} 
            onComplete={handleInterviewComplete}
            tonePreference={tonePreference}
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

