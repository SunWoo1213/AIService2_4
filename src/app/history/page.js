'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { db } from '@/firebase/config';
import Navbar from '../components/Navbar';
import HistoryList from '../components/HistoryList';
import Button from '../components/ui/Button';
import Loading from '../components/ui/Loading';

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('resume');
  const [feedbacks, setFeedbacks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    const fetchFeedbacks = async () => {
      // ===== [디버깅 2단계] ID 값 확인 =====
      console.log('========================================');
      console.log('[히스토리 페이지] fetchFeedbacks 실행');
      console.log('[히스토리 페이지] - user 존재:', !!user);
      console.log('[히스토리 페이지] - user.uid:', user?.uid || '(undefined)');
      console.log('========================================');
      
      if (!user) {
        console.warn('[히스토리 페이지] ⚠️ user가 없어서 데이터 조회를 건너뜁니다.');
        return;
      }

      try {
        // ===== [5대 컬렉션] interview_sessions 조회 =====
        console.log('[히스토리 페이지] 🔍 Firestore 데이터 조회 시작');
        console.log('[히스토리 페이지] - 컬렉션 경로: interview_sessions (5대 컬렉션)');
        console.log('[히스토리 페이지] - 쿼리 조건: userId == ' + user.uid);
        console.log('[히스토리 페이지] - 정렬 조건: createdAt desc');
        
        const sessionsRef = collection(db, 'interview_sessions');
        const q = query(
          sessionsRef,
          where('userId', '==', user.uid),
          orderBy('createdAt', 'desc')
        );
        
        console.log('[히스토리 페이지] ✅ 쿼리 생성 성공, getDocs 실행...');
        const querySnapshot = await getDocs(q);
        
        // ===== [디버깅 2단계] 스냅샷 로그 =====
        console.log('========================================');
        console.log('[히스토리 페이지] 📥 getDocs 결과');
        console.log('[히스토리 페이지] - 스냅샷 비어있음:', querySnapshot.empty);
        console.log('[히스토리 페이지] - 문서 개수:', querySnapshot.size);
        
        const feedbackList = [];
        querySnapshot.forEach((doc) => {
          console.log('[히스토리 페이지] 📄 문서 ID:', doc.id);
          console.log('[히스토리 페이지] - doc.exists():', doc.exists());
          const data = doc.data();
          console.log('[히스토리 페이지] - status:', data.status);
          console.log('[히스토리 페이지] - questionCount:', data.questionCount);
          
          // interview_sessions는 모두 면접 데이터이므로 type 필드 추가 (호환성)
          feedbackList.push({ 
            id: doc.id, 
            type: 'interview', // HistoryList 컴포넌트 호환성
            interviewId: doc.id,
            ...data 
          });
        });
        
        console.log('[히스토리 페이지] ✅ 총', feedbackList.length, '개의 면접 세션 로드됨 (5대 컬렉션)');
        
        // ===== [5대 컬렉션] 첫 번째 세션 구조 출력 =====
        if (feedbackList.length > 0) {
          console.log('========================================');
          console.log('[5대 컬렉션] 📋 첫 번째 interview_session:');
          const firstSession = feedbackList[0];
          console.log('[5대 컬렉션] - 문서 ID:', firstSession.id);
          console.log('[5대 컬렉션] - interviewId:', firstSession.interviewId);
          console.log('[5대 컬렉션] - status:', firstSession.status);
          console.log('[5대 컬렉션] - questionCount:', firstSession.questionCount);
          console.log('[5대 컬렉션] - questions 개수:', firstSession.questions?.length);
          console.log('[5대 컬렉션] 💡 평가는 interview_evaluations에서 별도 조회됩니다.');
          console.log('========================================');
        } else {
          console.warn('[히스토리 페이지] ⚠️ 경고: 면접 세션 데이터가 0개입니다!');
        }
        console.log('========================================');
        
        setFeedbacks(feedbackList);
      } catch (error) {
        // ===== [디버깅 3단계] 에러 핸들링 강화 =====
        console.error('========================================');
        console.error('[히스토리 페이지] ❌❌❌ getDocs 에러 발생! ❌❌❌');
        console.error('[히스토리 페이지] - 에러 객체:', error);
        console.error('[히스토리 페이지] - error.code:', error.code);
        console.error('[히스토리 페이지] - error.message:', error.message);
        console.error('[히스토리 페이지] - error.name:', error.name);
        
        // ===== [디버깅 2단계] 인덱스 에러 검출 =====
        if (error.code === 'failed-precondition' || error.message.includes('index') || error.message.includes('requires an index')) {
          console.error('[히스토리 페이지] 🔍 원인: Firestore 복합 인덱스 누락!');
          console.error('[히스토리 페이지] 💡 해결방법:');
          console.error('[히스토리 페이지]   1. 아래 링크를 클릭하여 인덱스 자동 생성');
          console.error('[히스토리 페이지]   2. 또는 Firebase Console → Firestore → Indexes에서 수동 생성');
          console.error('[히스토리 페이지]   3. 인덱스 필드: userId (ASC) + createdAt (DESC)');
          
          // 인덱스 생성 링크 추출
          const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
          if (indexUrlMatch) {
            console.error('[히스토리 페이지] 🔗🔗🔗 인덱스 생성 링크 (클릭하세요!): 🔗🔗🔗');
            console.error(indexUrlMatch[0]);
          }
          
          console.error('[히스토리 페이지] ⏳ orderBy 없이 재시도 중...');
        } else if (error.code === 'permission-denied') {
          console.error('[히스토리 페이지] 🔍 원인: Firestore Rules 권한 거부');
          console.error('[히스토리 페이지] - 현재 user.uid:', user.uid);
        }
        console.error('========================================');
        
        // ===== [디버깅 2단계] orderBy 폴백 처리 =====
        try {
          console.log('[히스토리 페이지] 🔄 Fallback: orderBy 없이 재시도');
          
          const feedbacksRef = collection(db, 'feedbacks');
          const q = query(
            feedbacksRef,
            where('userId', '==', user.uid)
          );
          
          console.log('[히스토리 페이지] ✅ 간단한 쿼리 생성 성공');
          const querySnapshot = await getDocs(q);
          
          console.log('[히스토리 페이지] 📥 Fallback getDocs 결과:', querySnapshot.size, '개');
          
          const feedbackList = [];
          querySnapshot.forEach((doc) => {
            feedbackList.push({ id: doc.id, ...doc.data() });
          });
          
          // 클라이언트 측에서 정렬
          feedbackList.sort((a, b) => {
            return new Date(b.createdAt) - new Date(a.createdAt);
          });
          
          console.log('[히스토리 페이지] ✅ 클라이언트 측 정렬 완료:', feedbackList.length, '개');
          setFeedbacks(feedbackList);
        } catch (innerError) {
          // ===== [디버깅 3단계] 폴백 에러 핸들링 =====
          console.error('========================================');
          console.error('[히스토리 페이지] ❌❌❌ Fallback도 실패! ❌❌❌');
          console.error('[히스토리 페이지] - 에러 객체:', innerError);
          console.error('[히스토리 페이지] - error.code:', innerError.code);
          console.error('[히스토리 페이지] - error.message:', innerError.message);
          
          if (innerError.code === 'permission-denied') {
            console.error('[히스토리 페이지] 🔍 원인: Firestore Rules 권한 거부');
            console.error('[히스토리 페이지] 💡 해결방법:');
            console.error('[히스토리 페이지]   1. Firebase Console → Firestore Database → Rules');
            console.error('[히스토리 페이지]   2. feedbacks 컬렉션의 read 권한 확인');
            console.error('[히스토리 페이지]   3. 규칙 예시:');
            console.error('[히스토리 페이지]      match /feedbacks/{document} {');
            console.error('[히스토리 페이지]        allow read: if request.auth.uid == resource.data.userId;');
            console.error('[히스토리 페이지]      }');
          }
          console.error('========================================');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchFeedbacks();
  }, [user]);

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

  const resumeFeedbacks = feedbacks.filter(f => f.type === 'resume');
  const interviewFeedbacks = feedbacks.filter(f => f.type === 'interview');

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">히스토리</h1>
          <p className="text-gray-600">
            지금까지 받은 모든 피드백을 확인하고 복습하세요.
          </p>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <div className="text-4xl mb-2">📊</div>
            <h3 className="text-2xl font-bold text-gray-800">{feedbacks.length}</h3>
            <p className="text-gray-600">총 활동</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <div className="text-4xl mb-2">📄</div>
            <h3 className="text-2xl font-bold text-gray-800">{resumeFeedbacks.length}</h3>
            <p className="text-gray-600">자기소개서 첨삭</p>
          </div>
          <div className="bg-white rounded-xl shadow-md p-6 text-center">
            <div className="text-4xl mb-2">🎤</div>
            <h3 className="text-2xl font-bold text-gray-800">{interviewFeedbacks.length}</h3>
            <p className="text-gray-600">모의 면접</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <div className="flex space-x-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('resume')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'resume'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              자기소개서 피드백 ({resumeFeedbacks.length})
            </button>
            <button
              onClick={() => setActiveTab('interview')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'interview'
                  ? 'text-primary-600 border-b-2 border-primary-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              모의 면접 피드백 ({interviewFeedbacks.length})
            </button>
          </div>
        </div>

        {/* Content */}
        {feedbacks.length === 0 ? (
          <div className="bg-white rounded-xl shadow-md p-12 text-center">
            <div className="text-6xl mb-4">📭</div>
            <h3 className="text-2xl font-bold text-gray-800 mb-4">
              아직 활동 내역이 없습니다
            </h3>
            <p className="text-gray-600 mb-6">
              자기소개서 첨삭이나 모의 면접을 시작해보세요!
            </p>
            <div className="flex justify-center space-x-4">
              <Button onClick={() => router.push('/new-feedback')}>
                자기소개서 첨삭받기
              </Button>
              <Button variant="secondary" onClick={() => router.push('/interview')}>
                모의 면접 시작하기
              </Button>
            </div>
          </div>
        ) : (
          <HistoryList feedbacks={feedbacks} type={activeTab} />
        )}
      </main>
    </div>
  );
}

