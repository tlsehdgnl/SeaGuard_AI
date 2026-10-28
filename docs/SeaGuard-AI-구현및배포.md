# SeaGuard AI MVP — 구현 및 배포 문서

작성일: 2026-10-29  
구현·배포 검증일: 2026-10-14 (KST)

이 문서는 기존 구현 파일과 배포 기록을 정리한 자료입니다. 작성일에 배포 상태를 새로 점검한 기록은 아닙니다.

## 1. 서비스 개요

SeaGuard AI는 동해시 **망상·추암·어달 해변**의 기상·해양 데이터를 바탕으로 위험 신호와 설명을 보여주는 MVP입니다.

기본 화면은 **고정 예시 데이터**를 사용합니다. 예시 값은 실제 관측값이나 현재 해변 상태를 나타내지 않습니다. 사용자가 외부 모델 예보 모드를 선택하면 Open-Meteo 기상·해양 예보를 조회합니다.

공식 경보, 입수 허가, 이안류 예측 서비스는 아닙니다. 현장 통제와 공식 특보를 우선해야 합니다.

## 2. 배포 주소

| 구분 | 주소 |
| --- | --- |
| 웹 화면 | https://seaguard-web.vercel.app |
| 백엔드 API | https://seaguard-api.vercel.app |
| API 상태 확인 | https://seaguard-api.vercel.app/api/health |
| API 문서 | https://seaguard-api.vercel.app/docs |
| 프론트엔드 관리 | https://vercel.com/donghwi1/seaguard-web |
| 백엔드 관리 | https://vercel.com/donghwi1/seaguard-api |

GitHub 저장소 없이 Vercel CLI로 프론트엔드와 백엔드를 각각 Production 배포했습니다. 관리 화면에는 계정 로그인이 필요합니다.

## 3. 기술 구성

| 영역 | 기술 및 역할 |
| --- | --- |
| 프론트엔드 | React, Vite, CSS 기반 반응형 UI |
| 백엔드 | Python, FastAPI, Uvicorn |
| 외부 HTTP 연결 | httpx, 기상·해양 API 병렬 조회 |
| 위험도 분석 | 서버의 고정 규칙 기반 계산 |
| 설명 | 규칙 기반 설명 + 선택적 LLM 보충 설명 |
| 배포 | Vercel의 Vite 프론트엔드와 FastAPI 백엔드 |
| 테스트 | unittest, FastAPI TestClient |

```text
사용자 브라우저
  └─ React 화면
       └─ FastAPI /api
            ├─ 고정 예시 데이터 또는 Open-Meteo 모델 예보
            ├─ 규칙 기반 위험도 계산
            └─ 규칙 설명 + 선택적 LLM 보충 설명
```

## 4. 구현 기능

- 망상·추암·어달 해변 선택 및 결과 갱신
- 파고, 풍속, 강수량, 기온 표시
- 낮음·주의·위험 등급과 산정 근거 표시
- 예시 데이터와 외부 모델 예보의 명시적 구분
- 데이터 출처, 기상·해양 데이터 시각, 응답 생성 시각 표시
- 강수량 집계 구간 표시
- 로딩, 요청 시간 초과, API 오류 및 재시도 처리
- 외부 예보 실패 시 오류 표시 및 사용자의 예시 모드 전환
- LLM 키 미설정·연결 실패 시 규칙 설명 제공
- 모바일 화면에 맞춘 세로 배치

## 5. 데이터 처리

### 예시 모드 — 기본값

| 해변 | 파고 | 풍속 | 강수량 | 기온 | 예시 등급 |
| --- | --- | --- | --- | --- | --- |
| 망상 | 0.6m | 3.2m/s | 0.0mm | 22.4°C | 낮음 |
| 추암 | 1.3m | 6.5m/s | 1.0mm | 20.1°C | 주의 |
| 어달 | 2.2m | 10.4m/s | 7.0mm | 19.8°C | 위험 |

