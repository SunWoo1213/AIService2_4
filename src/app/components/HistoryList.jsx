'use client';

import { useRouter } from 'next/navigation';
import Card from './ui/Card';

export default function HistoryList({ feedbacks, type }) {
  const router = useRouter();

  const filteredFeedbacks = feedbacks.filter(f => f.type === type);
  
  // ===== [2단계 수정] 클릭 핸들러 - 타입별 다른 경로 =====
  const handleClick = (feedback) => {
    console.log('[HistoryList] 클릭된 항목:', feedback.id, '- 타입:', feedback.type);
    
    if (feedback.type === 'interview') {
      // 면접의 경우: interviewId로 결과 페이지 이동
      if (feedback.interviewId) {
        console.log('[HistoryList] 🚀 면접 결과 페이지로 이동:', `/interview/result/${feedback.interviewId}`);
        router.push(`/interview/result/${feedback.interviewId}`);
      } else {
        console.error('[HistoryList] ❌ interviewId가 없습니다!', feedback);
        alert('면접 데이터가 올바르지 않습니다.');
      }
    } else {
      // 이력서의 경우: 기존 경로 유지
      console.log('[HistoryList] 🚀 이력서 피드백 페이지로 이동:', `/feedback/${feedback.id}`);
      router.push(`/feedback/${feedback.id}`);
    }
  };

  if (filteredFeedbacks.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <div className="text-4xl mb-4">
            {type === 'resume' ? '📝' : '🎤'}
          </div>
          <p className="text-gray-600">
            {type === 'resume' 
              ? '아직 자기소개서 피드백이 없습니다.' 
              : '아직 모의 면접 기록이 없습니다.'}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {filteredFeedbacks.map((feedback) => (
        <Card 
          key={feedback.id} 
          hover 
          onClick={() => handleClick(feedback)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center mb-3">
                <span className="text-2xl mr-3">
                  {type === 'resume' ? '📄' : '🎤'}
                </span>
                <div>
                  <p className="text-gray-600 text-sm">
                    {new Date(feedback.createdAt).toLocaleString('ko-KR', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>

              {type === 'resume' && (
                <div>
                  {feedback.resumeText && (
                    <p className="text-gray-700 text-sm line-clamp-3">
                      {feedback.resumeText.substring(0, 200)}...
                    </p>
                  )}
                </div>
              )}

              {type === 'interview' && (
                <div>
                  <div className="mb-2 space-y-2">
                    {/* ===== [2단계 수정] 면접 세트 정보 표시 ===== */}
                    <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium mr-2">
                      5개 질문 세트
                    </span>
                    
                    {/* 종합 피드백 상태 표시 */}
                    {feedback.overallFeedback ? (
                      <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                        ✅ 종합 피드백 완료
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                        ⏳ 피드백 생성 중...
                      </span>
                    )}
                  </div>
                  
                  {/* 종합 피드백 미리보기 */}
                  {feedback.overallFeedback && feedback.overallFeedback.summary && (
                    <p className="text-gray-700 text-sm line-clamp-2 mt-2">
                      {feedback.overallFeedback.summary}
                    </p>
                  )}
                </div>
              )}

              {feedback.jobKeywords && (
                <div className="mt-3">
                  <p className="text-gray-600 text-xs mb-2">관련 키워드:</p>
                  <div className="flex flex-wrap gap-1">
                    {feedback.jobKeywords.skills?.slice(0, 3).map((skill, idx) => (
                      <span key={idx} className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                        {skill}
                      </span>
                    ))}
                    {feedback.jobKeywords.skills?.length > 3 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">
                        +{feedback.jobKeywords.skills.length - 3}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="ml-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

