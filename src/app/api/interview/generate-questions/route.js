import { NextResponse } from 'next/server';

// ===== [타임아웃 해결] Next.js API Route 최대 실행 시간 설정 =====
// Vercel: 10초(Hobby) / 60초(Pro) / 900초(Enterprise)
// 이 설정으로 타임아웃을 명시적으로 제어합니다
export const maxDuration = 60; // 60초

export async function POST(request) {
  try {
    console.log('[DIAG] 다음 질문 생성 API 호출 시작:', new Date().toISOString());
    
    const { jobKeywords, resumeText, previousAnswer, previousQuestion, questionCount = 0, streaming = false } = await request.json();
    
    console.log('[DIAG] 요청 파라미터:', {
      hasJobKeywords: !!jobKeywords,
      resumeTextLength: resumeText?.length || 0,
      hasPreviousAnswer: !!previousAnswer,
      questionCount,
      streaming
    });

    if (!jobKeywords || !resumeText) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // ===== [타임아웃 해결] 프롬프트 길이 최적화 =====
    // resumeText가 너무 길면 LLM 처리 시간이 오래 걸려 타임아웃 발생 가능
    // 최대 3000자로 제한 (약 1000 토큰)
    const MAX_RESUME_LENGTH = 3000;
    const optimizedResumeText = resumeText.length > MAX_RESUME_LENGTH 
      ? resumeText.substring(0, MAX_RESUME_LENGTH) + '...(생략)'
      : resumeText;
    
    if (resumeText.length > MAX_RESUME_LENGTH) {
      console.log(`[DIAG] resumeText 길이 최적화: ${resumeText.length} → ${MAX_RESUME_LENGTH}`);
    }

    // previousAnswer도 최적화 (최대 1000자)
    const MAX_ANSWER_LENGTH = 1000;
    const optimizedPreviousAnswer = previousAnswer && previousAnswer.length > MAX_ANSWER_LENGTH
      ? previousAnswer.substring(0, MAX_ANSWER_LENGTH) + '...(생략)'
      : previousAnswer;

    let prompt;
    
    // 이전 답변이 있으면 꼬리 질문 생성 모드
    if (previousAnswer && previousQuestion) {
      prompt = `You are an interviewer conducting a follow-up interview. Based on the following:

**Job Posting**: ${JSON.stringify(jobKeywords)}

**Candidate's Resume**: ${optimizedResumeText}

**Previous Question**: ${previousQuestion}

**Candidate's Previous Answer**: ${optimizedPreviousAnswer}

Generate ONE follow-up question that:
1. Critically examines or probes deeper into their previous answer
2. Identifies vague points or generalizations in their answer and asks for specifics
3. Challenges assumptions or asks for evidence/examples
4. Tests consistency with their resume or previously stated information

The question should be in Korean and feel natural as a follow-up. Time limit should be 60 seconds for detailed answers or 20 seconds for clarifications.

Return a JSON object in this format:
{"question": "질문 내용 (in Korean)", "time_limit": 60}

Provide ONLY the JSON object, no additional text.`;
    } else {
      // 첫 질문 생성 모드
      prompt = `You are an interviewer for a technical role. Based on the following information:

**Job Posting**: ${JSON.stringify(jobKeywords)}

**Candidate's Resume**: ${optimizedResumeText}

Generate ONE initial interview question focused on their major and technical skills. The question should be open-ended and allow the candidate to showcase their experience.

Time limit should be 60 seconds.

Return a JSON object in this format:
{"question": "질문 내용 (in Korean)", "time_limit": 60}

Provide ONLY the JSON object, no additional text. Questions should be in Korean.`;
    }

    const llmApiKey = process.env.LLM_API_KEY;
    const llmApiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';

    let question;

    if (!llmApiKey) {
      // LLM API가 설정되지 않은 경우 샘플 응답
      console.warn('LLM_API_KEY not set. Returning sample question.');
      
      if (previousAnswer && previousQuestion) {
        // 꼬리 질문 샘플
        question = {
          question: "방금 말씀하신 내용에서 구체적으로 어떤 기술을 사용하셨나요?",
          time_limit: 60
        };
      } else {
        // 첫 질문 샘플
        const sampleQuestions = [
          "본인의 가장 자신있는 프로젝트 경험을 설명해주세요.",
          "이 직무에 지원하게 된 동기는 무엇인가요?",
          "팀 프로젝트에서 갈등이 발생했을 때 어떻게 해결하셨나요?",
          "가장 기억에 남는 기술적 도전 과제는 무엇이었나요?"
        ];
        question = {
          question: sampleQuestions[questionCount % sampleQuestions.length],
          time_limit: 60
        };
      }
    } else {
      // 스트리밍 모드
      if (streaming) {
        console.log('[DIAG] 다음 질문 생성 LLM 호출 시작 (스트리밍):', new Date().toISOString());
        
        // ===== [타임아웃 해결] LLM API 호출에 타임아웃 설정 =====
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45초 타임아웃
        
        // [스코프 수정] llmResponse를 try 블록 밖에서 선언
        let llmResponse;
        
        try {
          llmResponse = await fetch(llmApiUrl, {
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
                  content: 'You are a professional interviewer. Always respond with valid JSON only.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.8,
              max_tokens: 500,
              stream: true // 스트리밍 활성화
            }),
            signal: controller.signal // 타임아웃 시그널 추가
          });
          
          clearTimeout(timeoutId); // 성공 시 타임아웃 해제
          console.log('[DIAG] LLM API 응답 수신 완료:', new Date().toISOString());

          if (!llmResponse.ok) {
            throw new Error('LLM API 호출 실패');
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.error('[DIAG] LLM API 타임아웃 (45초 초과)');
            throw new Error('LLM API 호출 시간 초과 (45초)');
          }
          throw fetchError;
        }

        // SSE (Server-Sent Events) 형식으로 스트리밍
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            try {
              const reader = llmResponse.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';

              while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                  controller.close();
                  break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                      continue;
                    }

                    try {
                      const parsed = JSON.parse(data);
                      const content = parsed.choices[0]?.delta?.content;
                      
                      if (content) {
                        // SSE 형식으로 전송
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ content })}\n\n`)
                        );
                      }
                    } catch (e) {
                      console.error('Stream parsing error:', e);
                    }
                  }
                }
              }
            } catch (error) {
              console.error('Streaming error:', error);
              controller.error(error);
            }
          }
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          },
        });
      } else {
        // 기존 비스트리밍 모드 (폴백)
        console.log('[DIAG] 다음 질문 생성 LLM 호출 시작 (비스트리밍):', new Date().toISOString());
        
        // ===== [타임아웃 해결] LLM API 호출에 타임아웃 설정 =====
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000); // 45초 타임아웃
        
        try {
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
                  content: 'You are a professional interviewer. Always respond with valid JSON only.'
                },
                {
                  role: 'user',
                  content: prompt
                }
              ],
              temperature: 0.8,
              max_tokens: 500
            }),
            signal: controller.signal // 타임아웃 시그널 추가
          });
          
          clearTimeout(timeoutId);
          console.log('[DIAG] 다음 질문 생성 LLM 호출 완료:', new Date().toISOString());

          if (!llmResponse.ok) {
            throw new Error('LLM API 호출 실패');
          }

          const llmData = await llmResponse.json();
          const content = llmData.choices[0].message.content;
        
          // JSON 객체 파싱 (배열이 아닌 단일 객체)
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (!jsonMatch) {
            throw new Error('Invalid JSON response from LLM');
          }
          
          question = JSON.parse(jsonMatch[0]);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.error('[DIAG] LLM API 타임아웃 (45초 초과)');
            throw new Error('LLM API 호출 시간 초과 (45초)');
          }
          throw fetchError;
        }
      }
    }

    if (!streaming) {
      return NextResponse.json({ question });
    }

  } catch (error) {
    console.error('Question generation error:', error);
    return NextResponse.json(
      { error: '질문 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

