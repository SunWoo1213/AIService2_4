import { NextResponse } from 'next/server';
import { db } from '@/firebase/config';
import { collection, addDoc } from 'firebase/firestore';

// ===== [타임아웃 해결] Next.js API Route 최대 실행 시간 설정 =====
export const maxDuration = 60; // 60초

export async function POST(request) {
  try {
    const { jobKeywords, resumeText, userProfile, userId } = await request.json();

    if (!resumeText || !userId) {
      return NextResponse.json(
        { error: '필수 정보가 누락되었습니다.' },
        { status: 400 }
      );
    }

    // LLM API 호출
    const prompt = `당신은 대기업 및 유니콘 스타트업에서 15년 이상 근무한 시니어 채용 담당자이자 전문 커리어 코치입니다. 매년 수천 건의 지원서를 검토하고, 수백 명의 합격자를 배출한 경험을 바탕으로 지원자의 자기소개서를 분석해주세요.

## 📋 분석 자료

**채용 공고 주요 키워드 및 요구사항**:
${JSON.stringify(jobKeywords, null, 2)}

**지원자 프로필**:
${JSON.stringify(userProfile, null, 2)}

**지원자의 자기소개서/이력서 내용**:
${resumeText}

## 🎯 전문가 수준의 분석 기준

다음 5가지 핵심 영역을 채용 담당자의 관점에서 심층 분석하세요:

### 1. 직무 적합성 (Job Fit)
- 채용 공고의 필수/우대 요건과의 일치도
- 핵심 기술 스택 및 도구 명시 여부
- 실무 적용 경험과 프로젝트 연관성
- 산업/도메인 지식 표현

### 2. 구체성 및 정량화 (Specificity & Quantification)
- STAR 기법(Situation, Task, Action, Result) 적용 여부
- 정량적 성과 지표: 수치, 비율, 규모, 기간
- 역할과 책임의 명확성
- Before/After 비교를 통한 임팩트 강조

### 3. 문법 및 전문성 (Grammar & Professionalism)
- 맞춤법, 띄어쓰기, 문장 부호
- 문장 구조의 다양성과 가독성
- 업계 표준 용어 및 전문 용어 활용
- 과장/축소 없는 객관적 서술

### 4. 논리성 및 스토리텔링 (Logic & Storytelling)
- 경험의 시간순 또는 주제별 논리적 배치
- 문단 간 연결성과 일관성
- 지원 동기와 경험의 연결고리
- 성장 과정과 학습 곡선 표현

### 5. 차별화 및 개성 (Differentiation & Uniqueness)
- 다른 지원자와 구별되는 독특한 경험
- 문제 해결 접근법의 독창성
- 개인의 성장 마인드셋과 열정 표현
- 회사/직무에 대한 깊이 있는 이해도

## 📝 전문가 피드백 작성 가이드

각 피드백은 다음 요소를 **모두** 포함해야 합니다:

### 필수 구성 요소:
1. **원문 인용**: 문제가 있는 실제 문장 (정확히 복사)
2. **구체적 개선안**: 즉시 적용 가능한 수정 문장
3. **상세한 근거**: 
   - 왜 현재 문장이 부족한지
   - 개선안이 어떻게 더 효과적인지
   - 채용 담당자가 어떻게 받아들일지
4. **카테고리**: 위 5가지 영역 중 하나
5. **우선순위**: high (즉시 수정 필요) / medium (권장) / low (선택)

### 피드백 품질 기준:
✅ **우수한 피드백 예시**:
"원문: '팀 프로젝트를 성공적으로 완수했습니다.'
개선안: '애자일 스크럼 방법론을 도입한 7명 규모의 크로스펑셔널 팀에서 프론트엔드 리드를 맡아 6개월간 진행한 결과, 사용자 이탈률 35% 감소 및 MAU 2만 명 증가라는 성과를 달성했습니다.'
이유: 채용 담당자는 '성공적 완수'라는 추상적 표현보다 구체적 수치를 원합니다. 개선안은 (1)방법론(애자일), (2)팀 규모(7명), (3)역할(리드), (4)기간(6개월), (5)정량적 성과(이탈률 35%↓, MAU 2만↑)를 모두 포함하여 지원자의 실제 기여도를 명확히 보여줍니다. 특히 '크로스펑셔널'이라는 용어로 협업 능력도 암시합니다."

❌ **피해야 할 피드백**:
- 모호한 조언: "더 구체적으로 쓰세요"
- 근거 없는 수정: "이렇게 바꾸는 게 좋습니다" (왜?)
- 단순 문법 지적만: "띄어쓰기가 틀렸습니다" (맥락 설명 필요)

## 💡 채용 시장 인사이트

현재 채용 트렌드를 반영한 조언을 포함하세요:
- 원격/하이브리드 근무 환경에서의 협업 경험
- 데이터 기반 의사결정 경험
- 빠른 학습 능력과 적응력
- 비즈니스 임팩트에 대한 이해
- 최신 기술 트렌드 및 베스트 프랙티스 적용

## 📊 출력 형식

다음 JSON 형식으로만 응답하세요 (추가 설명 없이):

{
  "summary": "전체적으로 우수한 자기소개서입니다. 기술 스택과 프로젝트 경험이 잘 드러나지만, 정량적 성과를 더 보완하면 완성도가 높아질 것입니다.",
  "strengths": [
    "채용 공고의 핵심 키워드(React, TypeScript)가 적절히 포함됨",
    "프로젝트 경험이 구체적으로 서술됨"
  ],
  "weaknesses": [
    "성과를 나타내는 정량적 지표(수치, 증가율 등)가 부족함",
    "직무 관련 경험과 무관한 내용이 일부 포함됨"
  ],
  "feedback_details": [
    {
      "category": "구체성",
      "original_sentence": "팀 프로젝트를 성공적으로 완수했습니다.",
      "suggested_improvement": "5명 규모의 개발팀에서 프론트엔드 리드로 6개월간 근무하며, 사용자 만족도를 35% 향상시킨 웹 서비스를 출시했습니다.",
      "reason": "추상적인 '성공적 완수' 표현 대신, 팀 규모(5명), 역할(프론트엔드 리드), 기간(6개월), 정량적 성과(만족도 35% 향상)를 명시하여 구체성과 신뢰도를 높일 수 있습니다.",
      "priority": "high"
    },
    {
      "category": "직무적합성",
      "original_sentence": "다양한 프로그래밍 언어를 다룰 수 있습니다.",
      "suggested_improvement": "채용 공고의 필수 요구사항인 React와 TypeScript를 활용하여 3개의 상용 서비스를 개발한 경험이 있습니다.",
      "reason": "채용 공고에서 요구하는 구체적인 기술 스택(React, TypeScript)을 직접 언급하고, 실무 경험을 명시하여 직무 적합성을 강조할 수 있습니다.",
      "priority": "high"
    },
    {
      "category": "문법",
      "original_sentence": "빠르게변화하는 환경에 적응할수있습니다.",
      "suggested_improvement": "빠르게 변화하는 환경에 적응할 수 있습니다.",
      "reason": "띄어쓰기 오류를 수정했습니다. '빠르게 변화하는', '적응할 수 있습니다'로 올바르게 띄어 써야 합니다.",
      "priority": "medium"
    }
  ]
}

**핵심 지침**: 
- **최소 7개 이상, 최대 12개**의 상세한 개선 사항 제시
- 각 피드백의 reason은 **최소 2-3문장**으로 상세히 작성
- 채용 담당자의 관점에서 "이 부분이 왜 중요한지" 명시
- 개선안은 **실제 적용 가능한 구체적인 문장**으로 작성
- 우선순위(priority)는 비즈니스 임팩트를 고려하여 설정
- 모든 피드백은 한국어로 작성하되, 필요시 영문 용어 병기`;

    const llmApiKey = process.env.LLM_API_KEY;
    const llmApiUrl = process.env.LLM_API_URL || 'https://api.openai.com/v1/chat/completions';

    let feedbackResult;

    if (!llmApiKey) {
      // LLM API가 설정되지 않은 경우 샘플 응답
      console.warn('LLM_API_KEY not set. Returning sample feedback.');
      feedbackResult = {
        summary: "전반적으로 양호한 자기소개서입니다. 기본적인 경험은 잘 표현되어 있으나, 정량적 성과와 직무 관련 키워드를 보강하면 경쟁력이 더욱 높아질 것입니다.",
        strengths: [
          "문장 구조가 명확하고 읽기 쉽게 작성됨",
          "프로젝트 경험이 포함되어 있음"
        ],
        weaknesses: [
          "채용 공고의 핵심 키워드가 충분히 반영되지 않음",
          "성과를 나타내는 구체적인 수치가 부족함",
          "추상적인 표현이 다수 포함됨"
        ],
        feedback_details: [
          {
            category: "구체성",
            original_sentence: "저는 열정적인 개발자입니다.",
            suggested_improvement: "저는 3년간 React와 TypeScript를 활용하여 10개 이상의 웹 애플리케이션을 개발한 프론트엔드 개발자입니다.",
            reason: "'열정적인'은 추상적인 표현입니다. 구체적인 경력 기간(3년), 기술 스택(React, TypeScript), 프로젝트 수(10개 이상)를 명시하면 설득력이 높아집니다.",
            priority: "high"
          },
          {
            category: "직무적합성",
            original_sentence: "팀워크가 좋습니다.",
            suggested_improvement: "애자일 스크럼 방법론을 활용한 5인 규모의 개발팀에서 프론트엔드 리드로 6개월간 협업하며, 프로젝트 일정을 2주 앞당겨 출시한 경험이 있습니다.",
            reason: "추상적인 '팀워크가 좋다' 대신, 방법론(애자일 스크럼), 팀 규모(5인), 역할(리드), 기간(6개월), 정량적 성과(2주 단축)를 명시하여 구체성을 높였습니다.",
            priority: "high"
          },
          {
            category: "직무적합성",
            original_sentence: "다양한 기술을 학습했습니다.",
            suggested_improvement: "채용 공고에서 요구하는 React, Next.js, TypeScript를 실무에 활용하여 사용자 경험을 개선한 프로젝트를 수행했습니다.",
            reason: "채용 공고의 핵심 기술 스택을 직접 언급하고, 단순 학습이 아닌 실무 활용 경험을 강조하면 직무 적합성이 더욱 부각됩니다.",
            priority: "high"
          },
          {
            category: "구체성",
            original_sentence: "성능 최적화를 수행했습니다.",
            suggested_improvement: "웹팩 번들 사이즈를 40% 축소하고 초기 로딩 속도를 3.2초에서 1.1초로 개선하여 사용자 이탈률을 25% 감소시켰습니다.",
            reason: "구체적인 수치(번들 40% 축소, 로딩 시간 3.2초→1.1초, 이탈률 25% 감소)를 제시하면 실제 기여도와 임팩트를 명확히 전달할 수 있습니다.",
            priority: "high"
          },
          {
            category: "문법",
            original_sentence: "빠르게변화하는 기술트렌드를 따라갑니다.",
            suggested_improvement: "빠르게 변화하는 기술 트렌드를 따라갑니다.",
            reason: "띄어쓰기 오류를 수정했습니다. '빠르게 변화하는', '기술 트렌드'로 올바르게 띄어 써야 합니다.",
            priority: "medium"
          }
        ]
      };
    } else {
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
              content: 'You are a professional career coach. Always respond with valid JSON only in Korean.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      });

      if (!llmResponse.ok) {
        throw new Error('LLM API 호출 실패');
      }

      const llmData = await llmResponse.json();
      const content = llmData.choices[0].message.content;
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Invalid JSON response from LLM');
      }
      
      feedbackResult = JSON.parse(jsonMatch[0]);
    }

    // Firestore에 저장
    const feedbackDoc = await addDoc(collection(db, 'feedbacks'), {
      userId,
      type: 'resume',
      jobKeywords,
      resumeText,
      userProfile,
      feedback: feedbackResult,
      createdAt: new Date().toISOString()
    });

    return NextResponse.json({
      id: feedbackDoc.id,
      feedback: feedbackResult
    });

  } catch (error) {
    console.error('Resume feedback error:', error);
    return NextResponse.json(
      { error: '피드백 생성 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