위 값은 기능 시연을 위한 고정 합성 시나리오입니다. 관측 시각과 강수량 집계 구간은 없으며 관측 시각은 API에서 `null`로 반환합니다. 응답 생성 시각을 관측 시각처럼 표시하지 않습니다.

### 외부 모델 예보 모드

Open-Meteo 기상 및 해양 API를 조회합니다. 해변 인근 격자 예보이며 현장 관측값은 아닙니다. 좌표는 해변 인근 대표 좌표입니다.

- 필수 값, 수치 범위, 단위, 데이터 시각을 검사합니다.
- 데이터 시각은 현재 시각과 3시간 이내인지 확인합니다.
- 기상·해양 데이터 시각과 조회 시각을 구분합니다.
- 외부 호출에 시간 제한을 적용합니다.
- 실패하거나 불완전한 데이터가 반환되면 HTTP 503 오류를 반환합니다.
- 실패를 숨기고 예시 데이터를 자동으로 반환하지 않습니다.

한국 기상청·해양 공공데이터의 관측 API 연결은 아직 구현하지 않았습니다. 연결하려면 서비스 승인·키, 관측소 매핑, 제공 항목 및 단위 검증을 추가해야 합니다.

## 6. 위험도 규칙

| 항목 | 주의 | 위험 |
| --- | --- | --- |
| 파고 | 1m 이상 | 2m 이상 |
| 풍속 | 6m/s 이상 | 10m/s 이상 |
| 강수량 | 3mm 이상 | 7mm 이상 |

항목별 등급 중 가장 높은 것을 최종 등급으로 사용합니다. 기온은 표시만 하고 등급에 반영하지 않습니다. 강수량은 제공 구간의 값이며 화면에 구간 길이를 표시합니다.

이 임계값은 **MVP 시연용**입니다. 공식 기준이나 검증된 안전 판정 모델이 아닙니다. 낮음 등급도 입수 안전을 보장하지 않습니다. 이안류·낙뢰·조석·수심·현장 통제 정보는 분석하지 않습니다.

## 7. LLM 설명

위험 등급은 항상 규칙으로 계산합니다. LLM은 선택적으로 보충 설명만 작성하고, 규칙 기반 행동 안내는 화면에 유지합니다.

| 환경 변수 | 용도 |
| --- | --- |
| `LLM_API_KEY` | 공급자 인증 키 |
| `LLM_API_URL` | chat-completions 호환 전체 API 주소 |
| `LLM_MODEL` | 공급자의 모델 ID |

키 또는 주소가 없으면 규칙 설명으로 동작합니다. 연결 실패·빈 응답·잘못된 응답에도 규칙 설명으로 복귀합니다. LLM 키는 백엔드에만 설정합니다. 배포 당시에는 키를 설정하지 않았으며 실제 LLM 호출 성공은 검증하지 않았습니다.

## 8. 프로젝트 구조

```text
seaguard/
├─ backend/
│  ├─ app/main.py          # API, 데이터 연결, 위험 계산, 설명
│  ├─ tests/test_api.py    # 백엔드 테스트
│  ├─ requirements.txt
│  ├─ vercel.json
│  └─ .python-version
├─ frontend/
│  ├─ src/main.jsx         # 화면 및 API 요청
│  ├─ src/style.css        # 반응형 스타일
│  ├─ vite.config.js       # 로컬 API 프록시
│  ├─ package.json
│  └─ vercel.json
├─ README.md
├─ TEST_RESULTS.md
├─ VERCEL_DEPLOY.md
└─ DEPLOYMENT.md
```

## 9. 로컬 실행

Python 3.12와 Vite 실행 요건을 충족하는 Node.js 환경을 준비합니다. 프로젝트의 `seaguard` 폴더에서 터미널 두 개를 사용합니다.

### 백엔드

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 프론트엔드

