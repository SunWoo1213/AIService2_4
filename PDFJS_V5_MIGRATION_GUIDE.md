# pdfjs-dist v5 마이그레이션 가이드

**작성일**: 2025-11-12  
**업데이트 버전**: v3.11.174 → v5.4.394

---

## 🚨 Breaking Changes 요약

### 1. ES Module 전환
- v3: CommonJS 기본 지원
- v5: **ES Module 전용** (`.mjs` 확장자)

### 2. Worker 경로 설정 변경
```javascript
// ❌ v3 방식 (더 이상 작동 안 함)
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// ✅ v5 방식
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  '/pdf.worker.min.mjs';  // public 폴더에 위치
```

### 3. Import 방식 변경
```javascript
// ❌ v3 방식
const pdfjsLib = await import('pdfjs-dist');

// ✅ v5 방식 (권장)
import * as pdfjsLib from 'pdfjs-dist';
// 또는
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
```

---

## 📝 수정 사항

### 파일: `src/app/components/JobUploader.jsx`

#### Before (v3)
```javascript
const extractTextFromPDF = async (file) => {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 
    `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  // ...
};
```

#### After (v5)
```javascript
const extractTextFromPDF = async (file) => {
  // Dynamic import for v5
  const pdfjsLib = await import('pdfjs-dist');
  
  // v5에서는 worker 파일이 /pdf.worker.min.mjs로 변경됨
  // Next.js의 경우 public 폴더에 worker 파일 배치 필요
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  
  return fullText;
};
```

---

## 🔧 Worker 파일 설정 (Next.js)

### 방법 1: Public 폴더에 Worker 파일 복사 (권장)

```bash
# node_modules에서 worker 파일을 public 폴더로 복사
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

또는 `package.json`에 스크립트 추가:

```json
{
  "scripts": {
    "postinstall": "cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/"
  }
}
```

### 방법 2: CDN 사용 (v5 호환)

```javascript
pdfjsLib.GlobalWorkerOptions.workerSrc = 
  `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
```

---

## ✅ 완전한 수정 코드

```javascript
'use client';

import { useState } from 'react';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import Card from './ui/Card';

export default function JobUploader({ onAnalysisComplete }) {
  const [jobText, setJobText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('text');

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('PDF 파일만 업로드 가능합니다.');
      return;
    }

    setFile(selectedFile);
    setError('');

    try {
      const text = await extractTextFromPDF(selectedFile);
      setJobText(text);
    } catch (err) {
      console.error('PDF extraction error:', err);
      setError('PDF 텍스트 추출에 실패했습니다. 텍스트를 직접 입력해주세요.');
    }
  };

  const extractTextFromPDF = async (file) => {
    try {
      // ===== [v5 업데이트] Dynamic import 방식 =====
      const pdfjsLib = await import('pdfjs-dist');
      
      // ===== [v5 업데이트] Worker 경로 설정 =====
      // CDN 사용 (빌드 시 public 폴더 복사 불필요)
      pdfjsLib.GlobalWorkerOptions.workerSrc = 
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

      const arrayBuffer = await file.arrayBuffer();
      
      // ===== [v5 업데이트] getDocument 사용법 동일 =====
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      
      let fullText = '';
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map(item => item.str)
          .join(' ');
        fullText += pageText + '\n';
      }
      
      return fullText.trim();
      
    } catch (error) {
      console.error('PDF 추출 중 에러:', error);
      throw new Error('PDF 텍스트 추출 실패: ' + error.message);
    }
  };

  // ... 나머지 코드 동일
}
```

---

## 🧪 테스트 체크리스트

- [ ] PDF 파일 업로드 시 텍스트가 정상적으로 추출되는가?
- [ ] 여러 페이지의 PDF도 정상 작동하는가?
- [ ] 에러 처리가 잘 되는가?
- [ ] 빌드 시 에러가 없는가?
- [ ] Vercel 배포 후 정상 작동하는가?

---

## 🚀 배포 주의사항

### Vercel 배포 시
- Worker 파일이 CDN에서 로드되므로 추가 설정 불필요
- 단, 인터넷 연결이 필요함

### 자체 호스팅 시
```bash
# public 폴더에 worker 파일 복사 필수
npm run postinstall
```

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant

