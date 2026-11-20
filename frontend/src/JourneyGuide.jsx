import React, {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {useLanguage} from './i18n.js';
import './guide.css';

const PREFIX = 'departner.guide.v1.';
function read(key) { try { return localStorage.getItem(PREFIX + key); } catch { return null; } }
function write(key, value) { try { localStorage.setItem(PREFIX + key, value); } catch { /* Guide still works without storage. */ } }
const GUIDES = [
  {name:['망상이','Mangsang'], image:'mangsang', role:['방문지 길잡이','Destination guide'], tips:[
    ['.destination-tabs', '어떤 바다를 만나고 싶나요?', '해변이나 항구를 골라 주세요. 아래 사진과 소개가 선택한 장소에 맞춰 바뀌어요.', 'Which coast would you like to visit?', 'Choose a beach or harbour. The photo and introduction below will change to match your choice.'],
    ['.beach-intro', '마음에 드는 장소를 찾아봐요', '사진과 장소 소개를 확인한 뒤 아래의 활동 선택하기 버튼으로 넘어가세요. 안내를 닫으면 직접 선택할 수 있어요.', 'Find your favourite place', 'Read the introduction, then use the activity button below to continue. Close this guide to make your selection.'],
  ]},
  {name:['푸파','Pupa'], image:'pupa', role:['활동 길잡이','Activity guide'], tips:[
    ['.activity-postcards', '무엇을 하며 놀까요?', '하고 싶은 활동은 여러 개 골라도 괜찮아요. 바다 감상과 낚시처럼 활동에 따라 확인할 안전 안내가 달라져요.', 'What would you like to do?', 'You can select several activities. Sea viewing and fishing need different safety checks.'],
    ['#activity .form-grid', '함께 가는 사람도 생각해요', '어린이 동반 여부와 이동 수단, 필요한 배려, 비용과 시간을 설정해 주세요. 선택한 조건으로 다음 안내를 준비해요.', 'Make the trip fit your group', 'Set children, transport, accessibility needs, budget and time. These choices shape the next recommendations.'],
  ]},
  {name:['해별이','Haebyeol'], image:'haebyeol', role:['바다 안전 길잡이','Sea safety guide'], tips:[
    ['#forecast', '먼저 예보인지 예시인지 확인해요', '예시 데이터는 사용법을 보여주는 시연이에요. 실제 방문 계획에는 모델 예보를 확인하고, 수치와 정보 시각도 함께 살펴봐요.', 'Check which data you are viewing', 'Demo data is only for trying the app. For a real visit, check the forecast, its values and the update time.'],
    ['.official', '현장 통제가 가장 먼저예요', '예보가 잔잔해도 안전을 보장하지 않아요. 공식 특보와 출입 통제를 확인해 주세요. 정보가 없으면 안전하다고 판단하지 않아요.', 'Local restrictions come first', 'Calm forecasts do not guarantee safety. Check official warnings and access restrictions. Missing information does not mean safe conditions.'],
  ]},
  {name:['추암이','Chuam'], image:'chuam', role:['동네 탐험 길잡이','Local discovery guide'], tips:[
    ['#local-activities .field', '바다 주변도 함께 둘러봐요', '카테고리를 바꿔 식당과 카페, 주변 활동을 찾아보세요. 방문하고 싶은 장소 카드를 누르면 여행 동선에 담겨요.', 'Explore around the coast', 'Browse the categories for food, cafés and activities. Select a place card to add it to your route.'],
    ['#local-activities .shop-cards', '방문 전에 한 번 더 확인해요', '선택한 가게는 다음 단계의 코스에 반영돼요. 영업시간과 휴무는 방문 전에 확인하고, 바다 방문이 어려우면 실내 활동도 살펴보세요.', 'Check before you visit', 'Selected shops carry over to the itinerary. Confirm opening hours and closures, and consider indoor activities when coastal conditions are unsuitable.'],
  ]},
  {name:['무암이','Muam'], image:'muam', role:['계획 완성 길잡이','Itinerary guide'], tips:[
    ['.course-settings', '바다와 식사 시간을 함께 맞춰요', '방문 날짜와 시간, 식사 횟수와 가게 영업시간을 입력해 코스를 만들어 보세요. 현장 통제가 있다면 꼭 체크해 바다 방문을 제외하세요.', 'Plan your sea time and meals', 'Set the date, trip times, meals and shop hours to build a route. Mark any local access restriction to exclude the sea visit.'],
    ['#save-plan', '조건을 저장하고 다시 확인해요', '조건 저장으로 다음에 다시 열거나 공유·QR로 함께 볼 수 있어요. 상세 일정과 AI 대화는 이 화면에서만 유지돼요. 출발 전 최신 예보를 다시 확인해 주세요.', 'Save your choices and check again', 'Save your choices or share them with a link or QR code. Detailed itineraries and AI chats stay in this screen only. Recheck the latest forecast before leaving.'],
  ]},
];

export function JourneyGuide({step}) {
  const {language} = useLanguage();
  const en = language === 'en';
  const guide = GUIDES[step];
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [automatic, setAutomatic] = useState(() => read('automatic') !== 'off');
  const [rect, setRect] = useState(null);
  const panel = useRef(null);
  const launcher = useRef(null);
  const tip = guide.tips[index];
  const close = () => {write('seen.' + step, 'yes'); setOpen(false);};

  useEffect(() => {
    if (read('automatic') === 'off' || read('seen.' + step)) return;
    const timer = setTimeout(() => {
      if (read('automatic') !== 'off' && !read('seen.' + step)) setOpen(true);
    }, 700);
    return () => clearTimeout(timer);
  }, [step]);

  useEffect(() => {
    if (!open) return;
    const app = document.querySelector('.journey-app');
    const previous = document.activeElement;
    const wasInert = app?.inert;
    if (app) app.inert = true;
    panel.current?.focus({preventScroll:true});
    return () => {
      if (app) app.inert = wasInert;
      if (previous?.isConnected) previous.focus({preventScroll:true});
      else launcher.current?.focus({preventScroll:true});
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const target = document.querySelector(tip[0]) || document.querySelector('.step-head');
    let frame;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!target || !panel.current) return;
        const bounds = target.getBoundingClientRect();
        const card = panel.current.getBoundingClientRect();
        // Keep the highlighted area above the speech panel, including on small screens.
        const top = Math.max(8, bounds.top - 7);
        const bottom = Math.min(bounds.bottom + 7, card.top - 16);
        setRect(bottom > top ? {left:Math.max(8,bounds.left-7), top,
          width:Math.max(0,Math.min(innerWidth-8,bounds.right+7)-Math.max(8,bounds.left-7)), height:bottom-top} : null);
      });
    };
    const align = () => {
      if (target) window.scrollTo({top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - 24), behavior:'instant'});
      measure();
    };
    align();
    const observer = new ResizeObserver(measure);
    if (target) observer.observe(target);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('scroll', measure, {passive:true});
    window.addEventListener('resize', align);
    return () => {observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('scroll',measure); window.removeEventListener('resize',align);};
  }, [open, tip, language]);

  function keys(event) {
    if (event.key === 'Escape') {event.preventDefault(); close();}
    if (event.key !== 'Tab') return;
    const controls = [...panel.current.querySelectorAll('button:not(:disabled), input')];
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {event.preventDefault(); last?.focus();}
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {event.preventDefault(); first?.focus();}
  }
  return <>
    <button type="button" ref={launcher} className="guide-launcher" onClick={() => {setIndex(0); setOpen(true);}}>
      <img src={`/characters/${guide.image}.png`} alt=""/>
      <span>{en ? `Help from ${guide.name[1]}` : `${guide.name[0]}의 사용 안내`}</span><span aria-hidden="true">?</span>
    </button>
    {open && createPortal(<div className="guide-overlay">
      <div className={rect ? 'guide-spotlight' : 'guide-dim'} style={rect || undefined} aria-hidden="true" />
      <section ref={panel} className="guide-panel" role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-body" tabIndex={-1} onKeyDown={keys}>
        <div className="guide-character"><img src={`/characters/${guide.image}.png`} alt={guide.name[en?1:0]}/><span>{guide.name[en?1:0]}</span></div>
        <div className="guide-bubble">
          <div className="guide-meta"><span>{guide.role[en?1:0]} · {index+1}/{guide.tips.length}</span><button type="button" className="guide-close" onClick={close} aria-label={en?'Close guide':'안내 닫기'}>×</button></div>
          <div aria-live="polite" aria-atomic="true"><h2 id="guide-title">{tip[en?3:1]}</h2><p id="guide-body">{tip[en?4:2]}</p></div>
          <label className="guide-auto"><input type="checkbox" checked={automatic} onChange={e=>{setAutomatic(e.target.checked); write('automatic',e.target.checked?'on':'off');}}/>{en?'Automatically guide new steps':'처음 보는 단계에서 자동 안내'}</label>
          <div className="guide-controls"><button type="button" onClick={close}>{en?'Skip':'건너뛰기'}</button><div>{index>0 && <button type="button" onClick={()=>setIndex(n=>n-1)}>{en?'Back':'이전'}</button>}<button type="button" className="guide-next" onClick={()=>index<guide.tips.length-1?setIndex(n=>n+1):close()}>{index<guide.tips.length-1?(en?'Next →':'다음 안내 →'):(en?'Let’s try it':'직접 해볼게요')}</button></div></div>
        </div>
      </section>
    </div>,document.body)}
  </>;
}
