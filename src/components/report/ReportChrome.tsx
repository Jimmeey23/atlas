import { useEffect, useState } from 'react';
import logo from '../../assets/report/logo.png';
import method from '../../assets/report/method.jpg';
import cycle from '../../assets/report/cycle.jpg';
import barre from '../../assets/report/barre.jpg';
import portrait from '../../assets/report/portrait.jpg';

const slides=[{src:method,caption:'Motion in focus'},{src:cycle,caption:'PowerCycle after dark'},{src:barre,caption:'Barre activation · Controlled strength'}];
export function ReferenceHero({studio,period,built,aiCount,total,title,subtitle,preparedFor,preparedBy}:{studio:string;period:string;built:string;aiCount:number;total:number;title?:string;subtitle?:string;preparedFor?:string;preparedBy?:string}) {
  const [index,setIndex]=useState(0),[paused,setPaused]=useState(false);
  useEffect(()=>{
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    let timer:ReturnType<typeof setInterval>|undefined;
    const update=()=>{if(timer)clearInterval(timer);if(!paused&&!motion.matches)timer=setInterval(()=>setIndex(current=>(current+1)%slides.length),7000);};
    update();motion.addEventListener('change',update);return()=>{if(timer)clearInterval(timer);motion.removeEventListener('change',update);};
  },[paused]);
  return <header className="r-hero r-reference-hero" id="report-cover"><div className="r-container r-reference-hero-content">
    <div className="r-hero-topline"><span className="r-hero-badge"><img src={logo} alt="Physique 57 logo"/>Senior management review · Physique 57 India</span><span className="r-period-mark">{period}</span></div>
    <h1>{title && !/^monthly performance (report|review)$/i.test(title) ? title : `${studio} monthly review`} <span>{period}</span></h1>
    <p className="r-hero-sub">{subtitle || "Commercial performance, the community journey and the decisions for the month ahead."}</p>
    <div className="r-hero-media-grid" aria-label="Physique 57 brand photography">
      <figure className="r-hero-media-card r-hero-media-main" data-carousel-root="" aria-roledescription="carousel" aria-label="Physique 57 Method photography">
        <div className="r-carousel-viewport">{slides.map((slide,i)=><div className="r-carousel-slide" data-carousel-slide={i} hidden={index!==i} key={slide.src}><img src={slide.src} alt={slide.caption}/><figcaption className="r-hero-media-caption">{slide.caption}</figcaption></div>)}</div>
        <div className="r-carousel-controls"><button type="button" data-carousel-step="-1" aria-label="Previous image" onClick={()=>setIndex(current=>(current+slides.length-1)%slides.length)}>←</button><div className="r-carousel-dots" role="group" aria-label="Choose brand photograph">{slides.map((slide,i)=><button type="button" data-carousel-choice={i} key={slide.src} aria-label={slide.caption} aria-pressed={index===i} onClick={()=>setIndex(i)}/>)}</div><button type="button" data-carousel-step="1" aria-label="Next image" onClick={()=>setIndex(current=>(current+1)%slides.length)}>→</button><button type="button" data-carousel-pause="" aria-label={paused?'Resume photography':'Pause photography'} aria-pressed={paused} onClick={()=>setPaused(current=>!current)}>{paused?'Resume':'Pause'}</button></div>
      </figure>
      <figure className="r-hero-media-card r-hero-media-side"><img src={portrait} alt="Physique 57 brand portrait in black and white"/><figcaption className="r-hero-media-caption">Studio portrait · Power and presence</figcaption></figure>
    </div>
    <div className="r-hero-meta">{[{label:'Reporting period',value:period},{label:'Studio',value:studio},{label:'Report basis',value:'Studio source snapshots'},{label:'Built',value:built},{label:'Analysis',value:`${aiCount}/${total} AI-assisted chapters`},...(preparedFor ? [{label:'Prepared for',value:preparedFor}] : []),...(preparedBy ? [{label:'Prepared by',value:preparedBy}] : [])].map(item=><div key={item.label}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>
  </div></header>;
}
