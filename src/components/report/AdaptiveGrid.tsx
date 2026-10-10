import {useEffect,useRef,type ReactNode} from 'react';
/** Full-width dense panels; equal-height half panels otherwise. Attributes survive HTML export. */
export function AdaptiveGrid({children,className='',enabled=true}:{children:ReactNode;className?:string;enabled?:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const root=ref.current;if(!root)return;
    let frame=0;let previousWidth=0;
    const measure=()=>{
      cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
        const width=root.getBoundingClientRect().width;
        const panels=Array.from(root.children) as HTMLElement[];
        if(Math.abs(width-previousWidth)>24){panels.forEach(el=>delete el.dataset.measuredFull);previousWidth=width;}
        if(!enabled || width<700)return;
        let pending:HTMLElement|undefined;
        for(const panel of panels){
          if(panel.dataset.dense==='true' || panel.dataset.measuredFull){if(pending){pending.dataset.measuredFull='true';pending=undefined;}continue;}
          if(!pending){pending=panel;continue;}
          const ah=pending.getBoundingClientRect().height,bh=panel.getBoundingClientRect().height;
          if(Math.max(ah,bh)>440 || Math.abs(ah-bh)>90){pending.dataset.measuredFull='true';panel.dataset.measuredFull='true';}
          pending=undefined;
        }
        if(pending)pending.dataset.measuredFull='true';
      });
    };
    const observer=new ResizeObserver(measure);observer.observe(root);Array.from(root.children).forEach(el=>observer.observe(el));measure();
    return()=>{observer.disconnect();cancelAnimationFrame(frame);};
  },[children,enabled]);
  return <div ref={ref} className={`r-adaptive-grid ${className}`} data-adaptive={enabled}>{children}</div>;
}