```powershell
cd frontend
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다. 로컬 API 문서는 http://127.0.0.1:8000/docs 입니다. Vite 개발 서버가 `/api` 요청을 백엔드로 전달합니다.

`.env.example`은 참고 파일이며 백엔드에서 자동으로 읽지 않습니다. 필요한 환경 변수는 실행 전 셸이나 배포 환경에 설정합니다.

## 10. Vercel 설정 및 재배포

| 프로젝트 | Production 환경 변수 | 배포 당시 저장 값 |
| --- | --- | --- |
| 프론트엔드 | `VITE_API_BASE_URL` | `https://seaguard-api.vercel.app` |
| 백엔드 | `CORS_ORIGINS` | `https://seaguard-web.vercel.app` |

환경 변수는 Vercel 프로젝트에 저장했습니다. 프론트엔드는 해당 백엔드로 요청하고, 백엔드는 지정한 화면 도메인의 브라우저 요청을 허용합니다.

로그인된 터미널에서 수정한 프로젝트 폴더로 이동해 실행합니다.

```powershell
npx vercel@latest --prod
```

프론트엔드 수정은 `frontend`, 백엔드 수정은 `backend`에서 실행합니다. 다른 컴퓨터에서 ZIP을 풀었다면 먼저 다음 명령으로 해당 폴더를 **기존 Vercel 프로젝트**에 연결합니다.

```powershell
npx vercel@latest login
npx vercel@latest link
```

프론트엔드의 `VITE_` 환경 변수는 빌드 시 반영되므로 값을 변경하면 프론트엔드를 재배포해야 합니다. 백엔드 환경 변수 변경도 새 배포에 반영해야 합니다. ZIP에는 인증 정보나 컴퓨터별 `.vercel` 연결 정보가 포함되지 않습니다.

## 11. 테스트 및 검증 기록

2026-10-14에 다음 사항을 확인했습니다.

- 백엔드 자동 테스트 **7개 통과**
- 프론트엔드 프로덕션 빌드 성공
- 로컬 서버 및 공개 배포 API 연결 성공
- 세 해변의 예시 등급과 설명 전환 확인
- Open-Meteo 기상·해양 예보 실제 조회 성공
- 데이터 종류, 출처, 데이터 시각, 강수 구간 표시 확인
- 모바일 문서 너비와 콘텐츠 너비가 375px로 가로 넘침 없음
- 최종 공개 화면 확인 시 브라우저 콘솔 오류 없음

백엔드 테스트:

```powershell
cd backend
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

프론트엔드 빌드:

```powershell
cd frontend
npm run build
```

자동 테스트는 해변별 예시 응답, 임계값 경계, 잘못된 입력, API 경로, 외부 API 실패, 예보 메타데이터 및 LLM 실패 시 규칙 설명 복귀를 검사합니다. 외부 오류는 모의 응답으로 검증했습니다. 운영 부하 테스트는 수행하지 않았습니다.

## 12. 후속 개발 항목

- 기상청·해양 관측 데이터 공급자 연결 및 관측소 매핑
- 공식 특보와 현장 통제 정보 연결
- 위험 규칙의 전문가 검토와 검증
- 실제 LLM 공급자 키 연결 및 출력 품질 평가
- 요청 제한, 모니터링, 운영 로그와 부하 검증
- Git 저장소 연결 및 변경 이력 관리

기존 개발계획서 본문은 참조 대화에서 읽을 수 없어, 사용자 요청에 명시된 요구사항을 기준으로 구현했습니다.

## 13. 참고 링크

- [Open-Meteo 기상 API](https://open-meteo.com/en/docs)
- [Open-Meteo 해양 API](https://open-meteo.com/en/docs/marine-weather-api)
- [Vercel FastAPI 문서](https://vercel.com/docs/frameworks/backend/fastapi)
- [Vercel Vite 문서](https://vercel.com/docs/frameworks/frontend/vite)

위 링크는 기존 구현·배포 시 참고한 자료입니다.
