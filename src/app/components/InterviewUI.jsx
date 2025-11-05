'use client';

import { useState, useEffect, useRef } from 'react';
import Button from './ui/Button';
import Card from './ui/Card';

export default function InterviewUI({ questions, onComplete, tonePreference = 'friendly' }) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef(null);

  // TTS 기능: 질문을 음성으로 읽어주는 함수
  const speakQuestion = (text, autoStartRecording = false) => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    const processedText = text
      .replace(/\./g, '. ')
      .replace(/,/g, ', ')
      .replace(/\?/g, '? ')
      .replace(/\s+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.lang = 'ko-KR';
    
    // 말투 설정에 따른 TTS 파라미터 조정
    if (tonePreference === 'friendly') {
      // 친근하고 격려하는 톤: 조금 느리고 부드러운 톤
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
    } else if (tonePreference === 'professional') {
      // 전문적이고 명확한 톤: 보통 속도, 중간 톤
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      utterance.volume = 1.0;
    } else if (tonePreference === 'formal') {
      // 격식 있고 정중한 톤: 약간 느리고 낮은 톤
      utterance.rate = 0.8;
      utterance.pitch = 0.85;
      utterance.volume = 1.0;
    } else {
      // 기본값
      utterance.rate = 0.85;
      utterance.pitch = 0.95;
      utterance.volume = 1.0;
    }

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find(voice => 
      voice.lang.includes('ko') && 
      (voice.name.includes('Male') || voice.name.includes('남성'))
    );
    
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => 
        voice.lang.includes('ko') && 
        (voice.name.includes('Female') || voice.name.includes('여성'))
      );
    }
    
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => voice.lang.includes('ko'));
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    // TTS가 끝나면 자동으로 녹음 시작
    if (autoStartRecording) {
      utterance.onend = () => {
        console.log('TTS 완료, 녹음 자동 시작...');
        startRecording();
      };
    }

    utterance.onerror = (event) => {
      console.error('TTS 오류:', event.error);
    };

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setBrowserSupported(false);
      }

      if (window.speechSynthesis) {
        const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          console.log('사용 가능한 TTS 음성:', voices.length, '개');
        };

        loadVoices();

        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
        }
      }
    }
  }, []);

  // 질문 변경 시: 타이머 리셋 및 TTS 시작 → 자동 녹음
  useEffect(() => {
    if (questions && questions.length > 0 && typeof window !== 'undefined' && window.speechSynthesis) {
      const currentQuestion = questions[currentQuestionIndex];
      if (currentQuestion && currentQuestion.question) {
        setIsTimerRunning(false);
        setTimeLeft(currentQuestion.time_limit);
        finalTranscriptRef.current = '';
        isRecordingRef.current = false;
        recordingStartTimeRef.current = null;
        
        const timer = setTimeout(() => {
          speakQuestion(currentQuestion.question, true); // 자동 녹음 시작
        }, 500);

        return () => {
          clearTimeout(timer);
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
          }
        };
      }
    }
  }, [currentQuestionIndex, questions]);

  // 타이머 카운트다운 로직
  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (isRecording) {
              handleStopRecording();
            }
            setIsTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [isTimerRunning, timeLeft, isRecording]);

  // 오디오 녹음 시작 (MediaRecorder + SpeechRecognition)
  const startRecording = async () => {
    if (!browserSupported) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 브라우저를 사용해주세요.');
      return;
    }

    try {
      finalTranscriptRef.current = '';
      recordingStartTimeRef.current = Date.now();
      console.log('녹음 시작:', new Date(recordingStartTimeRef.current).toLocaleTimeString());

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 녹음 중지 시 즉시 API로 전송
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        sendAudioForAnalysis(audioBlob);
      };

      mediaRecorderRef.current.start();

      // SpeechRecognition (백그라운드 - API 전송용)
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'ko-KR';
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + ' ';
            console.log('음성 인식 (백그라운드):', transcript);
          }
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (['no-speech', 'audio-capture', 'aborted'].includes(event.error)) {
          console.log('무시 가능한 에러:', event.error);
          return;
        }
        if (event.error === 'not-allowed') {
          alert('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
        }
      };

      // 음성 인식 자동 재시작
      recognitionRef.current.onend = () => {
        if (isRecordingRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current && recognitionRef.current) {
              try {
                recognitionRef.current.start();
              } catch (error) {
                console.error('음성 인식 재시작 실패:', error);
              }
            }
          }, 100);
        }
      };

      recognitionRef.current.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      
      if (!isTimerRunning) {
        setIsTimerRunning(true);
      }
    } catch (error) {
      console.error('마이크 접근 오류:', error);
      alert('마이크에 접근할 수 없습니다. 브라우저 설정에서 마이크 권한을 확인해주세요.');
    }
  };

  const handleStopRecording = async () => {
    console.log('=== 녹음 중지 ===');
    
    isRecordingRef.current = false;
    setIsRecording(false);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    if (timerRef.current) {
      clearInterval(timerRef.current);
    }

    setIsProcessing(true);
  };

  // 오디오 파일을 서버로 전송하여 분석
  const sendAudioForAnalysis = async (audioBlob) => {
    try {
      const finalAnswer = finalTranscriptRef.current.trim() || '답변 없음';
      
      const recordingEndTime = Date.now();
      const actualDurationInSeconds = recordingStartTimeRef.current 
        ? Math.round((recordingEndTime - recordingStartTimeRef.current) / 1000)
        : null;
      
      console.log('=== 분석 전송 ===');
      console.log('질문:', questions[currentQuestionIndex].question);
      console.log('답변 길이:', finalAnswer.length, '자');
      console.log('녹음 시간:', actualDurationInSeconds, '초');
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'interview_answer.webm');
      formData.append('question', questions[currentQuestionIndex].question);
      formData.append('transcript', finalAnswer);
      
      if (actualDurationInSeconds) {
        formData.append('actualDuration', actualDurationInSeconds.toString());
      }

      const response = await fetch('/api/interview/evaluate-delivery', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('오디오 분석 실패');
      }

      const analysisResult = await response.json();

      // 결과 저장 (STT 텍스트는 화면에 표시하지 않음)
      const newResult = {
        question: questions[currentQuestionIndex].question,
        userAnswer: finalAnswer, // 내부 저장용
        contentAdvice: analysisResult.contentFeedback?.advice || '',
        contentScore: analysisResult.contentFeedback?.score || null,
      };

      const updatedResults = [...results, newResult];
      setResults(updatedResults);

      // 다음 질문으로 이동 또는 완료
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      } else {
        if (onComplete) {
          onComplete(updatedResults);
        }
      }
    } catch (error) {
      console.error('오디오 분석 오류:', error);
      alert('음성 분석 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkip = () => {
    isRecordingRef.current = false;
    setIsRecording(false);
    recordingStartTimeRef.current = null;
    
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    finalTranscriptRef.current = '';
    
    const newResult = {
      question: questions[currentQuestionIndex].question,
      userAnswer: '건너뜀',
      contentAdvice: '답변을 건너뛰었습니다.',
      contentScore: null,
    };

    const updatedResults = [...results, newResult];
    setResults(updatedResults);

    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      if (onComplete) {
        onComplete(updatedResults);
      }
    }
  };

  if (!questions || questions.length === 0) {
    return <div>질문을 불러오는 중...</div>;
  }

  if (isProcessing) {
    return (
      <Card className="text-center py-12">
        <div className="text-4xl mb-4">🤔</div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">답변을 분석하는 중...</h3>
        <p className="text-gray-600 mb-4">잠시만 기다려주세요</p>
        <div className="animate-spin mx-auto w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
      </Card>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>진행률</span>
          <span>{currentQuestionIndex + 1} / {questions.length}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <Card>
        <div className="mb-6">
          <span className="inline-block px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-medium mb-4">
            질문 {currentQuestionIndex + 1}
          </span>
          <h2 className="text-2xl font-bold text-gray-800">
            {currentQuestion.question}
          </h2>
        </div>

        {/* Timer */}
        <div className="mb-6 text-center">
          {!isRecording && !isTimerRunning ? (
            <div className="mb-4">
              <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full">
                <span className="animate-pulse mr-2">🎧</span>
                <span className="font-medium">질문을 듣고 있습니다...</span>
              </div>
            </div>
          ) : null}
          <div className={`text-6xl font-bold ${timeLeft <= 10 ? 'text-red-600' : 'text-primary-600'}`}>
            {timeLeft}
          </div>
          <p className="text-gray-600 mt-2">초 남음</p>
        </div>

        {/* Recording status */}
        {isRecording && (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center px-6 py-3 bg-red-100 text-red-800 rounded-full animate-pulse">
              <span className="text-2xl mr-2">🎙️</span>
              <span className="font-bold">녹음 중...</span>
            </div>
            <p className="text-sm text-gray-600 mt-3">
              답변이 끝나면 &ldquo;답변 완료&rdquo; 버튼을 눌러주세요
            </p>
          </div>
        )}

        {!browserSupported && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-800 rounded-lg">
            <p className="font-medium">⚠️ 음성 인식이 지원되지 않습니다.</p>
            <p className="text-sm mt-1">Chrome 브라우저를 사용해주세요.</p>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-4">
          {isRecording ? (
            <Button
              onClick={handleStopRecording}
              fullWidth
              className="bg-green-600 hover:bg-green-700"
            >
              ✅ 답변 완료
            </Button>
          ) : (
            <Button
              onClick={handleSkip}
              variant="secondary"
              fullWidth
              disabled={!isTimerRunning}
            >
              건너뛰기
            </Button>
          )}
        </div>
        
        {!isRecording && timeLeft > 0 && (
          <p className="text-sm text-gray-500 text-center mt-3">
            💡 질문이 끝나면 자동으로 녹음이 시작됩니다
          </p>
        )}
      </Card>

      {/* Previous results - 간소화 */}
      {results.length > 0 && (
        <Card>
          <h3 className="text-lg font-bold text-gray-800 mb-4">이전 답변 결과</h3>
          <div className="space-y-4">
            {results.map((result, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="mb-3">
                  <span className="text-sm font-medium text-gray-700">질문 {index + 1}</span>
                </div>
                
                <div className="mb-3">
                  <p className="text-xs font-semibold text-gray-500 mb-1">질문</p>
                  <p className="text-sm text-gray-700 bg-white p-2 rounded">{result.question}</p>
                </div>

                {/* 내용 피드백만 표시 */}
                {result.contentAdvice && (
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-gray-500">💡 피드백</p>
                      {result.contentScore && (
                        <span className="text-xs font-bold text-primary-600">
                          점수: {result.contentScore}/10
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 bg-blue-50 p-3 rounded border border-blue-200">
                      {result.contentAdvice}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
