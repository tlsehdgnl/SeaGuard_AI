import React from "react";
import { useLanguage, translate } from "./i18n.js";

const modes = {forecast:"모델 예보", demo:"시연 예보", all:"전체 예보"};
const labels = {start:"여행 시작 클릭 · 전체 예보",plan_seen:"추천 일정 조회",map_click:"지도 열기",official_click:"장소 안내 열기"};
const num = n => n.toLocaleString("ko-KR");
const pct = (n,total) => total ? (100*n/total).toFixed(1)+"%" : "—";

function Bars({title, rows, note}) {
  const peak = Math.max(1,...rows.map(([,n])=>n));
  return <section className="adminPanel"><h2>{title}</h2><p>{note}</p>
    {rows.length ? <ol>{rows.slice(0,10).map(([label,n])=><li key={label} className="rankBar">
      <span>{label}</span><b>{num(n)}건</b><i style={{width:(100*n/peak)+"%"}}/></li>)}</ol> : <p>해당 기록이 없습니다.</p>}
  </section>;
}

function exportCsv(d, language) {
  const out=[["시작일(KST)","조회시각(KST)","예보 범위","지표","항목","단위","값"]];
  const add=(metric,item,unit,value,scope=modes[d.mode],from=d.from)=>out.push([from,d.as_of,scope,metric,item,unit,value]);
  Object.entries(labels).forEach(([k,label])=>add("행동 집계",label,"건",d.counts[k]||0,k==="start"?"전체 예보":modes[d.mode]));
  add("조회 후 행동","일정 조회 세션","세션",d.sessions.viewed);
  add("조회 후 행동","조회 후 링크 클릭 세션","세션",d.sessions.clicked);
  for (const [day,v] of Object.entries(d.daily)) for(const [k,n] of Object.entries(v)) add("일별 "+labels[k],day,"건",n);
  for(const [label,n] of d.beaches) add("해변별 일정 조회",label,"건",n);
  for(const [label,n] of d.places) add("관광지별 링크 클릭",label,"건",n);
  for(const [h,r,car,n] of d.context) add("출발 조건별 일정 조회",(h < 0 ? "시간 미지정" : h+"시")+" / "+r+" / "+(car < 0 ? "이동수단 미지정" : car?"차량 있음":"차량 없음"),"건",n);
  for(const [day,beach,h,n,c] of d.schedule) {
    const item=day+" / "+beach+" / "+h+"시";
    add("여행 예정일별 계획",item,"건",n); add("여행 예정일별 차량 없는 계획",item,"건",c);
  }
  for(const [weather,n] of d.trails) add("직접 완료한 방문 동선",weather,"건",n,"전체","전체 기간");
  const csv="\uFEFF"+out.map(row=>row.map(v=>'"'+String(translate(v, language)).replaceAll('"','""')+'"').join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download="동해시_관광이용_"+d.from+"_"+d.mode+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export default function CityStats({data:d}) {
  const {language} = useLanguage();
  const views=d.counts.plan_seen||0, {viewed,clicked}=d.sessions;
  const top=d.beaches[0], days=Object.entries(d.daily);
  const peak=Math.max(1,...days.flatMap(([,v])=>[v.plan_seen,v.map_click+v.official_click]));
  const risks=["낮음","주의","위험"];
  const total=d.context.reduce((sum,row)=>sum+row[3],0);
  const transportTotal=d.context.reduce((sum,row)=>sum+(row[2] < 0 ? 0 : row[3]),0);
  const noCar=d.context.reduce((sum,[,,car,n])=>sum+(car===0?n:0),0);
  return <>
    <div className="reportRange"><span>{d.from} ~ {d.as_of.slice(0,10)} · 한국시간 · {modes[d.mode]}</span><button onClick={()=>exportCsv(d, language)}>집계 CSV 내려받기 ↓</button></div>
    <div className="adminMetrics">
      {[[labels.plan_seen,num(views)+"건"],["조회 후 링크 클릭률",pct(clicked,viewed)],["최다 조회 해변 점유율",pct(top?.[1]||0,views)],["차량 없는 일정 비중",pct(noCar,transportTotal)]].map(([l,v])=><div key={l}><span>{l}</span><strong>{v}</strong></div>)}
    </div>
    <section className="adminPanel"><h2>일별 일정 조회와 링크 클릭</h2>
      <p>서비스를 이용한 날짜 기준입니다. <b className="seriesA">● 일정 조회</b>　<b className="seriesB">● 지도·장소 안내 클릭</b></p>
      <div className="trendScroll"><div className="trendDays" style={{minWidth:days.length*31}}>
        {days.map(([day,v])=><div className="trendDay" key={day} title={day+" · 조회 "+v.plan_seen+"건 / 클릭 "+(v.map_click+v.official_click)+"건"}>
          <div><i style={{height:(100*v.plan_seen/peak)+"%"}}/><i style={{height:(100*(v.map_click+v.official_click)/peak)+"%"}}/></div><small>{day.slice(5)}</small></div>)}
      </div></div>
      <details><summary>일별 수치 표 보기</summary><table><thead><tr><th>날짜</th><th>조회</th><th>지도</th><th>장소 안내</th></tr></thead><tbody>{days.map(([day,v])=><tr key={day}><th>{day}</th><td>{v.plan_seen}</td><td>{v.map_click}</td><td>{v.official_click}</td></tr>)}</tbody></table></details>
    </section>
    <div className="adminGrid">
      <section className="adminPanel"><h2>일정 조회 후 행동</h2><p>기간 안에 일정을 본 익명 세션 중 이후 지도나 장소 안내를 연 비율입니다.</p>
        <dl>{[["조회한 세션",viewed],["링크까지 연 세션",clicked],["후속 클릭 기록이 없는 세션",viewed-clicked]].map(([l,n])=><div key={l}><dt>{l}</dt><dd>{num(n)}</dd></div>)}</dl>
        <small>여행 시작 버튼은 예보 선택 전 단계입니다. 기간 전체 시작 클릭 {num(d.counts.start)}건.</small>
      </section>
      <Bars title="해변별 계획 수요" rows={d.beaches} note={top ? top[0]+" 조회 "+num(top[1])+"건 / 전체 "+num(views)+"건. 일정에 선택한 출발 해변 기준입니다." : "출발 해변별 일정 조회를 비교합니다."}/>
    </div>
    <section className="adminPanel"><h2>예정 출발 시간 × 해양·기상 신호</h2><p>계획 조회 시 선택한 출발 조건과 서비스 기상 신호입니다. 조건 기록 {num(total)}건 중 차량 없는 일정은 {num(noCar)}건입니다. SDH는 출발 시각을 입력받지 않아 미지정으로 표시합니다. 차량 비중은 이동수단을 선택한 기록 기준입니다.</p>
      {total ? <table><thead><tr><th>예정 출발</th>{risks.map(r=><th key={r}>{r}</th>)}</tr></thead><tbody>
        {[...new Set(d.context.map(r=>r[0]))].map(h=><tr key={h}><th>{h < 0 ? "미지정" : h+"시"}</th>{risks.map(r=>{const n=d.context.filter(v=>v[0]===h&&v[1]===r).reduce((sum,v)=>sum+v[3],0);return <td key={r} className={n?"heatCell":""}>{n}건</td>})}</tr>)}
      </tbody></table> : <p>계획 요약을 조회하면 기상 신호와 이동수단 집계가 표시됩니다.</p>}
    </section>
    <section className="adminPanel schedulePanel"><h2>여행 예정일별 해변 수요</h2><p>조회 기간에 생성된 일정의 여행 예정일입니다. 차량 없는 일정이 몰리는 해변과 시간대는 대중교통 안내를 우선 점검할 수 있습니다.</p>
      {d.schedule.length ? <div className="scheduleRows"><table><thead><tr>{["예정일","해변","출발","일정","차량 없음"].map(l=><th key={l}>{l}</th>)}</tr></thead><tbody>{d.schedule.map(([day,b,h,n,c])=><tr key={[day,b,h].join("_")}><td>{day}</td><td>{b}</td><td>{h}시</td><td>{n}건</td><td>{c}건</td></tr>)}</tbody></table></div> : <p>선택한 범위에 여행 예정일 기록이 없습니다. SDH 계획에는 여행 예정일 입력이 없습니다.</p>}
    </section>
    <div className="adminGrid"><Bars title="관광지 관심 순위" rows={d.places} note="추천 관광지의 지도·안내 링크 클릭 상위 10곳입니다. 한 세션의 반복 클릭을 포함합니다."/>
    <Bars title="날씨별 방문 동선 완료" rows={d.trails} note="LJH에서 수집한 기존 완료 동선입니다. 전체 기간·전체 예보 기준이며 SDH의 링크 확인은 방문 완료로 집계하지 않습니다."/></div>
  </>;
}
