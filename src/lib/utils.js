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

