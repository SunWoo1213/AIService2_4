import { NextResponse } from 'next/server';
import { db } from '@/firebase/config';
import { doc, getDoc, updateDoc, arrayUnion } from 'firebase/firestore';

/**
 * POST /api/feedback/rate
 * 
 * Step 4: 대화형 피드백 루프
 * 사용자가 피드백을 평가하고, 평가 내용을 user_preferences에 반영합니다.
 * 
 * Input: { feedbackId, userId, rating: 'good' | 'bad', reason?: string }
 * Output: { success: true, message: string }
 */
export async function POST(request) {
  try {
    const { feedbackId, userId, rating, reason } = await request.json();

    if (!feedbackId || !userId || !rating) {
      return NextResponse.json(
        { error: 'feedbackId, userId, rating이 필요합니다.' },
        { status: 400 }
      );
    }

    if (!['good', 'bad'].includes(rating)) {
      return NextResponse.json(
        { error: 'rating은 "good" 또는 "bad"여야 합니다.' },
        { status: 400 }
      );
    }

    // ===== STEP 1: feedback 문서 가져오기 =====
    const feedbackRef = doc(db, 'feedbacks', feedbackId);
    const feedbackSnap = await getDoc(feedbackRef);

    if (!feedbackSnap.exists()) {
      return NextResponse.json(
        { error: '피드백을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const feedbackData = feedbackSnap.data();

    // 권한 확인
    if (feedbackData.userId !== userId) {
      return NextResponse.json(
        { error: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // ===== STEP 2: feedback 문서에 평가 저장 =====
    await updateDoc(feedbackRef, {
      user_rating: rating,
      rating_reason: reason || null,
      rating_timestamp: new Date().toISOString()
    });

    // ===== STEP 3: rating이 'bad'인 경우, user_preferences 업데이트 =====
    if (rating === 'bad' && reason) {
      const preferencesRef = doc(db, 'user_preferences', userId);
      const preferencesSnap = await getDoc(preferencesRef);

      if (preferencesSnap.exists()) {
        const currentData = preferencesSnap.data();
        
        // recent_complaint 매핑
        const complaintMap = {
          'abstract': 'too_abstract',
          'needs_examples': 'needs_examples',
          'needs_refinement': 'needs_refinement'
        };

        const mappedComplaint = complaintMap[reason] || reason;

        // 불만 이력 추가
        await updateDoc(preferencesRef, {
          recent_complaint: mappedComplaint,
          complaint_count: (currentData.complaint_count || 0) + 1,
          complaint_history: arrayUnion({
            timestamp: new Date().toISOString(),
            reason: mappedComplaint,
            feedback_id: feedbackId
          }),
          updated_at: new Date().toISOString()
        });

        console.log(`[Rate Feedback] User ${userId} complained: ${mappedComplaint}`);
      } else {
        // user_preferences가 없으면 생성
        const complaintMap = {
          'abstract': 'too_abstract',
          'needs_examples': 'needs_examples',
          'needs_refinement': 'needs_refinement'
        };

        const mappedComplaint = complaintMap[reason] || reason;

        await updateDoc(preferencesRef, {
          user_id: userId,
          tone_preference: 'friendly',
          feedback_depth: 'detailed_examples',
          recent_complaint: mappedComplaint,
          complaint_count: 1,
          complaint_history: [{
            timestamp: new Date().toISOString(),
            reason: mappedComplaint,
            feedback_id: feedbackId
          }],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          first_survey_completed: false
        });
      }
    } else if (rating === 'good') {
      // 긍정적 평가인 경우, recent_complaint 초기화 (선택 사항)
      const preferencesRef = doc(db, 'user_preferences', userId);
      const preferencesSnap = await getDoc(preferencesRef);

      if (preferencesSnap.exists()) {
        await updateDoc(preferencesRef, {
          recent_complaint: null,
          updated_at: new Date().toISOString()
        });
      }
    }

    // ===== STEP 4: 응답 반환 =====
    let message = '';
    if (rating === 'good') {
      message = '소중한 피드백 감사합니다! 앞으로도 더 나은 서비스를 제공하겠습니다.';
    } else {
      if (reason === 'abstract') {
        message = '의견 감사합니다. 다음 피드백부터는 더 구체적인 예시를 제공하겠습니다.';
      } else if (reason === 'needs_examples') {
        message = '의견 감사합니다. 다음 피드백부터는 더 많은 예시를 포함하겠습니다.';
      } else if (reason === 'needs_refinement') {
        message = '의견 감사합니다. 다음 피드백부터는 표현을 더 세밀하게 다듬겠습니다.';
      } else {
        message = '소중한 의견 감사합니다. 피드백 품질 개선에 반영하겠습니다.';
      }
    }

    return NextResponse.json({
      success: true,
      message
    });

  } catch (error) {
    console.error('[Rate Feedback API] Error:', error);
    return NextResponse.json(
      { 
        error: '평가 저장 중 오류가 발생했습니다.',
        details: error.message 
      },
      { status: 500 }
    );
  }
}








