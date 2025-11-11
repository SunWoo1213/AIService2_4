import { NextResponse } from 'next/server';
import { db } from '@/firebase/config';
import { doc, setDoc, getDoc } from 'firebase/firestore';

/**
 * GET /api/user/preferences
 * 사용자 설정 조회
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    const prefRef = doc(db, 'user_preferences', userId);
    const prefSnap = await getDoc(prefRef);

    if (!prefSnap.exists()) {
      // 기본값 반환
      return NextResponse.json({
        user_id: userId,
        tone_preference: 'friendly',
        feedback_depth: 'detailed_examples',
        recent_complaint: null,
        complaint_count: 0,
        first_survey_completed: false
      });
    }

    return NextResponse.json(prefSnap.data());
  } catch (error) {
    console.error('[Get Preferences] Error:', error);
    return NextResponse.json(
      { error: '설정 조회 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user/preferences
 * 사용자 설정 저장/업데이트
 */
export async function POST(request) {
  try {
    const {
      userId,
      tone_preference,
      feedback_depth,
      first_survey_completed
    } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'userId가 필요합니다.' },
        { status: 400 }
      );
    }

    const prefRef = doc(db, 'user_preferences', userId);
    const prefSnap = await getDoc(prefRef);

    const now = new Date().toISOString();

    if (prefSnap.exists()) {
      // 업데이트
      const updateData = {
        updated_at: now
      };

      if (tone_preference) updateData.tone_preference = tone_preference;
      if (feedback_depth) updateData.feedback_depth = feedback_depth;
      if (first_survey_completed !== undefined) {
        updateData.first_survey_completed = first_survey_completed;
      }

      await setDoc(prefRef, updateData, { merge: true });
    } else {
      // 신규 생성
      await setDoc(prefRef, {
        user_id: userId,
        tone_preference: tone_preference || 'friendly',
        feedback_depth: feedback_depth || 'detailed_examples',
        recent_complaint: null,
        complaint_count: 0,
        complaint_history: [],
        created_at: now,
        updated_at: now,
        first_survey_completed: first_survey_completed || false
      });
    }

    return NextResponse.json({
      success: true,
      message: '설정이 저장되었습니다.'
    });
  } catch (error) {
    console.error('[Save Preferences] Error:', error);
    return NextResponse.json(
      { error: '설정 저장 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}





