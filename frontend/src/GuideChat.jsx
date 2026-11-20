import React, {useEffect, useRef, useState} from 'react';
import {guideChoices} from './guideChoices.js';
import {getChatContext} from './chatContext.js';

// Per-character greeting and example questions (tap to ask).
const INTRO = [
  {ko:['안녕하세요, 망상이에요! 🌊 어떤 바다가 보고 싶어요? 예쁜 해변, 한적한 곳, 낚시하기 좋은 곳… 뭐든 물어봐 주세요!', ['예쁜 해변 추천해 줘!', '사람 적은 한적한 곳은?', '아이랑 가기 좋은 해변은?']],
   en:['Hi, I am Mangsang! 🌊 Pretty views, quiet spots, fishing — ask me about any Donghae beach!', ['Recommend a pretty beach!', 'Where is quiet?', 'Good beach for kids?']]},
  {ko:['푸파예요! 🎈 바다에서 뭐 하고 놀지 같이 정해 봐요. 활동 조합이나 근처 즐길 거리를 물어봐 주세요!', ['물놀이하고 뭐 할까?', '근처 산책길 있어?', '비 오면 뭐 하지?']],
   en:['I am Pupa! 🎈 Let us plan what to do by the sea. Ask about combos or things nearby!', ['What after swimming?', 'Any walking paths nearby?', 'What if it rains?']]},
  {ko:['해별이예요! ⭐ 오늘과 내일 바다 예보를 보고 알려 드릴게요. 물놀이·낚시해도 괜찮을지 물어봐 주세요.', ['오늘 수영하면 위험할까?', '내일 바다는 어때?', '낚시하기 좋은 날은?']],
   en:['I am Haebyeol! ⭐ I read today’s and tomorrow’s sea forecast. Ask whether swimming or fishing looks OK.', ['Is swimming risky today?', 'How is the sea tomorrow?', 'Best day for fishing?']],},
  {ko:['추암이예요! 🧭 근처 카페·맛집·볼거리를 찾아 드려요. 특정 가게 근처도 물어보면 찾아볼게요!', ['근처 분위기 좋은 카페는?', '스타벅스 동해DT점 근처 놀 곳?', '걸어서 갈 맛집 있어?']],
   en:['I am Chuam! 🧭 I find cafes, food and sights nearby — even around a shop you name!', ['Nice cafe nearby?', 'Fun spots near Starbucks Donghae DT?', 'Walkable restaurants?']]},
  {ko:['무암이예요! 🗺️ 지금 코스의 이동 시간과 실시간 교통을 봐 드릴게요. 막히는 구간이 있는지 물어봐 주세요!', ['어디 많이 막힐까?', '제일 오래 걸리는 구간은?', '전체 이동 시간은?']],
   en:['I am Muam! 🗺️ I check travel times and live traffic on your course. Ask where it is busy!', ['Where is traffic heavy?', 'Longest leg?', 'Total travel time?']]},
];
import {createPortal} from 'react-dom';

