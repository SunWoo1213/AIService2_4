import { NextResponse } from 'next/server';
import { db } from '@/firebase/config';
import { collection, addDoc, doc, getDoc, updateDoc } from 'firebase/firestore';

/**
 * POST /api/feedback/generate
 * 
 * Step 5: 개인화된 메인 피드백 생성
 * 사용자가 "계속하기"를 누른 후, 개인화된 피드백을 생성합니다.
 * 
 * Input: { transcriptionId, userId, jobKeywords?, resumeText? }
 * Output: { feedbackId, feedback: { one_sentence_summary, actionable_feedback, full_analysis } }
 */
export async function POST(request) {
  try {
    const { transcriptionId, userId, jobKeywords, resumeText } = await request.json();

    if (!transcriptionId || !userId) {
      return NextResponse.json(
        { error: 'transcriptionId와 userId가 필요합니다.' },
        { status: 400 }
      );
    }

    // ===== STEP 1: voice_transcriptions에서 STT 결과 가져오기 =====
    const transcriptionRef = doc(db, 'voice_transcriptions', transcriptionId);
    const transcriptionSnap = await getDoc(transcriptionRef);

    if (!transcriptionSnap.exists()) {
      return NextResponse.json(
        { error: '음성 기록을 찾을 수 없습니다.' },
        { status: 404 }
      );
    }

    const transcriptionData = transcriptionSnap.data();
    const sttResult = transcriptionData.stt_result;

    // 권한 확인
    if (transcriptionData.user_id !== userId) {
      return NextResponse.json(
        { error: '접근 권한이 없습니다.' },
        { status: 403 }
      );
    }

    // ===== STEP 2: user_preferences에서 개인화 설정 가져오기 =====
    const preferencesRef = doc(db, 'user_preferences', userId);
    const preferencesSnap = await getDoc(preferencesRef);

    let userPreferences = {
      tone_preference: 'friendly',
      feedback_depth: 'detailed_examples',
      recent_complaint: null
    };

    if (preferencesSnap.exists()) {
      const prefData = preferencesSnap.data();
      userPreferences = {
        tone_preference: prefData.tone_preference || 'friendly',
        feedback_depth: prefData.feedback_depth || 'detailed_examples',
        recent_complaint: prefData.recent_complaint || null
      };
    } else {
      // user_preferences가 없으면 자동 생성
      await addDoc(collection(db, 'user_preferences'), {
        user_id: userId,
        tone_preference: 'friendly',
        feedback_depth: 'detailed_examples',
        recent_complaint: null,
        complaint_count: 0,
        complaint_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        first_survey_completed: false
      });
    }

    // ===== STEP 3: LLM Call 2 (개인화된 메인 피드백) =====
    const llmApiKey = process.env.LLM_API_KEY;
    const llmApiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';

    // 톤 설정 매핑
    const toneMap = {
      'friendly': '친근하고 격려하는',
      'formal': '격식 있고 전문적인',
      'professional': '전문적이고 명확한'
    };

    // 피드백 깊이 매핑
    const depthMap = {
      'summary_only': '간단하게 핵심만 요약',
      'detailed_examples': '구체적인 예시와 함께 상세히',
      'comprehensive': '매우 상세하고 포괄적으로'
    };

    // 최근 불만 처리
    let complaintContext = '';
    if (userPreferences.recent_complaint) {
      const complaintMap = {
        'too_abstract': '이전 피드백이 너무 추상적이었다는 불만이 있었습니다. 반드시 구체적인 예시와 실행 가능한 조언을 포함하세요.',
        'needs_examples': '예시가 더 필요하다는 요청이 있었습니다. 각 조언마다 구체적인 예시를 반드시 제시하세요.',
        'needs_refinement': '문장 다듬기가 필요하다는 요청이 있었습니다. 표현을 더 정제하고 세밀하게 조언하세요.'
      };
      complaintContext = complaintMap[userPreferences.recent_complaint] || '';
    }

    const prompt = `You are an expert job coach.

[Personalization Context - 사용자 설정]
- 이 사용자는 ${toneMap[userPreferences.tone_preference]} 톤의 피드백을 선호합니다.
- 이 사용자는 ${depthMap[userPreferences.feedback_depth]} 피드백을 원합니다.
${complaintContext ? `- 중요: ${complaintContext}` : ''}

[Task Context - 사용자 입력]
- 사용자가 음성으로 말한 내용: "${sttResult}"
${jobKeywords ? `- 채용 공고 키워드: ${JSON.stringify(jobKeywords)}` : ''}
${resumeText ? `- 사용자의 자기소개서/이력서: ${resumeText}` : ''}

당신의 임무:
사용자가 음성으로 표현한 고민이나 요청을 분석하고, 실행 가능한 피드백을 제공하세요.

다음 JSON 형식으로만 응답하세요:
{
  "one_sentence_summary": "[사용자의 핵심 의도를 한 문장으로 요약 (예: '자소서와 공고의 연결성을 높이고 싶어 하시네요')]",
  "actionable_feedback": [
    { "id": 1, "advice": "[실행 가능한 조언 1 - 구체적이고 명확하게]" },
    { "id": 2, "advice": "[실행 가능한 조언 2 - 예시 포함]" },
    { "id": 3, "advice": "[실행 가능한 조언 3 - 즉시 적용 가능하게]" }
  ],
  "full_analysis": "[필요 시 더 자세한 분석 및 설명 (선택 사항)]"
}

**중요 지침**:
- actionable_feedback는 반드시 3개여야 합니다.
- 각 advice는 구체적이고 실행 가능해야 합니다.
- ${depthMap[userPreferences.feedback_depth]} 스타일로 작성하세요.
- 모든 응답은 한국어로 작성하세요.`;

    let feedbackResult;

    if (!llmApiKey) {
      // LLM API가 설정되지 않은 경우 샘플 응답
      console.warn('[Generate Feedback] LLM_API_KEY not set. Using fallback response.');
      feedbackResult = {
        one_sentence_summary: transcriptionData.summary || '음성 피드백을 분석했습니다.',
        actionable_feedback: [
          { id: 1, advice: '구체적인 수치와 성과를 포함하여 작성하세요. 예: "사용자 만족도 35% 향상"과 같이 정량적 지표를 명시하면 설득력이 높아집니다.' },
          { id: 2, advice: '채용 공고의 핵심 키워드를 자소서에 자연스럽게 녹여내세요. 단순히 나열하는 것이 아니라, 실제 경험과 연결하여 서술하면 더 효과적입니다.' },
          { id: 3, advice: 'STAR 기법(상황-과제-행동-결과)을 활용하여 경험을 구조화하세요. 이렇게 하면 면접관이 당신의 기여도를 명확히 이해할 수 있습니다.' }
        ],
        full_analysis: '음성으로 표현하신 고민을 바탕으로 분석한 결과, 자기소개서의 구체성과 직무 적합성을 높이는 것이 핵심입니다. 위의 3가지 조언을 적용하면 훨씬 경쟁력 있는 지원서가 될 것입니다.'
      };
    } else {
      // LLM API 호출
      const llmResponse = await fetch(llmApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are a professional job coach. Always respond with valid JSON only in Korean.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 1500
        })
      });

      if (!llmResponse.ok) {
        throw new Error(`LLM API 호출 실패: ${llmResponse.status}`);
      }

      const llmData = await llmResponse.json();
      const content = llmData.choices[0].message.content;
      
      // JSON 파싱
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid JSON response from LLM');
      }
      
      feedbackResult = JSON.parse(jsonMatch[0]);
    }

    // ===== STEP 4: Firestore에 피드백 저장 =====
    const feedbackDoc = await addDoc(collection(db, 'feedbacks'), {
      userId,
      type: 'voice',
      transcription_id: transcriptionId,
      input_mode: 'voice',
      stt_result: sttResult,
      jobKeywords: jobKeywords || null,
      resumeText: resumeText || null,
      structured_feedback: feedbackResult,
      user_rating: null,
      rating_reason: null,
      rating_timestamp: null,
      createdAt: new Date().toISOString()
    });

    // voice_transcriptions 상태 업데이트
    await updateDoc(transcriptionRef, {
      status: 'confirmed'
    });

    // ===== STEP 5: 응답 반환 =====
    return NextResponse.json({
      feedbackId: feedbackDoc.id,
      feedback: feedbackResult
    });

  } catch (error) {
    console.error('[Generate Feedback API] Error:', error);
    return NextResponse.json(
      { 
        error: '피드백 생성 중 오류가 발생했습니다.',
        details: error.message 
      },
      { status: 500 }
    );
  }
}



