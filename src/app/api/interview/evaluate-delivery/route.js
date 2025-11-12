import { NextResponse } from 'next/server';

// ===== [타임아웃 해결] Next.js API Route 최대 실행 시간 설정 =====
export const maxDuration = 60; // 60초

// ===== [분석용] 면접 답변 평가 API =====
// 
// 이 API의 목적:
// 1. 오디오 파일을 Whisper STT로 전사하여 정확한 텍스트 추출
// 2. 추출된 텍스트(transcript)를 LLM으로 분석하여 피드백 생성
// 3. 오디오 파일 자체는 LLM에 전송되지 않음 (텍스트만 분석)
//
// 데이터 흐름:
// 1. 프론트엔드 → API: audioFile (Whisper용), transcript (폴백용), question
// 2. API → Whisper: audioFile → 더 정확한 transcript
// 3. API → LLM: transcript (텍스트만) → 내용 분석 피드백
// 4. API → 프론트엔드: 피드백 결과 (strengths, weaknesses, improvements, summary)
//
// 중요: audioFile은 순수하게 STT 정확도 향상을 위한 것이며,
//       실제 평가는 오디오가 아닌 텍스트 내용을 기반으로 수행됩니다.

export async function POST(request) {
  // ===== [진단 API] API 엔트리 포인트 로깅 =====
  const requestStartTime = Date.now();
  console.log('=====================================');
  console.log('[API] 📥 답변 평가 API 호출됨');
  console.log('[API] - 요청 시작 시각:', new Date().toISOString());
  console.log('[API] - 요청 ID:', requestStartTime);
  console.log('=====================================');
  
  try {
    console.log('[API] 📦 FormData 파싱 시작...');
    const formData = await request.formData();
    console.log('[API] ✅ FormData 파싱 완료');
    
    const audioFile = formData.get('audio'); // [STT용] Whisper로 정확한 transcript 추출
    const question = formData.get('question'); // [평가 기준] 질문 내용
    const transcript = formData.get('transcript'); // [폴백용] Browser SpeechRecognition 결과

    // ===== [진단 API] 받은 데이터 상세 검증 =====
    console.log('[API] 📋 수신된 데이터 검증:');
    console.log('[API] - audioFile:', {
      exists: !!audioFile,
      name: audioFile ? audioFile.name : '(없음)',
      type: audioFile ? audioFile.type : '(없음)',
      size: audioFile ? audioFile.size : 0,
      isValid: audioFile && audioFile.size > 0
    });
    console.log('[API] - transcript:', {
      exists: !!transcript,
      type: typeof transcript,
      length: transcript ? transcript.length : 0,
      isEmpty: !transcript || transcript.trim().length === 0,
      preview: transcript ? transcript.substring(0, 100) + '...' : '(비어있음)'
    });
    console.log('[API] - question:', {
      exists: !!question,
      length: question ? question.length : 0,
      preview: question ? question.substring(0, 50) + '...' : '(없음)'
    });

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
    
    console.log('[진단 4단계] transcript 검사:', {
      original: transcript,
      trimmed: trimmedTranscript,
      length: trimmedTranscript.length,
      isEmpty: !trimmedTranscript || trimmedTranscript.length === 0
    });
    
    // null, undefined, 빈 문자열 체크
    if (!trimmedTranscript || trimmedTranscript.length === 0) {
      console.log('[진단 4단계] "답변 없음" 처리됨 (transcript가 비어있음)');
      console.log('[진단 4단계] 원본 transcript 값:', {
        transcript: transcript,
        trimmedTranscript: trimmedTranscript,
        type: typeof transcript,
        isNull: transcript === null,
        isUndefined: transcript === undefined,
        isEmpty: transcript === ''
      });
      
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

    console.log('[진단 4단계] 짧은 답변 검사:', {
      length: trimmedTranscript.length,
      isMeaningless: isMeaningless,
      matchedPatterns: meaninglessPatterns.filter(p => trimmedTranscript.toLowerCase().includes(p))
    });

    if (trimmedTranscript.length < 15 || isMeaningless) {
      console.log('[진단 4단계] "답변 없음" 처리됨 (답변이 너무 짧거나 의미 없음)');
      console.log('[진단 4단계] 원본 transcript 값:', {
        transcript: trimmedTranscript,
        length: trimmedTranscript.length,
        isMeaningless: isMeaningless
      });
      
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
        strengths: '답변이 질문과 관련이 있습니다.',
        weaknesses: '구체적인 예시나 경험의 결과가 부족합니다.',
        improvements: '1) 구체적인 수치나 데이터를 포함하세요.\n2) 상황-과제-행동-결과(STAR) 구조로 답변을 구성하세요.\n3) 실제 경험에서 배운 교훈을 추가하세요.',
        summary: '답변의 방향은 적절하나, 구체성과 깊이를 보강할 필요가 있습니다.'
      };
    } else {
      // ===== [STT용] Whisper API로 오디오 전사 (더 정확한 텍스트 추출) =====
      // 목적: Browser SpeechRecognition보다 더 정확한 transcript를 얻기 위함
      // 오디오 파일은 여기서만 사용되며, LLM에는 추출된 텍스트만 전송됩니다.
      console.log('[진단 3단계 - Whisper] Whisper API 요청 시작');
      
      let whisperTranscript = transcript; // 기본값: Browser STT 결과 사용
      
      try {
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

        console.log('[진단 3단계 - Whisper] Whisper API 응답 상태:', transcriptionResponse.status);

        if (transcriptionResponse.ok) {
          const transcriptionData = await transcriptionResponse.json();
          console.log('[진단 3단계 - Whisper] Whisper API 응답 전체:', transcriptionData);
          
          const whisperResult = transcriptionData.text;
          
          // Whisper 결과 품질 검증
          if (whisperResult && whisperResult.trim().length > 0) {
            const whisperLength = whisperResult.trim().length;
            const browserLength = transcript.trim().length;
            
            // Whisper 결과가 Browser STT보다 50% 이상 짧으면 Browser STT 사용
            if (whisperLength < browserLength * 0.5) {
              console.warn('[Whisper Fallback] Whisper 결과가 너무 짧음 (Browser STT의 50% 미만)');
              console.warn(`[Whisper Fallback] Whisper: ${whisperLength}자 vs Browser: ${browserLength}자`);
              console.warn('[Whisper Fallback] Browser STT 결과 사용');
              whisperTranscript = transcript;
            } else {
              console.log('[Whisper Success] Whisper 결과 사용 ✓');
              whisperTranscript = whisperResult;
            }
          } else {
            console.warn('[Whisper Fallback] Whisper 결과가 비어있음, Browser STT 사용');
            whisperTranscript = transcript;
          }
        } else {
          const errorText = await transcriptionResponse.text();
          console.error('[Whisper Fallback] Whisper API 에러:', errorText);
          console.warn('[Whisper Fallback] Browser STT 사용으로 폴백');
          // whisperTranscript는 이미 transcript로 초기화되어 있음
        }
      } catch (whisperError) {
        console.error('[Whisper Fallback] Whisper API 호출 실패:', whisperError);
        console.warn('[Whisper Fallback] Browser STT 사용으로 폴백');
        // whisperTranscript는 이미 transcript로 초기화되어 있음
      }
      
      console.log('[진단 3단계 - Whisper] 최종 사용 텍스트:', {
        length: whisperTranscript ? whisperTranscript.length : 0,
        preview: whisperTranscript ? whisperTranscript.substring(0, 100) : '(없음)',
        source: whisperTranscript === transcript ? 'Browser STT' : 'Whisper API'
      });

      // [유효성 검사] Whisper API 결과도 재검사 (더 정확한 전사 결과)
      const whisperTrimmed = whisperTranscript ? whisperTranscript.trim() : '';
      
      console.log('[진단 4단계] Whisper transcript 검사:', {
        original: whisperTranscript,
        trimmed: whisperTrimmed,
        length: whisperTrimmed.length,
        isEmpty: !whisperTrimmed || whisperTrimmed.length === 0
      });
      
      // null, undefined, 빈 문자열 체크
      if (!whisperTrimmed || whisperTrimmed.length === 0) {
        console.log('[진단 4단계] "답변 없음" 처리됨 (Whisper transcript가 비어있음)');
        console.log('[진단 4단계] 원본 transcript 값:', {
          whisperTranscript: whisperTranscript,
          whisperTrimmed: whisperTrimmed,
          type: typeof whisperTranscript,
          isNull: whisperTranscript === null,
          isUndefined: whisperTranscript === undefined,
          isEmpty: whisperTranscript === ''
        });
        
        return NextResponse.json({
          strengths: '',
          weaknesses: '답변이 감지되지 않았습니다.',
          improvements: '마이크가 제대로 작동하는지 확인하고 다시 시도해주세요.',
          summary: '답변을 인식할 수 없습니다.'
        });
      }

      // 15자 미만의 매우 짧거나 의미 없는 답변 체크
      const meaninglessPatterns = ['...', '글쎄요', '모르겠습니다', '잘 모르겠어요', '음', '어'];
      const isMeaningless = meaninglessPatterns.some(pattern => 
        whisperTrimmed.toLowerCase().includes(pattern)
      );

      console.log('[진단 4단계] Whisper 짧은 답변 검사:', {
        length: whisperTrimmed.length,
        isMeaningless: isMeaningless,
        matchedPatterns: meaninglessPatterns.filter(p => whisperTrimmed.toLowerCase().includes(p))
      });

      if (whisperTrimmed.length < 15 || isMeaningless) {
        console.log('[진단 4단계] "답변 없음" 처리됨 (Whisper 답변이 너무 짧거나 의미 없음)');
        console.log('[진단 4단계] 원본 transcript 값:', {
          whisperTrimmed: whisperTrimmed,
          length: whisperTrimmed.length,
          isMeaningless: isMeaningless
        });
        
        return NextResponse.json({
          strengths: '',
          weaknesses: '답변이 너무 짧거나 명확하지 않습니다.',
          improvements: '질문에 대해 구체적인 예시와 경험을 포함하여 최소 30초 이상 답변해주세요.',
          summary: '답변의 길이와 내용이 매우 부족합니다.'
        });
      }
      
      try {

        // ===== [분석용] LLM 프롬프트 - 텍스트 내용만 평가 =====
        // 중요: LLM은 텍스트만 받으며, 오디오 파일은 받지 않습니다.
        // 평가 대상은 순수하게 '답변 내용(what they said)'이며,
        // 음성 톤, 발음, 속도 등은 평가하지 않습니다.
        const llmPrompt = `
  You are a senior technical interviewer at a competitive tech company conducting a real interview.
  Your role is to provide detailed, constructive feedback on the candidate's answer CONTENT ONLY.
  
  IMPORTANT: You are evaluating ONLY the text content. Do NOT comment on:
  - Voice tone, pitch, or speaking style
  - Pronunciation or accent
  - Speaking speed or pauses
  Focus purely on the substance, logic, and clarity of what they said.

  **Interview Context:**
  - Question: "${question}"
  - Candidate's Answer: "${whisperTrimmed}"

  **Evaluation Focus:**

  1. **Analyze the Answer Thoroughly**
     - Identify what worked well (if anything)
     - Point out logical flaws, vagueness, or missing information
     - Be direct and honest about weaknesses
     - Don't sugarcoat, but remain professional

  2. **Assess Key Dimensions**
     - **Relevance**: Does it actually answer the question?
     - **Depth**: Are there specific examples, numbers, or concrete details?
     - **Clarity**: Is the logic clear and well-structured?
     - **Completeness**: What critical information is missing?
     - **Impact**: Does it demonstrate real understanding and experience?

  3. **Provide Actionable Guidance**
     - Give 3-5 concrete, specific suggestions for improvement
     - Explain HOW to make the answer stronger
     - Reference frameworks or techniques if helpful (e.g., STAR method)

  **Response Format (Korean):**
  Return a JSON object with these fields ONLY:

  {
    "strengths": "<What worked well in the answer. Be specific. If nothing significant, say '특별한 강점을 찾기 어렵습니다'>",
    "weaknesses": "<Specific logical flaws, gaps, vagueness, or problems. Be direct, detailed, and honest. List multiple issues if present.>",
    "improvements": "<3-5 concrete, actionable suggestions. Each suggestion should explain WHAT to add and WHY it matters. Use bullet points or numbered list format.>",
    "summary": "<2-3 sentence overall assessment. Be honest but constructive. If the answer was weak, explain why directly.>"
  }

  **Important Guidelines:**
  - NO SCORES or numerical ratings
  - Focus on qualitative, text-based feedback
  - Be specific: cite actual parts of their answer
  - Be critical but constructive
  - Provide actionable next steps

  Example of good feedback:
  "답변에서 '열심히 했다'는 표현이 반복되지만, 구체적으로 무엇을 어떻게 했는지가 빠져있습니다. 
  예를 들어 '매일 3시간씩 코드 리뷰를 하며 30개의 버그를 수정했다'처럼 정량적 지표를 포함하세요."
`;

        // LLM API 호출
        console.log('[진단 3단계 - LLM] LLM API 요청 시작');
        
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
                content: 'You are a senior technical interviewer. Always respond with valid JSON only in Korean. Be direct and critical in your feedback.'
              },
              {
                role: 'user',
                content: llmPrompt
              }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.7,
            max_tokens: 1500  // 800 → 1500 (더 상세한 피드백 허용)
          })
        });

        console.log('[진단 3단계 - LLM] LLM API 응답 상태:', llmResponse.status);

        if (!llmResponse.ok) {
          const errorText = await llmResponse.text();
          console.error('[진단 3단계 - LLM] LLM API 에러:', errorText);
          throw new Error('LLM API 호출 실패');
        }

        const llmData = await llmResponse.json();
        console.log('[진단 3단계 - LLM] LLM API 응답 전체:', llmData);
        
        const content = llmData.choices[0].message.content;
        
        // JSON 파싱 시도
        try {
          analysisResult = JSON.parse(content);
          console.log('[진단 3단계 - LLM] JSON 파싱 성공:', analysisResult);
          
          // 필수 필드 검증 및 기본값 추가
          if (!analysisResult.weaknesses || !analysisResult.summary) {
            console.warn('[진단 3단계 - LLM] 필수 필드 누락, 기본값 추가');
            analysisResult = {
              strengths: analysisResult.strengths || '',
              weaknesses: analysisResult.weaknesses || '평가 정보가 불완전합니다.',
              improvements: analysisResult.improvements || '답변을 더 구체적으로 작성해주세요.',
              summary: analysisResult.summary || '평가를 완료할 수 없습니다.'
            };
          }
        } catch (parseError) {
          console.error('[진단 3단계 - LLM] JSON 파싱 실패:', parseError);
          console.error('[진단 3단계 - LLM] 원본 응답:', content);
          
          // 폴백: 기본 피드백 제공
          analysisResult = {
            strengths: '',
            weaknesses: '답변 내용을 평가할 수 없습니다.',
            improvements: '답변을 더 명확하고 구체적으로 작성해주세요.',
            summary: 'AI 평가 중 오류가 발생했습니다. 다시 시도해주세요.'
          };
        }

      } catch (error) {
        console.error('[진단 3단계] Whisper/LLM API 에러:', error);
        console.error('[진단 3단계] 에러 상세:', {
          message: error.message,
          stack: error.stack
        });
        
        // 폴백: 기본 피드백 제공
        analysisResult = {
          strengths: '',
          weaknesses: '답변 내용을 평가할 수 없습니다.',
          improvements: '답변을 더 구체적으로 작성해주세요. 상황(Situation), 과제(Task), 행동(Action), 결과(Result)를 포함하면 더 좋은 답변이 될 것입니다.',
          summary: 'API 오류로 인해 평가를 완료할 수 없습니다.'
        };
      }
    }

    // ===== [진단 API] 최종 응답 반환 =====
    const requestEndTime = Date.now();
    const processingTime = requestEndTime - requestStartTime;
    
    console.log('=====================================');
    console.log('[API] ✅✅✅ 답변 평가 완료! API 응답 반환 ✅✅✅');
    console.log('[API] - 요청 ID:', requestStartTime);
    console.log('[API] - 응답 시각:', new Date().toISOString());
    console.log('[API] - 총 처리 시간:', processingTime, 'ms (', (processingTime / 1000).toFixed(2), '초)');
    console.log('[API] - 반환 데이터:', {
      hasStrengths: !!analysisResult.strengths,
      hasWeaknesses: !!analysisResult.weaknesses,
      hasImprovements: !!analysisResult.improvements,
      hasSummary: !!analysisResult.summary
    });
    console.log('=====================================');
    
    return NextResponse.json(analysisResult);

  } catch (error) {
    // ===== [에러 핸들링 API] 최종 에러 처리 =====
    const requestEndTime = Date.now();
    const processingTime = requestEndTime - requestStartTime;
    
    console.error('=====================================');
    console.error('[API] ❌❌❌ 답변 평가 API 에러 발생 ❌❌❌');
    console.error('[API] - 요청 ID:', requestStartTime);
    console.error('[API] - 에러 발생 시각:', new Date().toISOString());
    console.error('[API] - 처리 시간 (실패까지):', processingTime, 'ms');
    console.error('[API] - 에러 타입:', error.name);
    console.error('[API] - 에러 메시지:', error.message);
    console.error('[API] - 에러 스택:', error.stack);
    console.error('[API] - 전체 에러 객체:', error);
    
    // 에러 원인 분석
    if (error.message.includes('fetch') || error.message.includes('network')) {
      console.error('[API] 🔍 원인: 네트워크 연결 문제');
      console.error('[API] → 인터넷 연결 또는 외부 API 서버 상태 확인 필요');
    } else if (error.message.includes('API') || error.message.includes('OpenAI')) {
      console.error('[API] 🔍 원인: LLM API 관련 문제');
      console.error('[API] → API 키, 요청 형식, 서비스 상태 확인 필요');
    } else if (error.message.includes('JSON') || error.message.includes('parse')) {
      console.error('[API] 🔍 원인: JSON 파싱 실패');
      console.error('[API] → LLM 응답 형식이 올바르지 않음');
    } else {
      console.error('[API] 🔍 원인: 알 수 없는 서버 에러');
      console.error('[API] → 위 스택 트레이스를 확인하세요');
    }
    
    console.error('=====================================');
    
    return NextResponse.json(
      { 
        error: '답변 평가 중 오류가 발생했습니다.',
        details: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
