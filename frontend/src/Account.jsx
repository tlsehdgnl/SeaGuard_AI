import React, {createContext,useContext,useEffect,useRef,useState,useCallback} from 'react';
import {useLanguage,LanguageSwitch} from './i18n.js';
import './account.css';
const Context=createContext(null);
const base=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
export async function accountRequest(path,body,method) {
  const response=await fetch(base+'/api/account'+path,{method:method||(body?'POST':'GET'),credentials:'include',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(typeof data.detail==='string'?data.detail:'입력값 또는 연결 상태를 확인해 주세요.');error.status=response.status;throw error;}
  return data;
}
export function AccountProvider({children}) {
  const [user,setUser]=useState(null),[ready,setReady]=useState(false),[error,setError]=useState('');
  const [cloudPlans,setCloudPlans]=useState([]),[plansError,setPlansError]=useState(''),[plansLoading,setPlansLoading]=useState(false);
  const owner=useRef(null);
  const accept=useCallback(value=>{owner.current=value?.id||null;setUser(value);setCloudPlans([]);setPlansLoading(false);setPlansError('');setError('');},[]);
  const refreshPlans=useCallback(async()=>{
    const id=owner.current;if(!id)return;
    setPlansLoading(true);setPlansError('');
    try{const data=await accountRequest('/plans');if(owner.current===id){if(data.user.id!==id)accept(data.user);else setCloudPlans(data.plans);}}
    catch(err){if(owner.current===id){setPlansError(err.message);if(err.status===401)accept(null);}}
    finally{if(owner.current===id)setPlansLoading(false);}
  },[accept]);
  useEffect(()=>{let active=true;accountRequest('/me').then(data=>{if(active)accept(data.user);}).catch(err=>{if(active)setError(err.message);}).finally(()=>{if(active)setReady(true);});return()=>{active=false;};},[accept]);
  useEffect(()=>{if(user)refreshPlans();},[user,refreshPlans]);
  useEffect(()=>{const sync=()=>{if(document.visibilityState==='visible'&&owner.current)refreshPlans();};document.addEventListener('visibilitychange',sync);return()=>document.removeEventListener('visibilitychange',sync);},[refreshPlans]);
  async function authenticate(kind,body){const data=await accountRequest('/'+kind,body);accept(data.user);setReady(true);return data.user;}
  async function logout(){await accountRequest('/logout',{});accept(null);setPlansLoading(false);}
  async function saveCloud(profiles){await accountRequest('/plans',{profiles,expected_user_id:owner.current});await refreshPlans();}
  async function deleteCloud(id){await accountRequest('/plans/'+encodeURIComponent(id)+'?owner='+encodeURIComponent(owner.current),undefined,'DELETE');await refreshPlans();}
  return <Context.Provider value={{user,ready,error,cloudPlans,plansError,plansLoading,refreshPlans,authenticate,logout,saveCloud,deleteCloud}}>{children}</Context.Provider>;
}
export function useAccount(){return useContext(Context);}
export function AccountPage(){
  const account=useAccount();const {language}=useLanguage();const en=language==='en';
  const [signup,setSignup]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [form,setForm]=useState({username:'',password:'',nickname:'',birth_date:''});
  const field=(key)=>({value:form[key],onChange:e=>setForm({...form,[key]:e.target.value})});
  async function submit(e){e.preventDefault();setBusy(true);setError('');try{await account.authenticate(signup?'signup':'login',signup?form:{username:form.username,password:form.password});window.location.assign('/?mypage=1');}catch(err){setError(en?'Unable to sign in or register. Check your details or try again later.':err.message);}finally{setBusy(false);}}
  return <main className="account-page"><div className="account-nav"><a href="/">← {en?'Continue as guest':'로그인 없이 이용하기'}</a><LanguageSwitch/></div>
    <a href="/" className="account-brand"><img src="/departner-mark.svg" alt=""/>DePartner</a>
    <section className="account-card"><p className="account-eyebrow">YOUR DONGHAE COMPANION</p><h1>{signup?(en?'Join DePartner':'여행 기록을 함께 모아요'):(en?'Welcome back':'다시 만나 반가워요')}</h1>
      <p>{en?'Use every travel feature without an account. Sign in to access saved plans on your other devices.':'로그인 없이도 여행 기능을 이용할 수 있어요. 로그인하면 여러 기기에서 저장한 계획을 모아 볼 수 있어요.'}</p>
      {account.user ? <><p>{account.user.nickname}{en?', you are signed in.':'님, 로그인되어 있어요.'}</p><a className="account-primary" href="/?mypage=1">{en?'Open my plans':'마이페이지 열기'}</a></> : <>
      <div className="account-tabs"><button type="button" aria-pressed={!signup} onClick={()=>{setSignup(false);setError('');}}>{en?'Sign in':'로그인'}</button><button type="button" aria-pressed={signup} onClick={()=>{setSignup(true);setError('');}}>{en?'Create account':'회원가입'}</button></div>
      <form onSubmit={submit}><fieldset disabled={busy}>
        <label>{en?'Username':'아이디'}<input required autoComplete="username" pattern="[A-Za-z0-9_]{4,24}" minLength={4} maxLength={24} {...field('username')}/><small>{en?'4–24 letters, numbers or underscores; case-insensitive.':'영문·숫자·밑줄 4~24자, 대소문자는 구분하지 않아요.'}</small></label>
        {signup && <><label>{en?'Nickname':'닉네임'}<input required minLength={2} maxLength={24} autoComplete="nickname" {...field('nickname')}/></label><label>{en?'Date of birth':'생년월일'}<input type="date" required min="1900-01-01" max={new Date().toLocaleDateString('en-CA')} autoComplete="bday" {...field('birth_date')}/></label></>}
        <label>{en?'Password':'비밀번호'}<input type="password" required minLength={8} maxLength={128} autoComplete={signup?'new-password':'current-password'} {...field('password')}/><small>{en?'At least 8 characters.':'8자 이상 입력해 주세요.'}</small></label>
        {signup && <><label className="account-consent"><input type="checkbox" required/>{en?'I agree to store my username, nickname and date of birth for my account and saved plans.':'계정과 저장 기록 관리를 위한 아이디·닉네임·생년월일 수집 및 보관에 동의합니다.'}</label><p className="account-note">{en?'Your birth date is private. Passwords are managed by Supabase Auth. No email is collected, so email password recovery is unavailable.':'생년월일은 공개하지 않으며 비밀번호는 Supabase Auth가 관리합니다. 이메일을 수집하지 않으므로 이메일로 비밀번호를 찾을 수는 없어요.'}</p></>}
        <button className="account-primary" disabled={busy||!account.ready}>{busy?(en?'Please wait…':'처리 중…'):signup?(en?'Create account':'가입하고 시작하기'):(en?'Sign in':'로그인')}</button>
      </fieldset></form></>}
      {error&&<p className="account-error" role="alert">{error}</p>}
    </section>
  </main>;
}
