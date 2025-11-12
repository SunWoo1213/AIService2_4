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
  
  // ===== [세트 기반] 종합 피드백 State 추가 =====
  const [overallFeedback, setOverallFeedback] = useState(null);
  const [feedbackLoading, setFeedbackLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    // ===== [진단] 상세 로깅 추가 =====
    console.log('========================================');
    console.log('[결과 페이지] useEffect 실행');
    console.log('[결과 페이지] 🕐 현재 시각:', new Date().toISOString());
    console.log('========================================');
    
    // ===== [진단 1단계] Auth 상태 확인 =====
    console.log('[진단] Auth 상태:');
    console.log('[진단] - Auth Loading:', authLoading);
    console.log('[진단] - Auth User:', user ? '존재함 ✓' : '없음 ✗');
    console.log('[진단] - Auth User UID:', user?.uid || '(undefined)');
    console.log('[진단] - Auth User Email:', user?.email || '(undefined)');
    
    // ===== [진단 2단계] URL 파라미터 확인 =====
    console.log('[진단] URL 파라미터:');
    console.log('[진단] - params 객체:', params);
    console.log('[진단] - Extracted interviewId:', interviewId || '(undefined)');
    console.log('[진단] - interviewId 타입:', typeof interviewId);
    console.log('[진단] - interviewId 길이:', interviewId?.length || 0);
    console.log('[진단] - 현재 URL:', typeof window !== 'undefined' ? window.location.href : 'SSR');
    
    // ===== [진단 3단계] 데이터 타입 확인 =====
    console.log('[진단] 데이터 타입:');
    console.log('[진단] - userType:', typeof user);
    console.log('[진단] - uidType:', typeof user?.uid);
    console.log('[진단] - interviewIdType:', typeof interviewId);
    console.log('========================================');
    
    // ===== [수정] Auth 로딩 대기 처리 =====
    if (authLoading) {
      console.log('[결과 페이지] ⏳ Auth 로딩 중... 대기합니다.');
      console.log('[결과 페이지] 💡 로딩이 끝나면 자동으로 데이터를 조회합니다.');
      return;
    }
    
    // ===== [진단] user 없음 체크 =====
    if (!user) {
      console.warn('========================================');
      console.warn('[결과 페이지] ⚠️⚠️⚠️ user가 없습니다! ⚠️⚠️⚠️');
      console.warn('[결과 페이지] 가능한 원인:');
      console.warn('[결과 페이지] 1. 로그인하지 않음');
      console.warn('[결과 페이지] 2. 세션 만료');
      console.warn('[결과 페이지] 3. Firebase Auth 초기화 실패');
      console.warn('[결과 페이지] 💡 메인 페이지로 리다이렉트됩니다.');
      console.warn('========================================');
      return;
    }
    
    // ===== [진단] interviewId 없음 체크 =====
    if (!interviewId) {
      console.error('========================================');
      console.error('[결과 페이지] ❌❌❌ interviewId가 없습니다! ❌❌❌');
      console.error('[결과 페이지] 가능한 원인:');
      console.error('[결과 페이지] 1. URL 파라미터 누락: /interview/result/[없음]');
      console.error('[결과 페이지] 2. 잘못된 리다이렉트: router.push 확인 필요');
      console.error('[결과 페이지] 3. 동적 라우트 설정 오류');
      console.error('[결과 페이지] 💡 현재 URL을 확인하세요!');
      if (typeof window !== 'undefined') {
        console.error('[결과 페이지] 📍 현재 URL:', window.location.href);
        console.error('[결과 페이지] 📍 pathname:', window.location.pathname);
      }
      console.error('========================================');
      setError('면접 ID를 찾을 수 없습니다. URL을 확인해주세요.');
      setLoading(false);
      return;
    }
    
    // ===== [성공] 모든 조건 충족 =====
    console.log('========================================');
    console.log('[결과 페이지] ✅✅✅ 모든 조건 충족! ✅✅✅');
    console.log('[결과 페이지] - user.uid:', user.uid);
    console.log('[결과 페이지] - interviewId:', interviewId);
    console.log('[결과 페이지] 🚀 Firestore 데이터 조회를 시작합니다!');
    console.log('========================================');

    // ===== [디버깅 1단계] Firestore 경로 확인 =====
    console.log('[결과 페이지] 🔍 Firestore 데이터 조회 시작');
    console.log('[결과 페이지] - 컬렉션 경로: interview_answers');
    console.log('[결과 페이지] - 쿼리 조건 1: userId == ' + user.uid);
    console.log('[결과 페이지] - 쿼리 조건 2: interviewId == ' + interviewId);
    console.log('[결과 페이지] - 정렬 조건: questionIndex asc');
    console.log('[결과 페이지] 💡 변경사항: interview_answers → answer_evaluations 컬렉션 사용');

    // [3개 컬렉션 분리] answer_evaluations에서 개별 답변 조회
    const answersRef = collection(db, 'answer_evaluations');
    
    try {
      const q = query(
        answersRef,
        where('userId', '==', user.uid),
        where('interviewId', '==', interviewId),
        orderBy('questionIndex', 'asc') // 💡 questionIndex로 정렬 (1, 2, 3, 4, 5)
      );

      console.log('[결과 페이지] ✅ 쿼리 생성 성공, onSnapshot 구독 시작...');

      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          // ===== [디버깅 1단계] 스냅샷 로그 =====
          console.log('========================================');
          console.log('[결과 페이지] 📥 onSnapshot 콜백 실행');
          console.log('[결과 페이지] - 스냅샷 비어있음:', querySnapshot.empty);
          console.log('[결과 페이지] - 문서 개수:', querySnapshot.size);
          console.log('[결과 페이지] - 문서 메타데이터:', {
            fromCache: querySnapshot.metadata.fromCache,
            hasPendingWrites: querySnapshot.metadata.hasPendingWrites
          });
          
          const answersData = [];
          querySnapshot.forEach((doc) => {
            console.log('[결과 페이지] 📄 문서 ID:', doc.id);
            console.log('[결과 페이지] - doc.exists():', doc.exists());
            console.log('[결과 페이지] - doc.data():', doc.data());
            
            answersData.push({ id: doc.id, ...doc.data() });
          });
          
          console.log('[결과 페이지] ✅ 총', answersData.length, '개의 답변 데이터 로드됨');
          if (answersData.length > 0) {
            console.log('[결과 페이지] - 첫 번째 답변 샘플:', {
              id: answersData[0].id,
              questionId: answersData[0].questionId,
              hasFeedback: !!answersData[0].feedback,
              hasTranscript: !!answersData[0].transcript,
              hasAudioURL: !!answersData[0].audioURL
            });
          } else {
            console.warn('[결과 페이지] ⚠️ 경고: 답변 데이터가 0개입니다!');
            console.warn('[결과 페이지] 💡 확인 사항:');
            console.warn('[결과 페이지]   1. Firestore에 interview_answers 컬렉션이 존재하는가?');
            console.warn('[결과 페이지]   2. userId와 interviewId가 일치하는 문서가 있는가?');
            console.warn('[결과 페이지]   3. Firestore Rules에서 read 권한이 있는가?');
          }
          console.log('========================================');
          
          setAnswers(answersData);
          setLoading(false);
        },
        (error) => {
          // ===== [디버깅 3단계] 에러 핸들링 강화 =====
          console.error('========================================');
          console.error('[결과 페이지] ❌❌❌ onSnapshot 에러 발생! ❌❌❌');
          console.error('[결과 페이지] - 에러 객체:', error);
          console.error('[결과 페이지] - error.code:', error.code);
          console.error('[결과 페이지] - error.message:', error.message);
          console.error('[결과 페이지] - error.name:', error.name);
          
          // 에러 타입별 원인 분석
          if (error.code === 'permission-denied') {
            console.error('[결과 페이지] 🔍 원인: Firestore Rules 권한 거부');
            console.error('[결과 페이지] 💡 해결방법:');
            console.error('[결과 페이지]   1. Firebase Console → Firestore Database → Rules');
            console.error('[결과 페이지]   2. interview_answers 컬렉션의 read 권한 확인');
            console.error('[결과 페이지]   3. userId 일치 여부 확인');
            console.error('[결과 페이지] - 현재 user.uid:', user.uid);
            console.error('[결과 페이지] - 현재 interviewId:', interviewId);
          } else if (error.code === 'failed-precondition' || error.message.includes('index')) {
            console.error('[결과 페이지] 🔍 원인: Firestore 인덱스 누락');
            console.error('[결과 페이지] 💡 해결방법:');
            console.error('[결과 페이지]   1. 아래 링크를 클릭하여 인덱스 생성');
            console.error('[결과 페이지]   2. 또는 Firebase Console에서 수동 생성');
            
            // 인덱스 생성 링크가 에러 메시지에 포함되어 있으면 추출
            const indexUrlMatch = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/);
            if (indexUrlMatch) {
              console.error('[결과 페이지] 🔗 인덱스 생성 링크:', indexUrlMatch[0]);
            }
          } else if (error.code === 'unavailable') {
            console.error('[결과 페이지] 🔍 원인: 네트워크 연결 문제');
            console.error('[결과 페이지] 💡 해결방법: 인터넷 연결 상태 확인');
          } else {
            console.error('[결과 페이지] 🔍 원인: 알 수 없는 에러');
            console.error('[결과 페이지] 💡 해결방법: 위 에러 메시지를 확인하세요');
          }
          console.error('========================================');
          
          setError(`답변 데이터를 불러오는 중 오류가 발생했습니다. (${error.code || 'UNKNOWN'})`);
          setLoading(false);
        }
      );

      // ===== [세트 기반] feedbacks 컬렉션에서 종합 피드백 조회 =====
      console.log('========================================');
      console.log('[3단계 확인] 종합 피드백 조회 시작');
      console.log('[3단계 확인] 📡 feedbacks 컬렉션 조회');
      console.log('[3단계 확인] - 컬렉션: feedbacks');
      console.log('[3단계 확인] - 조건: userId == ' + user.uid);
      console.log('[3단계 확인] - 조건: interviewId == ' + interviewId);
      console.log('========================================');
      console.log('[3단계 확인] 💡 변경사항: feedbacks → interview_reports 컬렉션 사용');
      
      // [3개 컬렉션 분리] interview_reports에서 종합 피드백 조회
      const reportsRef = collection(db, 'interview_reports');
      const reportQuery = query(
        reportsRef,
        where('userId', '==', user.uid),
        where('interviewId', '==', interviewId)
      );
      
      const unsubscribeReport = onSnapshot(
        reportQuery,
        (reportSnapshot) => {
          console.log('========================================');
          console.log('[3단계 확인] 📥 interview_reports 스냅샷 수신');
          console.log('[3단계 확인] - 스냅샷 비어있음:', reportSnapshot.empty);
          console.log('[3단계 확인] - 문서 개수:', reportSnapshot.size);
          
          if (!reportSnapshot.empty) {
            const reportDoc = reportSnapshot.docs[0];
            const reportData = reportDoc.data();
            
            console.log('[3단계 확인] ✅ 종합 피드백 문서 발견!');
            console.log('[3단계 확인] - 문서 ID:', reportDoc.id);
            console.log('[3단계 확인] - 전체 데이터:', JSON.stringify(reportData, null, 2));
            console.log('[3단계 확인] - overallFeedback 필드 존재:', !!reportData.overallFeedback);
            console.log('[3단계 확인] - overallFeedback 타입:', typeof reportData.overallFeedback);
            
            if (reportData.overallFeedback) {
              console.log('[3단계 확인] 🎉🎉🎉 종합 피드백 로드 완료! 🎉🎉🎉');
              console.log('[3단계 확인] - 필드:', Object.keys(reportData.overallFeedback));
              console.log('[3단계 확인] - strengths 미리보기:', reportData.overallFeedback.strengths?.substring(0, 50) + '...');
              setOverallFeedback(reportData.overallFeedback);
            } else {
              console.log('[3단계 확인] ⏳ 종합 피드백 아직 생성 안됨 (null)');
              console.log('[3단계 확인] 💡 백그라운드에서 생성 중일 수 있습니다. 잠시 기다리세요.');
              setOverallFeedback(null);
            }
          } else {
            console.warn('========================================');
            console.warn('[3단계 확인] ⚠️⚠️⚠️ interview_reports 문서를 찾을 수 없습니다! ⚠️⚠️⚠️');
            console.warn('[3단계 확인] 가능한 원인:');
            console.warn('[3단계 확인] 1. handleInterviewComplete에서 interview_reports 저장 안됨');
            console.warn('[3단계 확인] 2. interviewId 불일치:', interviewId);
            console.warn('[3단계 확인] 💡 interview/page.js의 handleInterviewComplete 로그 확인하세요!');
            console.warn('========================================');
          }
          console.log('========================================');
          
          setFeedbackLoading(false);
        },
        (reportError) => {
          console.error('========================================');
          console.error('[3단계 확인] ❌ interview_reports 조회 에러!');
          console.error('[3단계 확인] - 에러:', reportError);
          console.error('[3단계 확인] - error.code:', reportError.code);
          console.error('[3단계 확인] - error.message:', reportError.message);
          console.error('========================================');
          setFeedbackLoading(false);
        }
      );
      
      // 컴포넌트 언마운트 시 구독 해제
      return () => {
        console.log('[결과 페이지] 🔌 onSnapshot 구독 해제');
        unsubscribe();
        unsubscribeReport();
      };
    } catch (queryError) {
      // Query 생성 중 에러 (인덱스 관련 에러가 여기서 발생할 수 있음)
      console.error('========================================');
      console.error('[결과 페이지] ❌ Query 생성 중 에러 발생!');
      console.error('[결과 페이지] - 에러:', queryError);
      console.error('[결과 페이지] - error.code:', queryError.code);
      console.error('[결과 페이지] - error.message:', queryError.message);
      console.error('========================================');
      
      setError('데이터 조회 설정 중 오류가 발생했습니다.');
      setLoading(false);
    }
  }, [user, authLoading, interviewId, router]); // authLoading 추가: 로딩 완료 후 재실행

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
            {/* ===== [세트 기반] 종합 피드백 섹션 ===== */}
            <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
              <div className="flex items-center space-x-3 mb-4">
                <span className="text-3xl">🎯</span>
                <h2 className="text-2xl font-bold text-gray-900">종합 피드백</h2>
              </div>
              
              {feedbackLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="inline-block w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                    <p className="text-gray-600">종합 피드백을 불러오는 중...</p>
                  </div>
                </div>
              ) : overallFeedback ? (
                <div className="space-y-6">
                  {/* 일관성 평가 */}
                  {overallFeedback.overallConsistency && (
                    <div className="bg-white rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center">
                        <span className="text-xl mr-2">🔄</span>
                        전체 일관성
                      </h3>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {overallFeedback.overallConsistency}
                      </p>
                    </div>
                  )}
                  
                  {/* 강점 */}
                  {overallFeedback.strengths && (
                    <div className="bg-white rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-green-700 mb-3 flex items-center">
                        <span className="text-xl mr-2">✅</span>
                        전체 강점
                      </h3>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {overallFeedback.strengths}
                      </p>
                    </div>
                  )}
                  
                  {/* 약점 */}
                  {overallFeedback.weaknesses && (
                    <div className="bg-white rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-red-700 mb-3 flex items-center">
                        <span className="text-xl mr-2">⚠️</span>
                        개선 필요 사항
                      </h3>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {overallFeedback.weaknesses}
                      </p>
                    </div>
                  )}
                  
                  {/* 개선 방향 */}
                  {overallFeedback.improvements && (
                    <div className="bg-white rounded-lg p-6 shadow-sm">
                      <h3 className="text-lg font-bold text-blue-700 mb-3 flex items-center">
                        <span className="text-xl mr-2">💡</span>
                        구체적 개선 방향
                      </h3>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {overallFeedback.improvements}
                      </p>
                    </div>
                  )}
                  
                  {/* 종합 평가 */}
                  {overallFeedback.summary && (
                    <div className="bg-white rounded-lg p-6 shadow-sm border-2 border-indigo-300">
                      <h3 className="text-lg font-bold text-indigo-700 mb-3 flex items-center">
                        <span className="text-xl mr-2">📊</span>
                        최종 종합 평가
                      </h3>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {overallFeedback.summary}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8">
                  <div className="text-center">
                    <div className="inline-block w-16 h-16 mb-4">
                      <div className="w-full h-full border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                    <h3 className="text-lg font-bold text-gray-900 mb-2">종합 피드백 생성 중...</h3>
                    <p className="text-gray-600 text-sm">
                      AI가 5개의 답변을 종합 분석하고 있습니다.
                    </p>
                    <p className="text-gray-500 text-xs mt-2">
                      최대 1-2분 소요될 수 있습니다. 잠시만 기다려 주세요.
                    </p>
                  </div>
                </div>
              )}
            </Card>
            
            {/* 개별 답변 섹션 구분선 */}
            <div className="border-t-4 border-gray-300 pt-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">개별 답변 내역</h2>
            </div>
            
            {/* 진행률 표시 (개별 답변용 - 세트 기반에서는 불필요, 제거 가능) */}
            <Card>
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-800 mb-2">답변 기록</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    총 {answers.length}개의 질문에 답변하셨습니다.
                  </p>
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

