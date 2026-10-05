import type { ReactNode } from "react";
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => part.startsWith("**") ? <b key={i}>{part.slice(2,-2)}</b> : part.startsWith("`") ? <code key={i}>{part.slice(1,-1)}</code> : part);
}
export function ChatAnswer({text}:{text:string}) {
  return <div className="chat-answer">{text.split(/\n\n+/).map((block,index)=>{
    const lines=block.trim().split('\n');
    if(lines.length>1 && lines[0].includes('|') && /^\s*\|?[\s:|-]+\|\s*$/.test(lines[1])) {
      const cells=(line:string)=>line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());
      return <div className="chat-result" key={index}><table><thead><tr>{cells(lines[0]).map((c,j)=><th key={j}>{inline(c)}</th>)}</tr></thead><tbody>{lines.slice(2).map((line,i)=><tr key={i}>{cells(line).map((c,j)=><td key={j}>{inline(c)}</td>)}</tr>)}</tbody></table></div>;
    }
    if(lines.every(line=>/^\s*[-*]\s/.test(line))) return <ul key={index}>{lines.map((line,j)=><li key={j}>{inline(line.replace(/^\s*[-*]\s/,''))}</li>)}</ul>;
    return <p key={index} style={{whiteSpace:'pre-wrap'}}>{inline(block.replace(/^#{1,6}\s/,''))}</p>;
  })}</div>;
}
