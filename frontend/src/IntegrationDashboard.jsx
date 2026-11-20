import React, { useEffect, useState } from 'react';
import { useLanguage } from './i18n.js';

const statuses={ok:['연결 정상','Connected'],missing:['설정 없음','Not configured'],auth_error:['인증 실패','Authentication failed'],rate_limited:['사용 한도 확인','Check usage limits'],error:['연결 오류','Connection error'],warning:['추가 확인','Needs attention'],timeout:['응답 지연','Timed out'],unchecked:['검사 필요','Not tested']};
const details={
 key_missing:['서버 환경변수에 키를 등록한 뒤 재시작 또는 재배포하세요.','Set the server environment variable, then restart or redeploy.'],
 endpoint_invalid:['LLM_API_URL의 HTTPS 주소를 확인하세요.','Check the HTTPS URL in LLM_API_URL.'],
 generation_failed:['모델명, API 사용 한도와 결제 상태를 확인하세요.','Check the model, API limits and billing status.'],
 generation_ok:['실제 GPT 요청을 보내 정상 JSON 응답을 받았습니다.','A real GPT request returned valid JSON.'],
 generation_required:['사용자 지정 LLM은 실제 응답 검사를 선택해 확인하세요.','Select the generation test to check your custom provider.'],
 auth_failed:['키 유효성, 프로젝트 권한과 API 사용 한도를 확인하세요.','Check key validity, project permissions and API limits.'],
 model_access_ok:['키 인증과 설정 모델의 접근 권한을 확인했습니다. 실제 답변 생성·과금 한도는 별도 검사입니다.','Key authentication and model access verified. Generation and billing limits need a separate test.'],
 model_missing:['키 인증은 성공했지만 설정 모델이 목록에 없습니다. OPENAI_MODEL을 확인하세요.','Authentication succeeded, but the configured model is unavailable. Check OPENAI_MODEL.'],
 provider_error:['외부 제공기관이 오류를 반환했습니다. 잠시 후 다시 확인하세요.','The provider returned an error. Try again shortly.'],
 provider_rejected:['제공기관에서 요청을 거절했습니다. 활용 신청 승인과 키를 확인하세요.','The provider rejected the request. Check API approval and credentials.'],
 data_received:['실제 API 요청으로 데이터 수신을 확인했습니다.','Data received from a live API request.'],
 no_data:['연결은 됐지만 제공 데이터가 비어 있습니다.','Connected, but the provider returned no data.'],
 stale_data:['예보 시각이 3시간 이상 차이 납니다. 최신 정보를 확인하세요.','Forecast timestamps differ by over three hours. Check freshness.'],
 format_verified:['공식 일정 페이지 연결과 데이터 형식을 확인했습니다.','Official schedule page and data format verified.'],
 database_missing:['운영 서버에 TRAIL_DATABASE_URL을 설정해야 통계를 영구 저장할 수 있습니다.','Set TRAIL_DATABASE_URL for persistent production statistics.'],
 database_ok:['통계 테이블을 읽을 수 있습니다. 데이터는 변경하지 않았습니다.','Statistics tables are readable. No data was modified.'],
 local_database_ok:['로컬 SQLite 통계 테이블 연결 정상. 운영 서버 DB와는 별개입니다.','Local SQLite tables are readable. This is separate from the production database.'],
 local_database_missing:['로컬 DB 파일이 아직 없습니다. 통계 저장 설정을 확인하세요.','No local database file yet. Check statistics storage configuration.'],
 timeout:['제한 시간 안에 응답하지 않았습니다. 키 오류로 단정할 수 없습니다.','No response within the time limit. This does not necessarily indicate an invalid key.'],
 check_failed:['응답 형식 또는 연결을 확인하지 못했습니다. 서버 설정과 제공기관 상태를 확인하세요.','Could not verify the connection or response format. Check server settings and provider availability.'],
 admin_authenticated:['현재 입력한 관리자 키 인증에 성공했습니다.','The administrator key you entered was authenticated.']
};
const vars={gpt:'OPENAI_API_KEY · OPENAI_MODEL / LLM_API_KEY · LLM_API_URL',fishing:'FISHING_API_KEY',supabase:'SUPABASE_URL · SUPABASE_SECRET_KEY',database:'TRAIL_DATABASE_URL / SUPABASE_URL · SUPABASE_SECRET_KEY',admin:'ADMIN_TOKEN'};
const englishNames={admin:'Admin authentication',gpt:'GPT provider',fishing:'KHOA fishing API',weather:'Open-Meteo weather',marine:'Open-Meteo marine',library:'Donghae library schedules',supabase:'Supabase accounts & places',database:'Statistics database'};
export default function IntegrationDashboard({token,onUnauthorized}) {
 const {language}=useLanguage();const en=language==='en';const t=(ko,english)=>en?english:ko;
 const [report,setReport]=useState(null);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [deep,setDeep]=useState(false);const [request,setRequest]=useState({number:0,deep:false});
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  (async()=>{try{
   const timeout=AbortSignal.timeout(50000);
   const res=await fetch((import.meta.env.VITE_API_BASE_URL||'')+'/api/admin/integrations/check',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({test_generation:request.deep}),signal:AbortSignal.any([controller.signal,timeout]),cache:'no-store'});
   if(res.status===401){onUnauthorized();return;}
   if(!res.ok)throw Error('failed');
   const data=await res.json();if(!controller.signal.aborted)setReport(data);
  }catch{if(!controller.signal.aborted)setError('failed');}finally{if(!controller.signal.aborted)setLoading(false);}})();
  return()=>controller.abort();
 },[token,request]);
 const healthy=report?.services.filter(s=>s.status==='ok').length||0;
 return <section className="integration-dashboard" aria-labelledby="integration-title">
  <div className="integration-heading"><div><p className="integration-eyebrow">DEPARTNER · SYSTEM STATUS</p><h2 id="integration-title">{t('API 연결 상태','API connection status')}</h2><p>{t('설정 여부와 실제 연결 결과를 구분해 확인합니다. 키 값은 표시하지 않습니다.','Verify configuration and live connectivity separately. Secret values are never displayed.')}</p></div><span className="integration-environment">{report ? report.environment==='production'?t('운영 서버','Production'):t('로컬 서버','Local') : t('확인 중','Checking')}</span></div>
  <div className="integration-controls"><label><input type="checkbox" checked={deep} disabled={loading} onChange={e=>setDeep(e.target.checked)}/>{t('GPT 실제 응답도 검사 (소량의 API 비용 발생)','Also test GPT generation (small API charge)')}</label><button disabled={loading} onClick={()=>setRequest({number:request.number+1,deep})}>{loading?t('연결 확인 중…','Checking…'):t('연결 다시 확인','Check connections')}</button></div>
  <p className="integration-meta" role="status">{loading?t('외부 서비스를 검사하고 있어요. 최대 약 40초가 걸릴 수 있습니다.','Checking external services. This may take around 40 seconds.') : report ? `${t('정상','Connected')} ${healthy}/${report.services.length} · ${new Date(report.checked_at).toLocaleString(en?'en-US':'ko-KR',{timeZone:'Asia/Seoul'})} KST` : ''}{report?.cached&&!loading ? t(' · 30초 이내 검사 결과 재사용',' · Reusing a result checked within 30 seconds'):''}</p>
  {error&&<p role="alert" className="integration-error">{t('연결 상태를 불러오지 못했습니다. 서버 연결을 확인하고 다시 시도하세요.','Could not load connection status. Check the server and retry.')}</p>}
  <div className="integration-grid" aria-busy={loading}>{report?.services.map(service=><article key={service.id} className={'integration-card status-'+service.status}>
   <div className="integration-card-head"><h3>{en?englishNames[service.id]:service.name}</h3><span className="integration-badge">{(statuses[service.status]||statuses.error)[en?1:0]}</span></div>
   <p className="integration-config">{service.key_required===false?t('API 키 불필요','No API key required'):service.configured?t('서버 설정 있음','Server configuration present'):t('서버 설정 없음','Server configuration missing')}</p>
   <p>{(details[service.detail]||details.check_failed)[en?1:0]}</p>
   {vars[service.id]&&<code>{vars[service.id]}</code>}
   <dl>{service.model&&<div><dt>{t('모델','Model')}</dt><dd>{service.model}</dd></div>}{service.storage&&<div><dt>{t('저장소','Storage')}</dt><dd>{service.storage}</dd></div>}<div><dt>{t('검사 시간','Check duration')}</dt><dd>{service.latency_ms} ms</dd></div>{service.http_status&&<div><dt>HTTP</dt><dd>{service.http_status}</dd></div>}</dl>
  </article>)}</div>
  <p className="integration-footnote">{t('검사는 현재 접속한 서버 기준입니다. 기상·해양은 망상해변 좌표로 확인합니다. 외부 지도·공식 안내 링크는 API 연결 검사에 포함되지 않습니다.','Checks apply to the server you are using. Weather and marine probes use Mangsang Beach coordinates. External map and information links are not API checks.')}</p>
 </section>;
}
