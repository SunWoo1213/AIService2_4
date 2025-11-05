'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import Navbar from '../components/Navbar';
import AudioRecorder from '../components/AudioRecorder';
import FeedbackDisplay from '../components/FeedbackDisplay';
import FeedbackRating from '../components/FeedbackRating';
import PreferenceSurvey from '../components/PreferenceSurvey';
import Loading from '../components/ui/Loading';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';

export default function VoiceFeedbackPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  // 상태 관리
  const [step, setStep] = useState('recording'); // recording, generating, result
  const [transcriptionId, setTranscriptionId] = useState(null);
  const [summary, setSummary] = useState('');
  const [sttResult, setSttResult] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [feedbackId, setFeedbackId] = useState(null);

  // 설문 모달
  const [showSurvey, setShowSurvey] = useState(false);
  const [surveyChecked, setSurveyChecked] = useState(false);

  // 로딩
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  // 초기 설문 체크
  useEffect(() => {
    const checkPreferences = async () => {
      if (!user || surveyChecked) return;

      try {
        const prefRef = doc(db, 'user_preferences', user.uid);
        const prefSnap = await getDoc(prefRef);

        if (!prefSnap.exists() || !prefSnap.data().first_survey_completed) {
          setShowSurvey(true);
        }
        setSurveyChecked(true);
      } catch (error) {
        console.error('설정 확인 오류:', error);
        setSurveyChecked(true);
      }
    };

    checkPreferences();
  }, [user, surveyChecked]);

  // 녹음 완료 핸들러 (Step 1 → Step 2)
  const handleRecordingComplete = (tid, sum, stt) => {
    setTranscriptionId(tid);
    setSummary(sum);
    setSttResult(stt);
    setStep('generating');
    generateFeedback(tid);
  };

  // 피드백 생성 (Step 2)
  const generateFeedback = async (tid) => {
    setGenerating(true);

    try {
      const response = await fetch('/api/feedback/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          transcriptionId: tid,
          userId: user.uid
        })
      });

      if (!response.ok) {
        throw new Error('피드백 생성 실패');
      }

      const result = await response.json();
      setFeedback(result.feedback);
      setFeedbackId(result.feedbackId);
      setStep('result');
    } catch (error) {
      console.error('피드백 생성 오류:', error);
      alert('피드백 생성 중 오류가 발생했습니다.');
      setStep('recording');
    } finally {
      setGenerating(false);
    }
  };

  // 다시 시작
  const handleReset = () => {
    setStep('recording');
    setTranscriptionId(null);
    setSummary('');
    setSttResult('');
    setFeedback(null);
    setFeedbackId(null);
  };

  // 설문 완료
  const handleSurveyComplete = () => {
    setShowSurvey(false);
  };

  if (authLoading || !surveyChecked) {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">음성 피드백</h1>
          <p className="text-gray-600">
            음성으로 자유롭게 말씀하시면, AI가 당신의 고민을 분석하고 맞춤 피드백을 제공합니다.
          </p>
        </div>

        {/* Step 1: 녹음 */}
        {step === 'recording' && (
          <AudioRecorder
            userId={user.uid}
            onComplete={handleRecordingComplete}
            onRetry={handleReset}
          />
        )}

        {/* Step 2: 피드백 생성 중 */}
        {step === 'generating' && (
          <Card>
            <div className="text-center py-12">
              <Loading size="lg" text="AI가 피드백을 생성하고 있어요..." />
              <p className="text-gray-500 text-sm mt-4">
                "{summary}"를 바탕으로 맞춤 조언을 준비 중입니다
              </p>
            </div>
          </Card>
        )}

        {/* Step 3: 결과 표시 */}
        {step === 'result' && feedback && (
          <>
            <FeedbackDisplay feedback={feedback} isStructured={true} />

            {/* 평가 섹션 */}
            <div className="mt-8">
              <FeedbackRating
                feedbackId={feedbackId}
                userId={user.uid}
                onRatingComplete={(rating, reason) => {
                  console.log('평가 완료:', rating, reason);
                }}
              />
            </div>

            {/* 다시 시작 버튼 */}
            <div className="mt-8 flex gap-4">
              <Button onClick={handleReset} variant="secondary" fullWidth>
                새로운 피드백 받기
              </Button>
              <Button onClick={() => router.push('/history')} fullWidth>
                히스토리 보기
              </Button>
            </div>
          </>
        )}
      </main>

      {/* 초기 설문 모달 */}
      {showSurvey && (
        <PreferenceSurvey
          userId={user.uid}
          isOpen={showSurvey}
          onComplete={handleSurveyComplete}
        />
      )}
    </div>
  );
}

