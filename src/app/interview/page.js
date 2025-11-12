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
  const [step, setStep] = useState('select'); // 'select', 'configure', 'interview'
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
      // ===== [디버깅] ID 값 확인 =====
      console.log('========================================');
      console.log('[면접 페이지] fetchPastFeedbacks 실행');
      console.log('[면접 페이지] - user 존재:', !!user);
      console.log('[면접 페이지] - user.uid:', user?.uid || '(undefined)');
      console.log('========================================');
      
      if (!user) {
        console.warn('[면접 페이지] ⚠️ user가 없어서 데이터 조회를 건너뜁니다.');
        return;
      }

      try {
        // 사용자 기본 말투 설정 불러오기
        const preferencesResponse = await fetch(`/api/user/preferences?userId=${user.uid}`);
        if (preferencesResponse.ok) {
          const preferencesData = await preferencesResponse.json();
          setDefaultTone(preferencesData.tone_preference || 'friendly');
          console.log('[면접 페이지] ✅ 기본 말투 설정 불러옴:', preferencesData.tone_preference);
        }

        // ===== [디버깅] 쿼리 조건 확인 =====
        console.log('[면접 페이지] 🔍 Firestore 데이터 조회 시작');
        console.log('[면접 페이지] - 컬렉션 경로: feedbacks');
        console.log('[면접 페이지] - 쿼리 조건 1: userId == ' + user.uid);
        console.log('[면접 페이지] - 쿼리 조건 2: type == resume');
        
        const feedbacksRef = collection(db, 'feedbacks');
        const q = query(
          feedbacksRef,
          where('userId', '==', user.uid),
          where('type', '==', 'resume')
        );
        
        console.log('[면접 페이지] ✅ 쿼리 생성 성공, getDocs 실행...');
        const querySnapshot = await getDocs(q);
        
        // ===== [디버깅] 스냅샷 로그 =====
        console.log('========================================');
        console.log('[면접 페이지] 📥 getDocs 결과');
        console.log('[면접 페이지] - 스냅샷 비어있음:', querySnapshot.empty);
        console.log('[면접 페이지] - 문서 개수:', querySnapshot.size);
        
        const feedbacks = [];
        querySnapshot.forEach((doc) => {
          console.log('[면접 페이지] 📄 문서 ID:', doc.id);
          feedbacks.push({ id: doc.id, ...doc.data() });
        });
        
        console.log('[면접 페이지] ✅ 총', feedbacks.length, '개의 자기소개서 피드백 로드됨');
        console.log('========================================');
        
        setPastFeedbacks(feedbacks);
      } catch (error) {
        // ===== [디버깅] 에러 핸들링 강화 =====
        console.error('========================================');
        console.error('[면접 페이지] ❌ 피드백 조회 에러 발생!');
        console.error('[면접 페이지] - 에러 객체:', error);
        console.error('[면접 페이지] - error.code:', error.code);
        console.error('[면접 페이지] - error.message:', error.message);
        
        if (error.code === 'permission-denied') {
          console.error('[면접 페이지] 🔍 원인: Firestore Rules 권한 거부');
          console.error('[면접 페이지] - 현재 user.uid:', user.uid);
        } else if (error.code === 'failed-precondition' || error.message.includes('index')) {
          console.error('[면접 페이지] 🔍 원인: Firestore 인덱스 누락');
          const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
          if (indexUrlMatch) {
            console.error('[면접 페이지] 🔗 인덱스 생성 링크:', indexUrlMatch[0]);
          }
        }
        console.error('========================================');
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
      // 첫 질문 하나만 받아오기
      const response = await fetch('/api/interview/generate-questions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobKeywords: selectedFeedback.jobKeywords,
          resumeText: selectedFeedback.resumeText,
          tonePreference: selectedTone, // 선택한 말투 전달
          questionCount: 0 // 첫 질문
        }),
      });

      if (!response.ok) {
        throw new Error('질문 생성 실패');
      }

      const data = await response.json();
      // 단일 질문을 배열로 감싸서 전달 (기존 InterviewUI 인터페이스 유지)
      setQuestions([data.question]);
      setStep('interview');
    } catch (error) {
      console.error('Question generation error:', error);
      alert('질문 생성 중 오류가 발생했습니다.');
    } finally {
      setGenerating(false);
    }
  };

  const handleInterviewComplete = async (interviewId) => {
    try {
      // ===== [히스토리 저장] 면접 세션 요약을 feedbacks 컬렉션에 저장 =====
      console.log('========================================');
      console.log('[면접 완료] handleInterviewComplete 실행');
      console.log('[면접 완료] - interviewId:', interviewId);
      console.log('[면접 완료] - userId:', user.uid);
      console.log('[면접 완료] - 현재 시각:', new Date().toISOString());
      console.log('========================================');
      
      // Feedbacks 컬렉션에 면접 세션 요약 저장
      console.log('[면접 완료] 💾 feedbacks 컬렉션에 저장 시작...');
      
      const interviewSummary = {
        userId: user.uid,
        type: 'interview',
        interviewId: interviewId, // 고유한 면접 세션 ID
        resumeText: selectedFeedback?.resumeText || '',
        jobKeywords: selectedFeedback?.jobKeywords || {},
        tonePreference: selectedTone || defaultTone,
        createdAt: new Date().toISOString(),
        timestamp: new Date()
      };
      
      console.log('[면접 완료] 📝 저장할 데이터:', {
        userId: interviewSummary.userId,
        type: interviewSummary.type,
        interviewId: interviewSummary.interviewId,
        tonePreference: interviewSummary.tonePreference,
        createdAt: interviewSummary.createdAt
      });
      
      const docRef = await addDoc(collection(db, 'feedbacks'), interviewSummary);
      
      console.log('========================================');
      console.log('[면접 완료] ✅✅✅ feedbacks 컬렉션 저장 성공! ✅✅✅');
      console.log('[면접 완료] - 저장된 문서 ID:', docRef.id);
      console.log('[면접 완료] - 컬렉션:', 'feedbacks');
      console.log('[면접 완료] - 타입:', 'interview');
      console.log('[면접 완료] 💡 이제 히스토리 페이지에서 이 면접을 볼 수 있습니다!');
      console.log('========================================');
      
      // 결과 페이지로 리다이렉트
      console.log('========================================');
      console.log('[면접 완료] 🚀 결과 페이지로 리다이렉트 준비');
      console.log('[면접 완료] - 리다이렉트 URL:', `/interview/result/${interviewId}`);
      console.log('[면접 완료] - interviewId 확인:', interviewId);
      console.log('[면접 완료] - interviewId 타입:', typeof interviewId);
      console.log('[면접 완료] - interviewId 길이:', interviewId?.length || 0);
      console.log('[면접 완료] 💡 결과 페이지에서 이 ID로 데이터를 조회할 것입니다.');
      console.log('========================================');
      
      router.push(`/interview/result/${interviewId}`);
    } catch (error) {
      console.error('========================================');
      console.error('[면접 완료] ❌❌❌ 에러 발생! ❌❌❌');
      console.error('[면접 완료] - 에러 객체:', error);
      console.error('[면접 완료] - error.code:', error.code);
      console.error('[면접 완료] - error.message:', error.message);
      console.error('[면접 완료] - error.name:', error.name);
      
      if (error.code === 'permission-denied') {
        console.error('[면접 완료] 🔍 원인: Firestore Rules 권한 거부');
        console.error('[면접 완료] - 현재 user.uid:', user.uid);
        console.error('[면접 완료] 💡 해결방법: Firestore Rules에서 feedbacks write 권한 확인');
      }
      console.error('========================================');
      
      // 에러가 발생해도 결과 페이지로 이동 (면접 답변은 이미 저장됨)
      console.warn('========================================');
      console.warn('[면접 완료] ⚠️ feedbacks 저장 실패했지만 결과 페이지로 이동합니다.');
      console.warn('[면접 완료] - 리다이렉트 URL:', `/interview/result/${interviewId}`);
      console.warn('[면접 완료] - interviewId:', interviewId);
      console.warn('[면접 완료] 💡 면접 답변은 이미 interview_answers에 저장되어 있습니다.');
      console.warn('========================================');
      
      router.push(`/interview/result/${interviewId}`);
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
                  type="button"
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
                  type="button"
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
                  type="button"
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

        {step === 'interview' && questions && selectedFeedback && user && (
          <InterviewUI 
            userId={user.uid}
            initialQuestion={questions[0]}
            jobKeywords={selectedFeedback.jobKeywords}
            resumeText={selectedFeedback.resumeText}
            onComplete={handleInterviewComplete}
            tonePreference={selectedTone || defaultTone}
          />
        )}

      </main>
    </div>
  );
}

