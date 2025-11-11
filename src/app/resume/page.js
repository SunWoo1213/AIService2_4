'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebase/config';
import Navbar from '../components/Navbar';
import JobUploader from '../components/JobUploader';
import ResumeEditor from '../components/ResumeEditor';
import Loading from '../components/ui/Loading';

export default function ResumeFeedbackPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [jobKeywords, setJobKeywords] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchProfile = async () => {
      if (!user) return;

      try {
        const docRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setUserProfile(docSnap.data());
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchProfile();
  }, [user]);

  const handleJobAnalysisComplete = (analysis) => {
    setJobKeywords(analysis);
    setStep(2);
  };

  const handleResumeSubmit = async (resumeText) => {
    try {
      const response = await fetch('/api/resume/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jobKeywords,
          resumeText,
          userProfile,
          userId: user.uid
        }),
      });

      if (!response.ok) {
        throw new Error('피드백 요청 실패');
      }

      const result = await response.json();
      router.push(`/feedback/${result.id}`);
    } catch (error) {
      console.error('Resume submission error:', error);
      alert('피드백 생성 중 오류가 발생했습니다.');
    }
  };

  if (loading || loadingData) {
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">자기소개서 피드백</h1>
          <p className="text-gray-600">
            채용 공고를 분석하고 자기소개서에 대한 AI 피드백을 받아보세요.
          </p>
        </div>

        {!userProfile && (
          <div className="mb-6 p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-lg">
            <p className="font-medium">프로필을 먼저 설정하면 더 정확한 피드백을 받을 수 있습니다.</p>
            <button
              onClick={() => router.push('/profile')}
              className="mt-2 text-sm underline hover:no-underline"
            >
              프로필 설정하기
            </button>
          </div>
        )}

        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4">
            <div className={`flex items-center ${step >= 1 ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                step >= 1 ? 'bg-primary-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                1
              </div>
              <span className="ml-2 font-medium">채용공고 분석</span>
            </div>
            <div className="w-16 h-1 bg-gray-300"></div>
            <div className={`flex items-center ${step >= 2 ? 'text-primary-600' : 'text-gray-400'}`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                step >= 2 ? 'bg-primary-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                2
              </div>
              <span className="ml-2 font-medium">자기소개서 작성</span>
            </div>
          </div>
        </div>

        {step === 1 && (
          <JobUploader onAnalysisComplete={handleJobAnalysisComplete} />
        )}

        {step === 2 && (
          <div>
            <button
              onClick={() => setStep(1)}
              className="mb-4 text-primary-600 hover:text-primary-700 font-medium"
            >
              ← 채용 공고 다시 입력
            </button>
            <ResumeEditor jobKeywords={jobKeywords} onSubmit={handleResumeSubmit} />
          </div>
        )}
      </main>
    </div>
  );
}




