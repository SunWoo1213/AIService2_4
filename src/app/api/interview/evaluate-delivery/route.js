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

    // [유효성 검사] transcript가 비어있거나 너무 짧으면 즉시 반환
    const trimmedTranscript = transcript ? transcript.trim() : '';
    
    // null, undefined, 빈 문자열 체크
    if (!trimmedTranscript || trimmedTranscript.length === 0) {
      return NextResponse.json({
        contentFeedback: {
          advice: '답변이 감지되지 않았습니다. 다시 한번 말씀해 주시겠어요?'
        }
      });
    }

    // 15자 미만의 매우 짧거나 의미 없는 답변 체크
    const meaninglessPatterns = ['...', '글쎄요', '모르겠습니다', '잘 모르겠어요', '음', '어'];
    const isMeaningless = meaninglessPatterns.some(pattern => 
      trimmedTranscript.toLowerCase().includes(pattern)
    );

    if (trimmedTranscript.length < 15 || isMeaningless) {
      return NextResponse.json({
        contentFeedback: {
          advice: '답변이 너무 짧거나 명확하지 않습니다. 좀 더 구체적으로 답변해 주시겠어요?'
        }
      });
    }

    if (!llmApiKey) {
      // LLM API가 설정되지 않은 경우 샘플 응답
      console.warn('LLM_API_KEY not set. Returning sample content feedback.');
      
      analysisResult = {
        contentFeedback: {
          advice: '답변 내용이 질문과 관련이 있습니다. 구체적인 예시와 경험의 결과를 더 추가하면 더욱 설득력 있는 답변이 될 것입니다.'
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

        // [유효성 검사] Whisper API 결과도 재검사 (더 정확한 전사 결과)
        const whisperTrimmed = whisperTranscript ? whisperTranscript.trim() : '';
        
        // null, undefined, 빈 문자열 체크
        if (!whisperTrimmed || whisperTrimmed.length === 0) {
          return NextResponse.json({
            contentFeedback: {
              advice: '답변이 감지되지 않았습니다. 다시 한번 말씀해 주시겠어요?'
            }
          });
        }

        // 15자 미만의 매우 짧거나 의미 없는 답변 체크
        const meaninglessPatterns = ['...', '글쎄요', '모르겠습니다', '잘 모르겠어요', '음', '어'];
        const isMeaningless = meaninglessPatterns.some(pattern => 
          whisperTrimmed.toLowerCase().includes(pattern)
        );

        if (whisperTrimmed.length < 15 || isMeaningless) {
          return NextResponse.json({
            contentFeedback: {
              advice: '답변이 너무 짧거나 명확하지 않습니다. 좀 더 구체적으로 답변해 주시겠어요?'
            }
          });
        }

        // LLM 프롬프트 - 답변 내용만 평가 (점수 및 STAR 기법 제거)
        const llmPrompt = `
  You are an expert interview coach. Analyze the user's answer based *only* on its CONTENT.
  Do NOT provide a numerical score.
  Do NOT mention the "STAR method" or any other specific named technique.

  **Question:** "${question}"
  
  **User's Answer (Transcript):** "${whisperTrimmed}"

  Provide feedback in Korean as a JSON object with one main key: 'contentFeedback'.
  The feedback should be *only* constructive advice focused on the substance and clarity of the answer.

  **1. contentFeedback:**
     * Evaluate the *substance* of the answer. Was it relevant to the question, clear, and well-structured?
     * Provide specific, constructive advice for improvement as a single string.
  
  Example JSON format:
  {
    "contentFeedback": {
      "advice": "답변 내용이 질문의 의도와 잘 맞습니다. 다만, 경험에 대한 '결과'나 '배운 점'을 조금 더 구체적으로 추가하면 답변이 훨씬 풍부해질 것 같습니다."
    }
  }
`;

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
            advice: '답변 내용이 질문과 관련이 있습니다. 더 구체적인 예시와 경험의 배경, 행동, 결과를 추가하면 더 좋은 답변이 될 것입니다.'
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
