# Vercel 배포 — GitHub 없이 직접 올리기

현재 프로젝트는 **백엔드 1개 + 프론트엔드 1개**, 총 두 Vercel 프로젝트로 배포하도록 설정했습니다. GitHub 저장소는 없어도 됩니다. FastAPI와 Vite 모두 Vercel에서 지원합니다.

## 1. 로그인

Node.js가 설치된 컴퓨터에서 ZIP을 풀고 `seaguard` 폴더를 터미널로 여세요.

```powershell
npx vercel@latest login
```

로그인은 브라우저에서 본인의 계정으로 진행하세요. 비밀번호나 Vercel 토큰을 채팅에 보내지 않아도 됩니다.

## 2. 백엔드 배포

```powershell
cd backend
npx vercel@latest --prod
```

첫 실행에서 계정/팀을 선택하고 새 프로젝트를 만드세요. 프로젝트 이름은 예를 들어 `seaguard-api`로 지정할 수 있습니다. 배포 폴더는 현재 폴더(`./`)를 선택합니다. 프레임워크는 FastAPI이며 `app/main.py`의 앱을 사용합니다. Build Command / Output Directory를 프론트엔드용으로 지정하지 마세요.

완료되면 Vercel 프로젝트의 **고정 운영 도메인**을 복사합니다. 예를 들어 `https://seaguard-api-본인계정.vercel.app` 같은 주소입니다. 매 배포마다 바뀌는 해시 주소 대신 프로젝트 도메인을 사용하세요.

브라우저에서 `백엔드주소/api/health`가 `{"status":"ok","version":"1.0.0"}`를 반환하는지 확인하세요. `/docs`에서도 API를 시험할 수 있습니다.

## 3. 프론트엔드 배포 및 API 주소 설정

```powershell
cd ../frontend
npx vercel@latest link
npx vercel@latest env add VITE_API_BASE_URL production
```

`link`에서 새 프로젝트(예: `seaguard-web`)를 생성합니다. 환경 변수 값에는 **2단계의 백엔드주소만** 입력합니다. 마지막 `/`와 `/api`를 붙이지 마세요.

```powershell
npx vercel@latest --prod
```

프레임워크 Vite, 빌드 `npm run build`, 출력 `dist`입니다. 설정 파일에 들어 있습니다. 완성된 프론트엔드의 고정 운영 도메인을 복사하세요.

## 4. 백엔드에서 프론트엔드 접속 허용

```powershell
cd ../backend
npx vercel@latest env add CORS_ORIGINS production
```

값에는 **3단계 프론트엔드주소만** 입력합니다. 예: `https://seaguard-web-본인계정.vercel.app`. 끝의 `/`와 경로를 붙이지 마세요. 여러 주소가 필요하면 공백 없이 쉼표로 구분합니다. `*`로 열지 않아도 됩니다.

```powershell
npx vercel@latest --prod
```

이제 프론트엔드주소를 열어 세 해변을 선택하고 확인합니다. 기본 예시 데이터 모드는 API 키가 필요 없습니다. 외부 모델 예보 모드도 별도로 확인하세요.

## 선택: AI 보충 설명 활성화

백엔드 프로젝트의 Settings → Environment Variables에서 `LLM_API_KEY`, `LLM_API_URL`, `LLM_MODEL`을 Production 환경에 추가한 뒤 백엔드를 재배포합니다. 키가 없으면 규칙 설명으로 정상 작동합니다. 키는 프론트엔드나 `VITE_` 환경 변수에 넣지 마세요.

## 오류 확인

- 화면에 서버 연결 오류: `VITE_API_BASE_URL` 주소와 백엔드 `/api/health` 확인.
- 개발자 도구에 CORS 오류: 백엔드 `CORS_ORIGINS`가 프론트엔드 고정 도메인과 정확히 같은지 확인 후 재배포.
- 401 또는 로그인 페이지: 백엔드 배포의 Deployment Protection 설정 확인. 프론트엔드가 사용할 API는 일반 브라우저에서 JSON 응답을 받을 수 있어야 합니다. 운영 API는 필요에 맞는 인증·요청 제한을 별도로 설계하세요.
- 프론트엔드 환경 변수 변경 후에도 이전 주소로 요청: `VITE_` 변수는 빌드 시 포함되므로 프론트엔드 재배포 필요.
- `/api/risk/...` 503: 외부 공급자 연결/응답 오류. 화면에서 예시 모드를 직접 선택할 수 있습니다.
- Preview URL은 위 Production 설정과 별개입니다. 이 안내대로 검증할 때는 `--prod`로 배포한 고정 주소를 사용하세요.

실제 배포 성공 여부는 배포 후 주소에서 확인해야 합니다. 이 설정 파일의 존재만으로 배포가 완료되지는 않습니다.

공식 문서: [FastAPI 배포](https://vercel.com/docs/frameworks/backend/fastapi), [Vite 배포](https://vercel.com/docs/frameworks/frontend/vite), [CLI 배포](https://vercel.com/docs/cli/deploy).
