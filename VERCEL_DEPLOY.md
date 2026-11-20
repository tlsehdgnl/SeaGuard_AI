# DePartner 운영 배포

GitHub 저장소 `tlsehdgnl/SeaGuard_AI`의 `main` 브랜치가 운영 배포 기준입니다. 변경을 커밋하고 `git push origin main`을 실행하면 Vercel이 빌드합니다. 빌드가 성공한 뒤 운영 주소에 반영됩니다. 두 프로젝트의 Deployments에서 커밋과 Ready 상태를 확인할 수 있습니다.

| Vercel 프로젝트 | Root Directory | Production 환경변수 |
| --- | --- | --- |
| `departner` | `frontend` | 지도 표시용 `VITE_KAKAO_JS_KEY`. `VITE_API_BASE_URL`은 비워 두어 같은 도메인의 `/api`를 사용합니다. |
| `seaguard-api` | `backend` | `KAKAO_REST_API_KEY`, 앱에서 활성화한 경우 `KAKAO_CLIENT_SECRET`, `KAKAO_REDIRECT_URI`, `KAKAO_RETURN_URL`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. 별도 로컬 검색 키가 있으면 `KAKAO_LOCAL_KEY`도 이곳에 설정합니다. |

운영 주소는 https://departner-donghae.vercel.app 입니다. 카카오 개발자 콘솔과 서버의 `KAKAO_REDIRECT_URI`에 모두 `https://departner-donghae.vercel.app/api/kakao/callback`을 등록하고, `KAKAO_RETURN_URL`에는 `https://departner-donghae.vercel.app/`를 입력하세요.

환경변수만 바꾸면 해당 프로젝트의 Production 배포를 다시 실행해야 합니다. 키 값은 Git에 올리지 않습니다. 배포 후 운영 주소의 `/api/health`가 `status: ok`를 반환하고 `/api/kakao/config`에서 `login`이 `true`인지 확인하세요. 실제 계정으로 로그인해 사이트에 돌아오는 것까지 확인하면 카카오 측 설정도 함께 검증됩니다.