export function GuideChat({open, onClose, guide, step, language, beach, destination, activities, mode}) {
  const en = language === 'en';
  const name = guide.name[en ? 1 : 0];
  const dialog = useRef(null);
  const log = useRef(null);
  const request = useRef(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) dialog.current.showModal();
  }, [open]);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    if (open) log.current.scrollTop = log.current.scrollHeight;
  }, [open, messages, pending, error]);

  const [greeting, examples] = INTRO[step][en ? 'en' : 'ko'];
  async function send(event, preset) {
    event?.preventDefault();
    const question = (preset ?? draft).trim();
    if (!question || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    const conversation = [...messages.slice(-14), {role:'user', content:question}];
    setPending(question);
    setError('');
    try {
      const choices = guideChoices(step);
      const label = question.replace(/(?:\s*(?:골라|선택해|담아)\s*(?:줘|주세요))[.!]?$/, '').trim();
      const exact = choices.find(c=>c.label === question || c.label === label);
      let answer;
      if (exact) {
        answer = {selection:choices.indexOf(exact)};
      } else {
        const response = await fetch((import.meta.env.VITE_API_BASE_URL || '') + '/api/guide/chat', {
          method:'POST', headers:{'Content-Type':'application/json'}, signal:controller.signal,
          body:JSON.stringify({step, language, beach, destination, activities, mode, messages:conversation, choices:choices.map(c=>c.label), context:getChatContext()}),
        });
        if (response.status === 503) throw new Error('disabled');
        if (response.status === 429) throw new Error('limited');
        if (!response.ok) throw new Error('failed');
        answer = await response.json();
      }
      const choice = answer.selection == null ? null : choices[answer.selection];
      const picked = choice && choice.apply() ? (en ? '✓ Selected: ' : '✓ 선택했어요 · ') + choice.label : '';
      const reply = [answer.reply, picked].filter(Boolean).join('\n\n');
      if (typeof reply !== 'string' || !reply.trim()) throw new Error('failed');
      setMessages(previous => [...previous, {role:'user', content:question}, {role:'assistant', content:reply}]);
      setDraft('');
    } catch (err) {
      if (controller.signal.aborted) return;
      if (err.message === 'disabled') setError(en ? 'Chat is waiting for the server’s OpenAI API key.' : '대화를 시작하려면 서버에 OpenAI API 키를 설정해야 해요.');
      else if (err.message === 'limited') setError(en ? 'Too many requests. Please try again shortly.' : '요청이 많아요. 잠시 후 다시 보내 주세요.');
      else setError(en ? 'Couldn’t get a reply. Please try again.' : '답변을 받지 못했어요. 다시 보내 주세요.');
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setPending('');
    }
  }

  if (!open) return null;
  return createPortal(<dialog ref={dialog} className="trip-chat-dialog" aria-labelledby="guide-chat-title"
    onCancel={onClose}>
    <div className="trip-chat-shell">
      <header className="trip-chat-header">
        <img className="guide-chat-avatar" src={'/characters/' + guide.image + '.png'} alt=""/>
        <div><h2 id="guide-chat-title">{name}</h2><p>{guide.role[en ? 1 : 0]} · {destination}</p></div>
        <button type="button" className="trip-chat-close" onClick={onClose} aria-label={en ? 'Close chat' : '대화 닫기'}>×</button>
      </header>
      <div className="trip-chat-messages" ref={log} role="log" aria-live="polite">
        <div className="trip-chat-row assistant"><div className="trip-chat-bubble"><strong>{name}</strong><p>{greeting}</p></div></div>
        {!messages.length && !pending && <div className="guide-chat-examples" aria-label={en ? 'Example questions' : '예시 질문'}>
          {examples.map(q => <button type="button" key={q} onClick={() => send(null, q)}>{q}</button>)}</div>}
        {messages.map((m,i) => <div className={'trip-chat-row ' + m.role} key={i}><div className="trip-chat-bubble">
          <strong>{m.role === 'user' ? (en ? 'You' : '나') : name}</strong><p>{m.content}</p></div></div>)}
        {pending && <><div className="trip-chat-row user"><div className="trip-chat-bubble"><p>{pending}</p></div></div>
          <p className="trip-chat-pending">{en ? 'Preparing a reply…' : '답변을 작성하고 있어요…'}</p></>}
        {error && <p className="trip-chat-error" role="alert">{error}</p>}
      </div>
      <form className="trip-chat-composer" onSubmit={send}>
        <label className="trip-chat-input-label" htmlFor="guide-question">{en ? 'Ask a question or say what to pick' : '궁금한 걸 묻거나, 골라 달라고 말해 주세요'}</label>
        <div className="trip-chat-input-row"><textarea id="guide-question" maxLength={2000} value={draft}
          readOnly={!!pending} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
              e.preventDefault(); e.currentTarget.form.requestSubmit();
            }
          }}/>
          <button className="trip-chat-send" disabled={!!pending || !draft.trim()} aria-label={en ? 'Send question' : '질문 보내기'}>↑</button></div>
        <p className="trip-chat-note">{en ? 'Your question, trip choices and on-screen options are sent to OpenAI. Answers are AI-generated; check official warnings and opening hours.' : '질문과 여행 조건, 화면의 선택지가 OpenAI로 전송돼요. AI 답변이니 공식 특보와 영업시간은 꼭 다시 확인해 주세요.'}</p>
      </form>
    </div>
  </dialog>, document.body);
}
