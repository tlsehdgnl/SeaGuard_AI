import React, {useEffect, useRef, useState} from 'react';
import {guideChoices} from './guideChoices.js';
import {createPortal} from 'react-dom';

export function GuideChat({open, onClose, guide, step, language, destination, activities, mode}) {
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

  async function send(event) {
    event.preventDefault();
    const question = draft.trim();
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
          body:JSON.stringify({step, language, destination, activities, mode, messages:conversation,choices:choices.map(c=>c.label)}),
        });
        if (response.status === 503) throw new Error('disabled');
        if (response.status === 429) throw new Error('limited');
        if (!response.ok) throw new Error('failed');
        answer = await response.json();
      }
      const choice = choices[answer.selection];
      const reply = choice && choice.apply()
        ? (en ? 'Selected: ' : '선택했어요 · ') + choice.label
        : (en ? 'Which option would you like? ' : '현재 화면에서 어떤 항목을 선택할까요? ') + choices.slice(0,4).map(c=>c.label).join(', ');
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
        <div className="trip-chat-row assistant"><div className="trip-chat-bubble"><p>{en ? 'Tell me which option to select on this screen.' : '이 화면에서 원하는 항목을 말해 주세요. 대신 선택할게요.'}</p></div></div>
        {messages.map((m,i) => <div className={'trip-chat-row ' + m.role} key={i}><div className="trip-chat-bubble">
          <strong>{m.role === 'user' ? (en ? 'You' : '나') : name}</strong><p>{m.content}</p></div></div>)}
        {pending && <><div className="trip-chat-row user"><div className="trip-chat-bubble"><p>{pending}</p></div></div>
          <p className="trip-chat-pending">{en ? 'Preparing a reply…' : '답변을 작성하고 있어요…'}</p></>}
        {error && <p className="trip-chat-error" role="alert">{error}</p>}
      </div>
      <form className="trip-chat-composer" onSubmit={send}>
        <label className="trip-chat-input-label" htmlFor="guide-question">{en ? 'What should I select?' : '대신 선택할 항목'}</label>
        <div className="trip-chat-input-row"><textarea id="guide-question" maxLength={2000} value={draft}
          readOnly={!!pending} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229) {
              e.preventDefault(); e.currentTarget.form.requestSubmit();
            }
          }}/>
          <button className="trip-chat-send" disabled={!!pending || !draft.trim()} aria-label={en ? 'Send question' : '질문 보내기'}>↑</button></div>
        <p className="trip-chat-note">{en ? 'For natural language matching, your request and options are sent to OpenAI.' : '자연어 해석이 필요하면 요청과 선택지를 OpenAI로 보내요.'}</p>
      </form>
    </div>
  </dialog>, document.body);
}
