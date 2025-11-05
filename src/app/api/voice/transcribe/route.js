import { NextResponse } from 'next/server';
import { db } from '@/firebase/config';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

/**
 * POST /api/voice/transcribe
 * 
 * Step 2: STT + Summarization
 * 음성 파일을 받아 STT를 수행하고, LLM으로 요약 및 도메인 체크를 진행합니다.
 * 
 * Input: FormData { audio: File, userId: string }
 * Output: { status, summary, transcriptionId, stt_result }
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const userId = formData.get('userId');

    if (!audioFile || !userId) {
      return NextResponse.json(
        { error: '오디오 파일과 사용자 ID가 필요합니다.' },
        { status: 400 }
      );
    }

    // ===== STEP 1: STT (Speech-to-Text) =====
    // 브라우저에서 이미 SpeechRecognition API로 텍스트를 추출한 경우,
    // 서버에서는 추가 STT가 불필요할 수 있습니다.
    // 여기서는 브라우저 STT 결과를 받아오는 방식으로 진행합니다.
    
    // 클라이언트가 STT 결과를 함께 전송하는 경우
    const browserSTT = formData.get('transcript');
    
    let sttResult = '';
    
    if (browserSTT && browserSTT.trim().length > 0) {
      // 브라우저 STT 결과 사용
      sttResult = browserSTT.trim();
      console.log('[STT] 브라우저 STT 사용:', sttResult.substring(0, 50) + '...');
    } else {
      // STT API 호출 (Google Cloud Speech-to-Text, Azure, 등)
      // 여기서는 폴백으로 빈 결과 처리
      console.warn('[STT] 브라우저 STT 결과 없음. 서버 STT 필요.');
      
      // TODO: 실제 환경에서는 Google Cloud Speech-to-Text 등을 사용
      // const sttApiResult = await callSTTService(audioFile);
      // sttResult = sttApiResult.text;
      
      // 개발 중에는 빈 결과로 처리
      sttResult = '';
    }

    // STT 결과가 너무 짧으면 불확실 처리
    if (sttResult.length < 5) {
      return NextResponse.json({
        status: 'UNCERTAIN',
        summary: '말씀하신 내용이 명확하게 들리지 않았어요.',
        stt_result: sttResult,
        transcriptionId: null
      });
    }

    // ===== STEP 2: LLM Call 1 (Summarization + Domain Check) =====
    const llmApiKey = process.env.LLM_API_KEY;
    const llmApiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';

    const prompt = `You are an AI assistant for a job applicant. The user just spoke their thoughts.
Analyze the following text (from STT) and perform two tasks:
1. Summarize the user's core intent or main point in one short Korean sentence (e.g., "공고와 자소서의 연결성을 높이고 싶다").
2. Perform a domain check: Is this text related to job applications, resumes, or interviews?

STT Text: "${sttResult}"

Respond ONLY in JSON format.
If related to job domain:
{ "status": "OK", "summary": "[Your 1-sentence summary]" }

If not related:
{ "status": "OFF_TOPIC", "summary": "자기소개 또는 면접 관련 내용이 아닌 것 같아요." }

If text is too short or unclear:
{ "status": "UNCERTAIN", "summary": "말씀하신 내용이 명확하게 들리지 않았어요." }`;

    let llmResult;

    if (!llmApiKey) {
      // LLM API가 설정되지 않은 경우 샘플 응답
      console.warn('[LLM] LLM_API_KEY not set. Using fallback response.');
      
      // 간단한 휴리스틱: 자소서, 이력서, 면접 등의 키워드가 있는지 확인
      const jobKeywords = ['자소서', '자기소개서', '이력서', '면접', '지원', '채용', '공고', '경력', '프로젝트', '개발'];
      const hasJobKeyword = jobKeywords.some(keyword => sttResult.includes(keyword));
      
      if (hasJobKeyword) {
        llmResult = {
          status: 'OK',
          summary: `${sttResult.substring(0, 30).trim()}에 대한 피드백을 원하시는군요.`
        };
      } else {
        llmResult = {
          status: 'OFF_TOPIC',
          summary: '자기소개 또는 면접 관련 내용이 아닌 것 같아요.'
        };
      }
    } else {
      // LLM API 호출
      const llmResponse = await fetch(llmApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${llmApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You are an AI assistant. Always respond with valid JSON only.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.3,
          max_tokens: 150
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
      
      llmResult = JSON.parse(jsonMatch[0]);
    }

    // ===== STEP 3: Firestore에 저장 (임시 저장, 24시간 후 만료) =====
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + 24 * 60 * 60 * 1000); // 24시간 후

    let transcriptionId = null;

    if (llmResult.status === 'OK') {
      // 성공한 경우만 Firestore에 저장
      const transcriptionDoc = await addDoc(collection(db, 'voice_transcriptions'), {
        user_id: userId,
        stt_result: sttResult,
        audio_duration: 0, // 추후 오디오 분석으로 계산 가능
        summary: llmResult.summary,
        domain_status: llmResult.status,
        status: 'pending',
        created_at: now,
        expires_at: expiresAt
      });

      transcriptionId = transcriptionDoc.id;
    }

    // ===== STEP 4: 클라이언트에 응답 =====
    return NextResponse.json({
      status: llmResult.status,
      summary: llmResult.summary,
      transcriptionId: transcriptionId,
      stt_result: sttResult // 디버깅 및 확인용
    });

  } catch (error) {
    console.error('[Transcribe API] Error:', error);
    return NextResponse.json(
      { 
        error: '음성 처리 중 오류가 발생했습니다.',
        details: error.message 
      },
      { status: 500 }
    );
  }
}


