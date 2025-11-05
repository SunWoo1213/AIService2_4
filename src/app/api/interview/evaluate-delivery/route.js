import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    const question = formData.get('question');
    const transcript = formData.get('transcript'); // SpeechRecognition으로 얻은 텍스트

    if (!audioFile || !question) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    const llmApiKey = process.env.LLM_API_KEY;
    const llmApiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1';

    let analysisResult;

    if (!llmApiKey) {
      // LLM API가 설정되지 않은 경우 샘플 응답
      console.warn('LLM_API_KEY not set. Returning sample content feedback.');
      
      analysisResult = {
        contentFeedback: {
          score: 7,
          advice: '답변 내용이 질문과 관련이 있습니다. STAR 기법(상황-과제-행동-결과)을 활용하여 구체적인 예시를 더 추가하면 더욱 설득력 있는 답변이 될 것입니다.'
        }
      };
    } else {
      try {
        // Whisper API로 오디오 전사 (더 정확한 텍스트 추출)
        const transcriptionResponse = await fetch(`${llmApiUrl}/audio/transcriptions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${llmApiKey}`,
          },
          body: (() => {
            const formData = new FormData();
            formData.append('file', audioFile);
            formData.append('model', 'whisper-1');
            formData.append('language', 'ko');
            return formData;
          })()
        });

        if (!transcriptionResponse.ok) {
          throw new Error('Whisper API 호출 실패');
        }

        const transcriptionData = await transcriptionResponse.json();
        const whisperTranscript = transcriptionData.text || transcript;

        // LLM 프롬프트 - 답변 내용만 평가
        const llmPrompt = `You are an expert interview coach. Analyze the user's answer based *only* on its CONTENT.

**Question:** "${question}"

**User's Answer (Transcript):** "${whisperTranscript}"

Provide feedback in Korean as a JSON object with one main key: 'contentFeedback'.

**1. contentFeedback:**
   * Evaluate the *substance* of the answer. Was it relevant to the question, clear, and well-structured?
   * Provide a score (1-10) and specific, constructive advice for improvement.

Example JSON format:
{
  "contentFeedback": {
    "score": 8,
    "advice": "답변 내용이 질문의 의도와 잘 맞습니다. STAR 기법의 'Result' 부분이 포함되면 더욱 완벽할 것 같습니다."
  }
}`;

        // LLM API 호출
        const llmResponse = await fetch(`${llmApiUrl}/chat/completions`, {
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
                content: 'You are a professional interview coach. Always respond with valid JSON only in Korean.'
              },
              {
                role: 'user',
                content: llmPrompt
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
            max_tokens: 800
          })
        });

        if (!llmResponse.ok) {
          throw new Error('LLM API 호출 실패');
        }

        const llmData = await llmResponse.json();
        const content = llmData.choices[0].message.content;
        analysisResult = JSON.parse(content);

      } catch (error) {
        console.error('Whisper/LLM API 오류:', error);
        // 폴백: 기본 피드백 제공
        analysisResult = {
          contentFeedback: {
            score: 6,
            advice: '답변 내용이 질문과 관련이 있습니다. 더 구체적인 예시를 추가하고 STAR 기법을 활용하면 더 좋은 답변이 될 것입니다.'
          }
        };
      }
    }

    return NextResponse.json(analysisResult);

  } catch (error) {
    console.error('Content evaluation error:', error);
    return NextResponse.json(
      { error: '답변 평가 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
