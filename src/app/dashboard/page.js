'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import Navbar from '../components/Navbar';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Loading from '../components/ui/Loading';

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ resumeCount: 0, interviewCount: 0 });
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;

      try {
        // Fetch profile
        const profileDoc = await getDoc(doc(db, 'users', user.uid));
        if (profileDoc.exists()) {
          setProfile(profileDoc.data());
        }

        // Fetch stats
        const feedbacksRef = collection(db, 'feedbacks');
        const resumeQuery = query(
          feedbacksRef,
          where('userId', '==', user.uid),
          where('type', '==', 'resume')
        );
        const interviewQuery = query(
          feedbacksRef,
          where('userId', '==', user.uid),
          where('type', '==', 'interview')
        );

        const [resumeSnap, interviewSnap] = await Promise.all([
          getDocs(resumeQuery),
          getDocs(interviewQuery)
        ]);

        setStats({
          resumeCount: resumeSnap.size,
          interviewCount: interviewSnap.size
        });
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchData();
  }, [user]);

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
      
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            반갑습니다, {user.email}님! 👋
          </h1>
          <p className="text-gray-600">
            AI와 함께 취업 준비를 시작해보세요.
          </p>
        </div>

        {!profile && (
          <div className="mb-6 p-4 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded-lg">
            <p className="font-medium">프로필을 먼저 설정해주세요!</p>
            <p className="text-sm mt-1">프로필 정보를 입력하면 더 정확한 AI 피드백을 받을 수 있습니다.</p>
            <Button 
              onClick={() => router.push('/profile')} 
              variant="outline" 
              className="mt-3 border-yellow-600 text-yellow-800 hover:bg-yellow-50"
            >
              프로필 설정하기
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="text-center">
            <div className="text-4xl mb-4">📄</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">{stats.resumeCount}</h3>
            <p className="text-gray-600">자기소개서 피드백</p>
          </Card>

          <Card className="text-center">
            <div className="text-4xl mb-4">🎤</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">{stats.interviewCount}</h3>
            <p className="text-gray-600">모의 면접 완료</p>
          </Card>

          <Card className="text-center">
            <div className="text-4xl mb-4">✅</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">{stats.resumeCount + stats.interviewCount}</h3>
            <p className="text-gray-600">총 활동 수</p>
          </Card>
        </div>

        {/* 2개의 핵심 기능 - 큰 카드 */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6">취업 준비 시작하기</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card hover onClick={() => router.push('/interview')} className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-primary-200">
              <div className="text-center py-6">
                <div className="text-6xl mb-4">🎤</div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">모의 면접</h3>
                <p className="text-gray-600 mb-6">
                  실전 같은 AI 모의 면접으로 답변 능력을 향상시키세요.<br />
                  질문을 듣고 음성으로 답변하면 즉시 피드백을 받을 수 있습니다.
                </p>
                <Button fullWidth className="bg-primary-600 hover:bg-primary-700 text-lg py-3">
                  모의 면접 시작하기 →
                </Button>
              </div>
            </Card>

            <Card hover onClick={() => router.push('/resume')} className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200">
              <div className="text-center py-6">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">자기소개서 피드백</h3>
                <p className="text-gray-600 mb-6">
                  채용 공고를 분석하고 자기소개서를 첨삭해드립니다.<br />
                  AI가 구체적이고 실용적인 개선점을 제안합니다.
                </p>
                <Button fullWidth className="bg-green-600 hover:bg-green-700 text-lg py-3">
                  자기소개서 피드백 받기 →
                </Button>
              </div>
            </Card>
          </div>
        </div>

        {/* 부가 기능 - 작은 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card hover onClick={() => router.push('/history')}>
            <div className="flex items-center mb-4">
              <div className="text-4xl mr-4">📊</div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">히스토리</h3>
                <p className="text-gray-600 text-sm">지난 피드백들을 확인하고 복습하세요</p>
              </div>
            </div>
            <Button fullWidth variant="secondary">보기</Button>
          </Card>

          <Card hover onClick={() => router.push('/profile')}>
            <div className="flex items-center mb-4">
              <div className="text-4xl mr-4">👤</div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">프로필 관리</h3>
                <p className="text-gray-600 text-sm">내 정보를 업데이트하세요</p>
              </div>
            </div>
            <Button fullWidth variant="secondary">설정</Button>
          </Card>
        </div>
      </main>
    </div>
  );
}

