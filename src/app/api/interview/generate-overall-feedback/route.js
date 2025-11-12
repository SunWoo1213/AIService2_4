import { NextResponse } from 'next/server';
import { db } from '@/firebase/config';
import { collection, query, where, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import OpenAI from 'openai';

// ===== [Vercel 타임아웃 설정] =====
// 종합 피드백 생성은 LLM 호출로 인해 시간이 오래 걸릴 수 있음
export const maxDuration = 60; // Vercel Hobby: 최대 60초, Pro: 최대 300초
export const dynamic = 'force-dynamic'; // 동적 라우트로 강제 설정

// ===== [빌드 에러 해결] OpenAI 인스턴스를 함수 내부에서 생성 =====
// 이유: 빌드 시 환경 변수가 없어도 에러가 발생하지 않도록
export async function POST(request) {
  console.log('========================================');
  console.log('[종합 피드백 API] POST 요청 수신');
  console.log('[종합 피드백 API] 시각:', new Date().toISOString());
  console.log('========================================');
  
  try {
    // 요청 데이터 파싱
    const { interviewId, userId } = await request.json();
    
    console.log('[종합 피드백 API] 📋 요청 데이터:');
    console.log('[종합 피드백 API] - interviewId:', interviewId);
    console.log('[종합 피드백 API] - userId:', userId);
    
    // 필수 파라미터 검증
    if (!interviewId || !userId) {
      console.error('[종합 피드백 API] ❌ 필수 파라미터 누락');
      return NextResponse.json(
        { error: 'interviewId와 userId는 필수입니다.' },
        { status: 400 }
      );
    }
    
    // ===== [1단계] [단일 문서] interview_results에서 조회 =====
    console.log('[종합 피드백 API] 🔍 1단계: interview_results 조회 중...');
    console.log('[종합 피드백 API] - 문서 경로: interview_results/' + interviewId);
    console.log('[종합 피드백 API] 💡 단일 문서 구조 사용');
    
    const { doc, getDoc } = await import('firebase/firestore');
    const docRef = doc(db, 'interview_results', interviewId);
    const docSnapshot = await getDoc(docRef);
    
    if (!docSnapshot.exists()) {
      console.warn('[종합 피드백 API] ⚠️ interview_results 문서가 없습니다.');
      return NextResponse.json(
        { error: 'interview_results 문서를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    
    const interviewData = docSnapshot.data();
    const answers = interviewData.questions || [];
    
    console.log('[종합 피드백 API] 📊 조회 결과:', answers.length, '개의 답변');
    
    if (answers.length === 0) {
      console.warn('[종합 피드백 API] ⚠️ 답변이 없습니다.');
      return NextResponse.json(
        { error: '답변 데이터를 찾을 수 없습니다.' },
        { status: 404 }
      );
    }
    
    console.log('[종합 피드백 API] ✅ 답변 조회 완료:', answers.length, '개');
    
    // ===== [2단계] LLM 프롬프트 구성 =====
    console.log('[종합 피드백 API] 📝 2단계: LLM 프롬프트 구성 중...');
    
    // 답변 내용을 텍스트로 구성 (질문 ID 포함)
    const answersText = answers.map((answer, index) => {
      return `
**질문 ID**: ${answer.id || `q${index + 1}`}
**질문 ${index + 1}**: ${answer.question}
**답변**: ${answer.answer || answer.transcript}
**답변 시간**: ${answer.duration}초
`;
    }).join('\n---\n');
    
    const systemPrompt = `당신은 채용 전문가이자 시니어 면접관입니다. 
지원자의 전체 면접 답변을 종합적으로 분석하여 깊이 있는 피드백을 제공하세요.

**평가 기준:**
1. **종합 평가 (overallReview)**: 전체 면접에서의 일관성, 강점, 약점, 개선 방향을 종합한 전반적인 평가
2. **개별 피드백 (questionFeedbacks)**: 각 질문/답변에 대한 구체적이고 실행 가능한 피드백

반드시 다음 JSON 형식으로 응답하세요:
{
  "overallReview": "전체적인 강점과 약점을 종합한 평가 (3-4문단 분량)",
  "questionFeedbacks": [
    { "id": "q1", "feedback": "1번 질문에 대한 구체적 피드백 (2-3문장)" },
    { "id": "q2", "feedback": "2번 질문에 대한 구체적 피드백 (2-3문장)" },
    { "id": "q3", "feedback": "3번 질문에 대한 구체적 피드백 (2-3문장)" },
    { "id": "q4", "feedback": "4번 질문에 대한 구체적 피드백 (2-3문장)" },
    { "id": "q5", "feedback": "5번 질문에 대한 구체적 피드백 (2-3문장)" }
  ]
}

**개별 피드백 작성 가이드:**
- 답변의 핵심 내용을 언급하며 시작
- 잘한 점과 개선할 점을 균형있게 제시
- 구체적이고 실행 가능한 조언 포함`;
    
    const userPrompt = `다음은 지원자의 전체 면접 답변 내역입니다. 
종합 평가(overallReview)와 각 질문별 개별 피드백(questionFeedbacks)을 JSON 형식으로 제공해주세요.

${answersText}

위 답변들을 분석하여 종합 평가와 각 질문에 대한 개별 피드백을 JSON 형식으로 제공해주세요.`;
    
    console.log('[종합 피드백 API] ✅ 프롬프트 구성 완료');
    console.log('[종합 피드백 API] - 답변 개수:', answers.length);
    console.log('[종합 피드백 API] - 프롬프트 길이:', userPrompt.length, 'bytes');
    
    // ===== [3단계] LLM API 호출 =====
    console.log('[종합 피드백 API] 🤖 3단계: LLM API 호출 중...');
    console.log('[종합 피드백 API] - 모델: gpt-4o-mini (빠른 응답)');
    console.log('[종합 피드백 API] - 호출 시각:', new Date().toISOString());
    
    // OpenAI 인스턴스 생성 (함수 내부에서 생성하여 빌드 에러 방지)
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    if (!process.env.OPENAI_API_KEY) {
      console.error('[종합 피드백 API] ❌ OPENAI_API_KEY 환경 변수가 설정되지 않았습니다!');
      throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. Vercel 환경 변수를 확인하세요.');
    }
    
    // ===== [속도 최적화] gpt-4o-mini 사용 (gpt-4o보다 10배 빠름) =====
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // 빠른 응답 & 비용 절감
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 1500, // 토큰 제한으로 응답 속도 개선
      response_format: { type: "json_object" }
    });
    
    const feedbackText = completion.choices[0].message.content;
    console.log('[종합 피드백 API] ✅ LLM 응답 수신');
    console.log('[종합 피드백 API] - 응답 길이:', feedbackText.length, 'bytes');
    
    // JSON 파싱
    const feedbackData = JSON.parse(feedbackText);
    
    console.log('[종합 피드백 API] ✅ JSON 파싱 성공');
    console.log('[종합 피드백 API] - 필드:', Object.keys(feedbackData).join(', '));
    console.log('[종합 피드백 API] - overallReview 길이:', feedbackData.overallReview?.length || 0, 'bytes');
    console.log('[종합 피드백 API] - questionFeedbacks 개수:', feedbackData.questionFeedbacks?.length || 0);
    
    // ===== [4단계] [단일 문서] interview_results 업데이트 =====
    console.log('[종합 피드백 API] 💾 4단계: interview_results 업데이트 중...');
    console.log('[종합 피드백 API] - 문서 경로: interview_results/' + interviewId);
    console.log('[종합 피드백 API] - 필드: overallReview + questions[].aiFeedback 병합');
    console.log('[종합 피드백 API] 💡 단일 문서 구조: 기존 문서에 피드백 추가');
    
    // ===== [핵심] questions 배열에 aiFeedback 병합 =====
    const updatedQuestions = answers.map((question, index) => {
      const questionId = question.id || `q${index + 1}`;
      
      // questionFeedbacks에서 해당 질문의 피드백 찾기
      const feedbackItem = feedbackData.questionFeedbacks?.find(
        item => item.id === questionId
      );
      
      // ===== [진단] 피드백 데이터 상세 로깅 =====
      console.log(`[종합 피드백 API] ===== 질문 ${index + 1} (ID: ${questionId}) =====`);
      console.log('[종합 피드백 API] - feedbackItem 존재:', !!feedbackItem);
      console.log('[종합 피드백 API] - feedbackItem 전체:', feedbackItem);
      console.log('[종합 피드백 API] - feedbackItem.feedback:', feedbackItem?.feedback);
      console.log('[종합 피드백 API] - feedbackItem.id:', feedbackItem?.id);
      
      // 기존 질문 데이터에 aiFeedback 필드 추가 (문자열로 직접 저장)
      const aiFeedbackText = feedbackItem?.feedback || null;
      
      console.log('[종합 피드백 API] - 저장될 aiFeedback:', aiFeedbackText ? '✅ ' + aiFeedbackText.substring(0, 50) + '...' : '⚠️ null');
      
      return {
        ...question,
        aiFeedback: aiFeedbackText  // 문자열로 직접 저장 (null이면 프론트엔드에서 로딩 표시)
      };
    });
    
    console.log('[종합 피드백 API] ✅ questions 배열 aiFeedback 병합 완료:', updatedQuestions.length, '개');
    
    // interview_results 문서 업데이트
    const { updateDoc } = await import('firebase/firestore');
    const updateDocRef = doc(db, 'interview_results', interviewId);
    
    await updateDoc(updateDocRef, {
      overallReview: feedbackData.overallReview,
      questions: updatedQuestions, // aiFeedback이 병합된 배열
      feedbackGeneratedAt: Timestamp.now(),
      updatedAt: new Date().toISOString()
    });
    
    console.log('========================================');
    console.log('[종합 피드백 API] ✅✅✅ 성공! ✅✅✅');
    console.log('[종합 피드백 API] - 문서 ID:', interviewId);
    console.log('[종합 피드백 API] - 컬렉션: interview_results');
    console.log('[종합 피드백 API] - 완료 시각:', new Date().toISOString());
    console.log('[종합 피드백 API] 💡 onSnapshot이 자동으로 프론트엔드를 업데이트합니다!');
    console.log('========================================');
    
    return NextResponse.json({
      success: true,
      interviewId: interviewId,
      message: '종합 피드백이 성공적으로 생성되었습니다.'
    });
    
  } catch (error) {
    console.error('========================================');
    console.error('[종합 피드백 API] ❌❌❌ 에러 발생! ❌❌❌');
    console.error('[종합 피드백 API] - 에러 타입:', error.constructor.name);
    console.error('[종합 피드백 API] - 에러 메시지:', error.message);
    console.error('[종합 피드백 API] - 에러 코드:', error.code);
    console.error('[종합 피드백 API] - 에러 스택:', error.stack);
    
    // ===== [상세 에러 분석] =====
    let errorType = 'UNKNOWN';
    let userMessage = '종합 피드백 생성 중 오류가 발생했습니다.';
    let troubleshooting = '';
    
    if (error.message?.includes('API key') || error.code === 'invalid_api_key') {
      errorType = 'API_KEY_ERROR';
      userMessage = 'OpenAI API 키가 잘못되었거나 설정되지 않았습니다.';
      troubleshooting = 'Vercel Dashboard → Settings → Environment Variables에서 OPENAI_API_KEY를 확인하세요.';
      console.error('[종합 피드백 API] 🔍 원인: OpenAI API 키 문제');
      console.error('[종합 피드백 API] 💡 해결방법:', troubleshooting);
    } else if (error.message?.includes('permission') || error.code === 'permission-denied') {
      errorType = 'FIRESTORE_PERMISSION_ERROR';
      userMessage = 'Firestore 권한이 거부되었습니다.';
      troubleshooting = 'Firestore Rules에서 interview_results 컬렉션의 write 권한을 확인하세요.';
      console.error('[종합 피드백 API] 🔍 원인: Firestore 권한 문제');
      console.error('[종합 피드백 API] 💡 해결방법:', troubleshooting);
    } else if (error.message?.includes('JSON') || error.name === 'SyntaxError') {
      errorType = 'JSON_PARSE_ERROR';
      userMessage = 'LLM 응답을 파싱하는 중 오류가 발생했습니다.';
      troubleshooting = 'LLM이 올바른 JSON 형식을 반환하지 않았습니다. 재시도하세요.';
      console.error('[종합 피드백 API] 🔍 원인: JSON 파싱 실패');
      console.error('[종합 피드백 API] 💡 해결방법:', troubleshooting);
    } else if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT') {
      errorType = 'TIMEOUT_ERROR';
      userMessage = '요청 시간이 초과되었습니다.';
      troubleshooting = 'LLM 응답이 너무 오래 걸렸습니다. maxDuration 설정을 확인하거나 더 빠른 모델을 사용하세요.';
      console.error('[종합 피드백 API] 🔍 원인: 타임아웃');
      console.error('[종합 피드백 API] 💡 해결방법:', troubleshooting);
    } else if (error.message?.includes('quota') || error.message?.includes('rate_limit')) {
      errorType = 'RATE_LIMIT_ERROR';
      userMessage = 'OpenAI API 사용량 한도를 초과했습니다.';
      troubleshooting = 'OpenAI API 요금 한도를 확인하거나 결제 방법을 추가하세요.';
      console.error('[종합 피드백 API] 🔍 원인: API 사용량 한도 초과');
      console.error('[종합 피드백 API] 💡 해결방법:', troubleshooting);
    }
    
    console.error('[종합 피드백 API] - 에러 타입:', errorType);
    console.error('[종합 피드백 API] - 문제 해결:', troubleshooting);
    console.error('========================================');
    
    // ===== [클라이언트에 상세 에러 전달] =====
    return NextResponse.json(
      { 
        error: userMessage,
        errorType: errorType,
        details: error.message,
        troubleshooting: troubleshooting,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}

