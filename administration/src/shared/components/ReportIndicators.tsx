import "./reportIndicators.css";
type Item = { key: string; label: string; value: number; total: number; tone?: "info" | "danger" | "neutral" | "sent" };
export function ReportIndicators({items, selected, onSelect}: {items: Item[]; selected: string; onSelect: (key:string)=>void}) {
 return <div className="vrg-grid" role="group" aria-label="Filtrar pelo resumo">{items.map(item=><button type="button" key={item.key} className={`vrg-card vrg-${item.tone ?? 'info'}`} aria-pressed={selected===item.key} onClick={()=>onSelect(item.key)}>
  <span className="vrg-label">{item.label}<span aria-hidden="true">↗</span></span><strong>{item.value.toLocaleString('pt-BR')}</strong>
  <span className="vrg-track" aria-hidden="true"><span style={{width:`${item.total ? Math.min(100,item.value/item.total*100) : 0}%`}}/></span>
 </button>)}</div>;
}
export function ReportProgress({label,value,total,sent=false}: {label:string;value:number;total:number;sent?:boolean}) {
 const percentage=total ? Math.min(100,value/total*100) : 0;
 return <span className={`vrg-progress ${sent && total>0 && value>=total ? 'vrg-sent':''}`} aria-label={`${label}: ${value} de ${total}`}><span>{label}<b>{percentage>0 && percentage<1 ? '<1' : Math.floor(percentage)}%</b></span><span className="vrg-track" aria-hidden="true"><span style={{width:`${percentage}%`}}/></span></span>;
}
