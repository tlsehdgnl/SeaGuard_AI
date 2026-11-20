import React, { createContext, useContext, useEffect, useState } from 'react';
import messages from './locales/en.json' with { type: 'json' };

const LanguageContext = createContext({language:'ko', setLanguage:()=>{}});
const STORAGE_KEY = 'seaguard:language';
export function LanguageProvider({children}) {
  const [language, setLanguage] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'ko'; } catch { return 'ko'; }
  });
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = language === 'en' ? 'SeaGuard AI · Donghae Travel Guide' : 'SeaGuard AI · 동해 바다행동 안내';
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Language switching still works. */ }
  }, [language]);
  return React.createElement(LanguageContext.Provider, {value:{language, setLanguage}}, children);
}
export function useLanguage() { return useContext(LanguageContext); }
export function LanguageSwitch({className=''}) {
  const {language, setLanguage} = useLanguage();
  return React.createElement('button', {type:'button', className:'language-switch '+className,
    lang:language === 'ko' ? 'en' : 'ko', 'aria-label':language === 'ko' ? 'Switch to English' : '한국어로 전환',
    onClick:()=>setLanguage(language === 'ko' ? 'en' : 'ko')}, language === 'ko' ? 'EN · English' : 'KO · 한국어');
}
const phrases = Object.keys(messages).sort((a,b)=>b.length-a.length);
const escaped = phrases.map(text=>text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
const pattern = new RegExp(escaped.join('|'),'g');
export function translate(value, language='en') {
  if (language !== 'en' || typeof value !== 'string') return value;
  const units = {'건':' records', '건.':' records.', '곳':' places', '개':' plans', '일':' days', '시':':00', '값':'Value'};
  if (units[value.trim()]) return units[value.trim()];
  return value.replace(pattern, text => messages[text]).replace(/(\d)(건|곳|개|시)(?=[\s./)]|$)/g, (_,n,unit)=>n+units[unit]);
}
// Translate at React render time, never mutate React-owned DOM or data/API values.
// Each native element subscribes to language changes so forms and saved plans keep their state.
function LocalizedElement({tag, children, ...props}) {
  const {language} = useLanguage();
  const translated = {...props};
  for (const key of ['aria-label','alt','title','placeholder']) {
    if (typeof props[key] === 'string') translated[key] = translate(props[key], language);
  }
  const content = React.Children.map(children, child => typeof child === 'string' && props.lang !== 'ko' ? translate(child, language) : child);
  return React.createElement(tag, translated, content);
}
export function localizedElement(type, props, ...children) {
  return typeof type === 'string'
    ? React.createElement(LocalizedElement, {...props, tag:type}, ...children)
    : React.createElement(type, props, ...children);
}
