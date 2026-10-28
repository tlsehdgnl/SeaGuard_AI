# Vercel 배포 완료

배포 및 검증: 2026-10-14 01:00 KST

- 공개 웹 화면: https://seaguard-web.vercel.app
- 백엔드 API: https://seaguard-api.vercel.app
- API 상태 확인: https://seaguard-api.vercel.app/api/health
- API 문서: https://seaguard-api.vercel.app/docs
- 화면 관리: https://vercel.com/donghwi1/seaguard-web
- 백엔드 관리: https://vercel.com/donghwi1/seaguard-api

GitHub 없이 Vercel CLI로 두 프로젝트를 Production 배포했습니다. 각 폴더가 Vercel 프로젝트에 연결되어 있습니다. ZIP에는 컴퓨터별 `.vercel` 연결 정보나 인증 정보가 포함되지 않습니다.

## 운영 환경 변수

프론트엔드 Production:

`VITE_API_BASE_URL=https://seaguard-api.vercel.app`

백엔드 Production:

`CORS_ORIGINS=https://seaguard-web.vercel.app`

두 설정은 Vercel에 저장했습니다. LLM 키는 설정하지 않았고 규칙 설명으로 동작합니다.

## 배포 후 확인

- 백엔드 health endpoint에 인증 없는 HTTP 요청을 보내 `status: ok` 확인.
- 실제 공개 웹 화면에서 API 연결 및 망상 낮음 / 추암 주의 / 어달 위험의 **고정 예시 시나리오** 전환 확인.
- 외부 모델 예보 모드에서 Vercel 백엔드가 Open-Meteo 기상·해양 데이터를 실제 조회함. 격자 예보 안내, 기상/해양 데이터 시각, 집계 구간, 출처 링크 확인.
- 기본 화면은 예시 모드이며 관측값과 구분됩니다. 공공데이터 관측 연결이나 실제 LLM 키 호출은 추가되지 않았습니다.

## 수정 후 다시 배포

계정 로그인이 된 터미널에서 수정한 폴더로 이동하여 실행합니다.

```powershell
npx vercel@latest --prod
```

웹 화면 수정은 `frontend`, 백엔드 수정은 `backend`에서 실행하세요. ZIP을 다른 컴퓨터에 풀었다면 먼저 `npx vercel@latest link`로 **기존** 프로젝트에 연결하세요. 프론트엔드의 API 주소를 변경했다면 프론트엔드를 다시 빌드·배포해야 합니다.
