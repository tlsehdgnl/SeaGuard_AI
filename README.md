# SeaGuard AI MVP

동해시 망상·추암·어달 해변의 기상 위험 신호를 보여주는 실행 가능한 React + Vite / Python FastAPI 앱입니다. **기본 화면은 고정 예시 데이터이며 실제 관측값이 아닙니다.**

Vercel로 배포하려면 [GitHub 없이 배포하는 방법](VERCEL_DEPLOY.md)을 사용하세요. 백엔드/프론트엔드 각 폴더에 Vercel 설정을 포함했습니다.

## 실행 (Windows PowerShell, Python 3.11+ / Node.js 20.19+ 또는 22.12+)

다운로드한 프로젝트 폴더에서 터미널 두 개를 사용합니다.

백엔드:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

프론트엔드:

```powershell
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 여세요. API 문서: http://127.0.0.1:8000/docs . pnpm 사용자라면 `pnpm install`, `pnpm dev`를 사용할 수 있습니다. 설치 환경에서 esbuild 스크립트 승인이 요구되면 해당 의존성만 승인하세요. 개발 서버는 `/api` 요청을 백엔드로 전달합니다.

## 데이터 연결

- `demo` (기본): 망상 낮음 / 추암 주의 / 어달 위험의 고정 합성 시나리오. 관측 시각은 `null`입니다. 응답 생성 시각과 데이터 시각을 분리합니다.
- `forecast` (화면에서 직접 선택): Open-Meteo 기상 및 해양 API 병렬 조회. 키 없이 연결 가능한 외부 모델 예보이며 **한국 공공데이터 관측 연동이 아닙니다**. 인근 격자 값이며 해변 현장값이 아닙니다. 10초 제한, 단위·필수값·범위·3시간 이내 시각 검증을 적용합니다. 실패하면 503과 안내를 반환하며 예시 데이터를 몰래 대체하지 않습니다.
- 기상청/해양 공공데이터 API: 이번 결과물에서는 실제 연결하지 않았습니다. 키·서비스 승인·관측소와 해변 매핑이 필요합니다. `backend/app/main.py`의 `forecast()`를 같은 반환 형식의 관측 provider로 교체하고 출처·데이터 종류·관측 시각을 함께 변경해야 합니다. 키만 넣으면 자동 연결되는 기능으로 안내하지 않습니다. 기본 예시 모드는 공공 API 키 없이 실행됩니다.
- 위·경도는 해변 인근 대표 좌표이며 정밀 측량 좌표가 아닙니다.
- 실제 조회 시각은 KST, 강수량은 API의 `current.interval` 구간 누적값입니다. 고정 예시에는 집계 구간이 없습니다.

출처: [기상 API](https://open-meteo.com/en/docs), [해양 API](https://open-meteo.com/en/docs/marine-weather-api). Open-Meteo / DWD 및 제공 모델을 화면에서 표기합니다. 상업 사용 전 공급자 이용 조건과 모델별 출처 조건을 확인하세요.

## 위험 분석 및 AI 설명

MVP 예시 기준으로 파고 1/2m, 풍속 6/10m/s, 강수량 3/7mm 이상을 주의/위험으로 나눕니다. 가장 높은 항목을 최종 등급으로 사용합니다. 이 임계값은 공식 기준이나 안전 검증 결과가 아닙니다. 기온은 표시만 합니다. 낮음은 안전 판정이 아닙니다. 이안류·낙뢰·조석·수심·현장 입수 통제를 분석하지 않습니다.

키가 없으면 규칙 기반 설명을 사용합니다. LLM은 등급을 계산하지 않고 보충 설명만 작성합니다. 규칙 기반 행동 안내는 항상 함께 유지합니다. AI 보충은 검증되지 않은 텍스트임을 표시하며 HTML로 실행하지 않습니다. 연결 실패/빈 응답/잘못된 응답에는 규칙 설명으로 복귀합니다.

LLM 연결은 백엔드 실행 전에 환경 변수로 지정합니다 (`.env.example`은 참고용이며 자동 로드하지 않습니다).

```powershell
$env:LLM_API_KEY = '실제 키'
$env:LLM_API_URL = 'https://공급자주소/전체/chat/completions/경로'
$env:LLM_MODEL = '사용 가능한 모델 ID'
```

OpenAI 호환 chat-completions 요청/응답 형식을 지원하는 공급자를 사용합니다. 사용자 키는 프론트엔드에 전달하지 않습니다. 운영 환경에서는 HTTPS endpoint, 비밀 관리, 요청 제한과 AI 출력 검증을 추가하세요. 프론트엔드 API 주소 변경은 `VITE_API_BASE_URL`, 백엔드 허용 출처 변경은 `CORS_ORIGINS`를 사용합니다.

## 테스트 및 빌드

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

```powershell
cd frontend
npm run build
```

단위/통합 테스트는 해변별 예시 응답, 위험 임계값 경계, 잘못된 입력, 404/422, 외부 API 실패(예시 자동 대체 금지), 예보 메타데이터, LLM 실패를 확인합니다. 외부 서비스 테스트는 키와 네트워크가 필요합니다. 빌드 결과는 `frontend/dist`입니다. 배포 시 정적 프론트엔드와 백엔드를 따로 호스팅하고 `/api` 프록시 또는 API 주소/CORS를 설정하세요. Vite preview에는 개발 프록시가 없으므로 실제 앱 사용은 dev 명령 또는 배포 프록시를 사용하세요.

## 계획서 참조 제한

기존 대화 기록 조회에서 개발계획서 본문은 콘텐츠 참조 토큰으로만 반환되어 원문을 확인하지 못했습니다. 이번 사용자 요청의 명시적 요구사항에 맞춰 구현했습니다.
