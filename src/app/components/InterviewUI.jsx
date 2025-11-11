'use client';

import { useState, useEffect, useRef } from 'react';
import Button from './ui/Button';
import Card from './ui/Card';
import { storage, db } from '@/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, Timestamp } from 'firebase/firestore';

export default function InterviewUI({ userId, initialQuestion, jobKeywords, resumeText, onComplete, tonePreference = 'friendly' }) {
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestion);
  const [questionCount, setQuestionCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(initialQuestion?.time_limit || 60);
  const [isRecording, setIsRecording] = useState(false);
  const [results, setResults] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [interviewId] = useState(() => `interview_${Date.now()}`); // 면접 세션 고유 ID
  const [streamingQuestion, setStreamingQuestion] = useState(''); // 스트리밍 중인 질문
  const [isStreaming, setIsStreaming] = useState(false); // 스트리밍 상태
  const MAX_QUESTIONS = 5; // 최대 질문 수

  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef(null);

  // TTS 기능: 질문을 음성으로 읽어주는 함수 (자동 녹음 제거)
  const speakQuestion = (text) => {
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

  // 질문 변경 시: 타이머 리셋 및 TTS 시작 (자동 녹음 제거)
  useEffect(() => {
    if (currentQuestion && typeof window !== 'undefined' && window.speechSynthesis) {
      setIsTimerRunning(false);
      setTimeLeft(currentQuestion.time_limit);
      finalTranscriptRef.current = '';
      isRecordingRef.current = false;
      recordingStartTimeRef.current = null;
      
      const timer = setTimeout(() => {
        speakQuestion(currentQuestion.question); // 자동 녹음 제거
      }, 500);

      return () => {
        clearTimeout(timer);
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
      };
    }
  }, [currentQuestion]);

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
        
        // [진단 1단계] 오디오 데이터 생성 확인
        console.log('[진단 1단계] 오디오 데이터:', audioBlob.size, 'bytes', '타입:', audioBlob.type);
        
        sendAudioForAnalysis(audioBlob);
      };

      mediaRecorderRef.current.start();

      // SpeechRecognition (백그라운드 - API 전송용)
      // 사용자가 답변 완료 버튼을 누를 때까지 계속 녹음
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'ko-KR';
      recognitionRef.current.continuous = true; // 연속 녹음 활성화
      recognitionRef.current.interimResults = true; // 중간 결과 표시
      recognitionRef.current.maxAlternatives = 1; // 최적화

      recognitionRef.current.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + ' ';
            console.log('음성 인식 (최종):', transcript);
          } else {
            // 중간 결과도 로깅 (디버깅용)
            console.log('음성 인식 (중간):', transcript);
          }
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        // no-speech 에러는 침묵일 때 발생하지만, 계속 녹음해야 함
        if (['no-speech', 'audio-capture', 'aborted'].includes(event.error)) {
          console.log('일시적 에러 (무시):', event.error);
          // 자동 재시작하도록 onend에서 처리됨
          return;
        }
        
        if (event.error === 'not-allowed') {
          alert('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
          isRecordingRef.current = false;
          setIsRecording(false);
        }
      };

      // 음성 인식 자동 재시작 (정적 감지로 중단되어도 계속 녹음)
      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended, 재시작 시도...');
        
        // 사용자가 답변 완료 버튼을 누르지 않았다면 계속 녹음
        if (isRecordingRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current && recognitionRef.current) {
              try {
                console.log('Speech recognition 재시작 중...');
                recognitionRef.current.start();
              } catch (error) {
                // 이미 시작된 경우 발생하는 에러 무시
                if (error.message && error.message.includes('already started')) {
                  console.log('이미 시작됨, 무시');
                } else {
                  console.error('음성 인식 재시작 실패:', error);
                  // 재시도
                  setTimeout(() => {
                    if (isRecordingRef.current && recognitionRef.current) {
                      try {
                        recognitionRef.current.start();
                      } catch (e) {
                        console.error('재시도 실패:', e);
                      }
                    }
                  }, 300);
                }
              }
            }
          }, 100);
        } else {
          console.log('녹음 중지됨, 재시작하지 않음');
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

    // [중요] 타이머 완전히 해제
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsTimerRunning(false);

    setIsProcessing(true);
  };

  // ===== 백그라운드에서 답변 평가 및 저장 (fire-and-forget) =====
  const evaluateAnswerInBackground = async (
    audioBlob,
    transcript,
    question,
    audioURL,
    duration
  ) => {
    try {
      console.log('[백그라운드] 답변 평가 시작');
      
      const formData = new FormData();
      formData.append('audio', audioBlob, 'interview_answer.webm');
      formData.append('question', question);
      formData.append('transcript', transcript);
      
      if (duration) {
        formData.append('actualDuration', duration.toString());
      }

      const response = await fetch('/api/interview/evaluate-delivery', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('답변 평가 실패');
      }

      const analysisResult = await response.json();
      console.log('[백그라운드] 답변 평가 완료:', analysisResult);

      // Firestore에 저장
      if (db) {
        const answerData = {
          userId: userId,
          interviewId: interviewId,
          questionId: `q${questionCount + 1}`,
          question: question,
          transcript: transcript,
          audioURL: audioURL,
          feedback: analysisResult.contentFeedback?.advice || '',
          score: analysisResult.contentFeedback?.score || null,
          duration: duration,
          timestamp: Timestamp.now(),
          createdAt: new Date().toISOString()
        };
        
        const docRef = await addDoc(collection(db, 'interview_answers'), answerData);
        console.log('[백그라운드] Firestore 저장 완료. 문서 ID:', docRef.id);
      }
    } catch (error) {
      console.error('[백그라운드] 평가 및 저장 오류:', error);
      throw error;
    }
  };

  // 오디오 파일을 서버로 전송하여 분석 및 Firebase에 저장
  const sendAudioForAnalysis = async (audioBlob) => {
    try {
      const finalAnswer = finalTranscriptRef.current.trim() || '답변 없음';
      
      const recordingEndTime = Date.now();
      const actualDurationInSeconds = recordingStartTimeRef.current 
        ? Math.round((recordingEndTime - recordingStartTimeRef.current) / 1000)
        : null;
      
      console.log('=== Firebase Storage 업로드 및 백그라운드 평가 시작 ===');
      console.log('질문:', currentQuestion.question);
      console.log('답변 길이:', finalAnswer.length, '자');
      console.log('녹음 시간:', actualDurationInSeconds, '초');

      // ===== Firebase Storage 업로드 시작 =====
      console.log('=== Firebase Storage 업로드 시작 ===');
      
      let audioURL = null;
      
      if (storage) {
        try {
          // 1단계: Firebase Storage에 오디오 파일 업로드
          const questionId = `q${questionCount + 1}`;
          const fileName = `${questionId}_${Date.now()}.webm`;
          const storagePath = `recordings/${userId}/${interviewId}/${fileName}`;
          const storageReference = ref(storage, storagePath);
          
          console.log('[Firebase] 업로드 경로:', storagePath);
          console.log('[Firebase] 파일 크기:', audioBlob.size, 'bytes');
          
          const uploadResult = await uploadBytes(storageReference, audioBlob, {
            contentType: 'audio/webm'
          });
          
          console.log('[Firebase] 업로드 완료:', uploadResult.metadata.fullPath);
          
          // 2단계: 다운로드 URL 가져오기
          audioURL = await getDownloadURL(storageReference);
          console.log('[Firebase] 다운로드 URL 획득:', audioURL.substring(0, 50) + '...');
          
        } catch (storageError) {
          console.error('[Firebase] Storage 업로드 실패:', storageError);
          // Storage 실패해도 계속 진행 (URL은 null)
        }
      } else {
        console.warn('[Firebase] Storage가 초기화되지 않았습니다. 오디오 파일이 저장되지 않습니다.');
      }

      // ===== [최적화] 답변 평가를 백그라운드로 처리 (fire-and-forget) =====
      // 백그라운드에서 답변 평가 및 Firestore 저장 (await 없이)
      evaluateAnswerInBackground(
        audioBlob,
        finalAnswer,
        currentQuestion.question,
        audioURL,
        actualDurationInSeconds
      ).catch(error => {
        console.error('[백그라운드] 답변 평가 실패:', error);
        // 에러가 발생해도 사용자 플로우에는 영향 없음
      });

      // 로컬 상태에는 임시로 저장 (피드백은 나중에 업데이트될 수 있음)
      const newResult = {
        question: currentQuestion.question,
        userAnswer: finalAnswer,
        audioURL: audioURL,
        contentAdvice: '평가 중...', // 백그라운드에서 평가 중
        contentScore: null,
      };

      const updatedResults = [...results, newResult];
      setResults(updatedResults);

      // 다음 질문 요청 또는 면접 완료
      const nextQuestionCount = questionCount + 1;
      
      if (nextQuestionCount < MAX_QUESTIONS) {
        // ===== [최적화] 다음 질문을 스트리밍으로 요청 =====
        console.log('=== 다음 질문 스트리밍 요청 ===');
        console.log('이전 질문:', currentQuestion.question);
        console.log('이전 답변:', finalAnswer.substring(0, 100));
        
        setIsStreaming(true);
        setStreamingQuestion('');
        
        try {
          const response = await fetch('/api/interview/generate-questions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jobKeywords: jobKeywords,
              resumeText: resumeText,
              previousAnswer: finalAnswer,
              previousQuestion: currentQuestion.question,
              questionCount: nextQuestionCount,
              streaming: true // 스트리밍 활성화
            }),
          });

          if (!response.ok) {
            throw new Error('다음 질문 생성 실패');
          }

          // SSE 스트림 읽기
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullQuestion = '';

          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullQuestion += parsed.content;
                    setStreamingQuestion(fullQuestion);
                  }
                } catch (e) {
                  console.error('스트림 파싱 오류:', e);
                }
              }
            }
          }

          setIsStreaming(false);
          console.log('스트리밍 완료:', fullQuestion);

          // JSON 파싱하여 질문 추출
          const jsonMatch = fullQuestion.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const questionData = JSON.parse(jsonMatch[0]);
            setCurrentQuestion(questionData);
            setQuestionCount(nextQuestionCount);
            setStreamingQuestion('');
            
            // 스트리밍 완료 후 TTS로 질문 읽어주기
            setTimeout(() => {
              speakQuestion(questionData);
            }, 500); // 0.5초 딜레이 후 TTS 시작
          } else {
            throw new Error('질문 파싱 실패');
          }
        } catch (streamError) {
          console.error('스트리밍 오류:', streamError);
          setIsStreaming(false);
          
          // 폴백: 비스트리밍 방식으로 재시도
          console.log('폴백: 비스트리밍 방식으로 재시도');
          const fallbackResponse = await fetch('/api/interview/generate-questions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jobKeywords: jobKeywords,
              resumeText: resumeText,
              previousAnswer: finalAnswer,
              previousQuestion: currentQuestion.question,
              questionCount: nextQuestionCount,
              streaming: false
            }),
          });

          if (!fallbackResponse.ok) {
            throw new Error('다음 질문 생성 실패');
          }

          const fallbackData = await fallbackResponse.json();
          setCurrentQuestion(fallbackData.question);
          setQuestionCount(nextQuestionCount);
          
          // 폴백 완료 후 TTS로 질문 읽어주기
          setTimeout(() => {
            speakQuestion(fallbackData.question);
          }, 500);
        }
      } else {
        // 면접 완료
        console.log('=== 면접 완료 ===');
        if (onComplete) {
          onComplete(updatedResults);
        }
      }
    } catch (error) {
      // [진단 3단계] 에러 발생 시
      console.error('[진단 3단계] STT API 에러:', error);
      console.error('[진단 3단계] 에러 상세:', {
        message: error.message,
        stack: error.stack
      });
      
      alert('음성 분석 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };


  if (!currentQuestion) {
    return <div>질문을 불러오는 중...</div>;
  }

  if (isProcessing) {
    if (isStreaming && streamingQuestion) {
      // 스트리밍 중: 질문이 타이핑되듯이 표시
      return (
        <Card className="text-center py-12">
          <div className="text-4xl mb-4">✨</div>
          <h3 className="text-xl font-bold text-gray-800 mb-4">다음 질문이 생성되고 있습니다...</h3>
          <div className="text-left max-w-2xl mx-auto bg-blue-50 border-2 border-blue-200 rounded-lg p-6">
            <p className="text-lg text-gray-800 whitespace-pre-wrap">
              {streamingQuestion}
              <span className="inline-block w-2 h-5 bg-primary-600 ml-1 animate-pulse"></span>
            </p>
          </div>
          <p className="text-gray-500 text-sm mt-4">답변 평가는 백그라운드에서 진행됩니다</p>
        </Card>
      );
    } else {
      // 스트리밍 전: 로딩
      return (
        <Card className="text-center py-12">
          <div className="text-4xl mb-4">🤔</div>
          <h3 className="text-xl font-bold text-gray-800 mb-2">다음 질문을 준비하는 중...</h3>
          <p className="text-gray-600 mb-4">곧 질문이 표시됩니다</p>
          <div className="animate-spin mx-auto w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-500 text-sm mt-4">답변 평가는 백그라운드에서 진행됩니다</p>
        </Card>
      );
    }
  }

  const progress = ((questionCount + 1) / MAX_QUESTIONS) * 100;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>진행률</span>
          <span>{questionCount + 1} / {MAX_QUESTIONS}</span>
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
            질문 {questionCount + 1}
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
          {isTimerRunning && (
            <>
              <div className={`text-6xl font-bold ${timeLeft <= 10 ? 'text-red-600' : 'text-primary-600'}`}>
                {timeLeft}
              </div>
              <p className="text-gray-600 mt-2">초 남음</p>
            </>
          )}
        </div>

        {/* Recording status */}
        {isRecording && (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center px-6 py-3 bg-red-100 text-red-800 rounded-full animate-pulse">
              <span className="text-2xl mr-2">🎙️</span>
              <span className="font-bold">녹음 중...</span>
            </div>
            <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-semibold mb-1">
                💡 중요: 잠시 멈추셔도 괜찮습니다
              </p>
              <p className="text-xs text-blue-700">
                생각할 시간이 필요하면 잠시 멈추셔도 녹음은 계속됩니다.<br />
                답변이 완전히 끝나면 아래 <strong>&ldquo;답변 완료&rdquo;</strong> 버튼을 눌러주세요.
              </p>
            </div>
          </div>
        )}

        {!browserSupported && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-800 rounded-lg">
            <p className="font-medium">⚠️ 음성 인식이 지원되지 않습니다.</p>
            <p className="text-sm mt-1">Chrome 브라우저를 사용해주세요.</p>
          </div>
        )}

        {/* Controls */}
        {!isRecording && !isTimerRunning && (
          <div className="space-y-3">
            <Button
              onClick={startRecording}
              fullWidth
              className="bg-primary-600 hover:bg-primary-700 text-lg py-4 font-bold shadow-lg"
            >
              🎤 녹음 시작
            </Button>
            <p className="text-xs text-center text-gray-500">
              준비가 되면 위 버튼을 눌러 답변을 시작하세요
            </p>
          </div>
        )}
        
        {isRecording && (
          <div className="space-y-3">
            <Button
              onClick={handleStopRecording}
              fullWidth
              className="bg-green-600 hover:bg-green-700 text-lg py-4 font-bold shadow-lg"
            >
              ✅ 답변 완료
            </Button>
            <p className="text-xs text-center text-gray-500">
              답변이 모두 끝났다면 위 버튼을 눌러주세요
            </p>
          </div>
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
