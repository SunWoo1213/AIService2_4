/**
 * 'male' 또는 'female' 중 하나를 무작위로 반환합니다.
 * 두 값은 동일한 확률(50:50)로 선택됩니다.
 * 
 * @returns {'male' | 'female'} 무작위로 선택된 인터뷰어 음성 타입
 */
export function get_random_interviewer_voice() {
  const voices = ['male', 'female'];
  const randomIndex = Math.floor(Math.random() * voices.length);
  return voices[randomIndex];
}

/**
 * 면접 질문에 대한 답변을 분석하여 적절한 피드백을 반환합니다.
 * 4단계 우선순위로 피드백을 제공합니다.
 * 
 * @param {string} question - 면접 질문
 * @param {string} answer - 사용자의 답변
 * @returns {Object} 피드백 객체 { type: string, advice: string }
 */
export function get_interview_feedback(question, answer) {
  // [1순위] 입력 없음 (유효성 검사)
  if (!answer || typeof answer !== 'string') {
    return {
      type: 'no_input',
      advice: '답변이 감지되지 않았습니다. 질문을 다시 확인해주세요.'
    };
  }

  const trimmedAnswer = answer.trim();
  
  // 빈 문자열이거나 공백만 있는 경우
  if (trimmedAnswer.length === 0) {
    return {
      type: 'no_input',
      advice: '답변이 명확하게 들리지 않았습니다. 다시 한번 말씀해 주시겠어요?'
    };
  }

  // 15자 미만의 매우 짧고 의미 없는 답변
  const meaninglessPatterns = ['...', '글쎄요', '모르겠습니다', '잘 모르겠어요', '음', '어'];
  const isMeaningless = meaninglessPatterns.some(pattern => 
    trimmedAnswer.toLowerCase().includes(pattern)
  );

  if (trimmedAnswer.length < 15 || isMeaningless) {
    return {
      type: 'no_input',
      advice: '답변이 너무 짧거나 명확하지 않습니다. 좀 더 구체적으로 답변해 주시겠어요?'
    };
  }

  // [2순위] 질문-답변 연관성 검사
  const keywords = extractKeywords(question);
  const hasRelevance = checkRelevance(keywords, trimmedAnswer);

  if (!hasRelevance && keywords.length > 0) {
    const keywordStr = keywords.slice(0, 3).join(', ');
    return {
      type: 'low_relevance',
      advice: `질문의 핵심(예: ${keywordStr})과 답변의 연관성이 조금 부족해 보입니다. 질문의 요지를 다시 한번 생각해 주세요.`
    };
  }

  // [3순위] 구체성 검사 (STAR 기법)
  const hasSpecificity = checkSpecificity(trimmedAnswer);

  if (!hasSpecificity) {
    return {
      type: 'needs_detail',
      advice: '답변 내용이 질문과 관련이 있습니다. 더 구체적인 예시와 경험의 배경(Situation), 행동(Action), 결과(Result)를 추가하면 더 좋은 답변이 될 것입니다.'
    };
  }

  // [4순위] 좋은 답변
  return {
    type: 'good',
    advice: '좋은 답변입니다. 질문의 의도를 잘 파악하고 구체적인 경험을 잘 설명해 주셨습니다.'
  };
}

/**
 * 질문에서 핵심 키워드를 추출합니다.
 * @private
 */
function extractKeywords(question) {
  if (!question || typeof question !== 'string') return [];

  // 한글, 영문 단어 추출 (2글자 이상)
  const words = question.match(/[가-힣]{2,}|[a-zA-Z]{2,}/g) || [];
  
  // 불용어 제거
  const stopwords = ['무엇', '어떻게', '어떤', '있나요', '있습니까', '합니까', '하나요', 
                     '해주세요', '주세요', '대해', '관해', '설명', '말씀', '이야기'];
  
  return words.filter(word => !stopwords.includes(word));
}

/**
 * 답변이 질문의 키워드와 연관성이 있는지 확인합니다.
 * @private
 */
function checkRelevance(keywords, answer) {
  if (keywords.length === 0) return true; // 키워드가 없으면 연관성 검사 생략
  
  const lowerAnswer = answer.toLowerCase();
  
  // 키워드 중 최소 하나라도 답변에 포함되어 있는지 확인
  // 또는 키워드의 일부(3글자 이상)가 포함되어 있는지 확인
  const hasMatch = keywords.some(keyword => {
    const lowerKeyword = keyword.toLowerCase();
    
    // 정확한 일치
    if (lowerAnswer.includes(lowerKeyword)) return true;
    
    // 부분 일치 (키워드가 4글자 이상인 경우, 앞 3글자 일치 확인)
    if (keyword.length >= 4) {
      const partial = lowerKeyword.substring(0, 3);
      if (lowerAnswer.includes(partial)) return true;
    }
    
    return false;
  });
  
  return hasMatch;
}

/**
 * 답변에 구체적인 내용이 포함되어 있는지 확인합니다.
 * STAR 기법 관련 표현이나 충분한 길이를 검사합니다.
 * @private
 */
function checkSpecificity(answer) {
  // 최소 길이 체크 (구체적인 답변은 일반적으로 100자 이상)
  if (answer.length < 100) return false;
  
  // STAR 기법 관련 표현 확인
  const starIndicators = [
    // Situation (상황)
    '당시', '그때', '상황', '환경', '배경', '프로젝트에서', '업무에서', '과제',
    // Task (과제)
    '문제', '해결', '목표', '필요', '요구사항', '과제',
    // Action (행동)
    '진행', '수행', '개발', '구현', '적용', '사용', '활용', '만들', '설계', '도입',
    // Result (결과)
    '결과', '성과', '개선', '향상', '완성', '성공', '달성', '배운', '깨달',
    // 구체적 예시
    '예를 들어', '구체적으로', '실제로', '경험', '사례'
  ];
  
  // 2개 이상의 STAR 표현이 포함되어 있는지 확인
  const matchCount = starIndicators.filter(indicator => 
    answer.includes(indicator)
  ).length;
  
  return matchCount >= 2;
}

