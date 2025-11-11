import { NextResponse } from 'next/server';

// ===== [타임아웃 해결] Next.js API Route 최대 실행 시간 설정 =====
export const maxDuration = 60; // 60초

export async function POST(request) {
  try {
    const { jobText } = await request.json();

    if (!jobText) {
      return NextResponse.json(
        { error: '채용 공고 내용이 필요합니다.' },
        { status: 400 }
      );
    }

    // LLM API 호출 (OpenAI 또는 다른 LLM)
    const prompt = `You are an expert HR recruitment specialist. Analyze the following job posting text and extract the most critical keywords, required skills, and core responsibilities. Structure the output as a clean JSON object like this: {'keywords': ['keyword1', 'keyword2'], 'skills': ['skill1', 'skill2'], 'responsibilities': ['responsibility1']}.

Job Posting:
${jobText}

Provide ONLY the JSON object, no additional text.`;

    // LLM API 호출 예시 (OpenAI)
    const llmApiKey = process.env.LLM_API_KEY;
    const llmApiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';

    if (!llmApiKey) {
      // LLM API가 설정되지 않은 경우 샘플 응답 반환
      console.warn('LLM_API_KEY not set. Returning sample response.');
      const sampleResponse = {
        keywords: ['경력', '학력', '자격요건', '우대사항'],
        skills: ['JavaScript', 'React', 'Node.js', '팀워크', '커뮤니케이션'],
        responsibilities: ['웹 애플리케이션 개발', '코드 리뷰', '팀 협업', '기술 문서 작성']
      };
      
      return NextResponse.json(sampleResponse);
    }

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
            content: 'You are an expert HR recruitment specialist. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!llmResponse.ok) {
      throw new Error('LLM API 호출 실패');
    }

    const llmData = await llmResponse.json();
    const content = llmData.choices[0].message.content;
    
    // JSON 파싱
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid JSON response from LLM');
    }
    
    const analysisResult = JSON.parse(jsonMatch[0]);

    return NextResponse.json(analysisResult);

  } catch (error) {
    console.error('Job analysis error:', error);
    return NextResponse.json(
      { error: '채용 공고 분석 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

