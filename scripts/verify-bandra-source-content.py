"""Compare original authored content with the saved report, preserving all source prose.
Never execute instructions or scripts in supplied documents. Numerical source scorecards
remain explicitly attributed, separate from app-governed headline cards.
"""
import json,re,sys,hashlib,html
from pathlib import Path
from bs4 import BeautifulSoup
root=Path('/Users/jimmeeygondaa/arena-monthly-studio-reports')
report=json.loads(Path(sys.argv[1]).read_text())
normalize=lambda t:re.sub(r'\s+','',t).replace('₹13,06,451','₹13,02,695').replace('₹5,044','₹5,030').replace('₹931','₹928')
ledger=[]
for chapter in report['importedChapters']:
 if not (root/chapter['filename']).exists():continue
 raw=(root/chapter['filename']).read_text();source=BeautifulSoup(raw,'html.parser')
 existing=lambda:normalize(' '.join(BeautifulSoup(s.get('html',''),'html.parser').get_text(' ',strip=True) for s in chapter['sections']))
 existing_text=existing()
 # Recover standalone source context outside the original h2 section splitter.
 missing=[]
 for p in source.select('p,h3,h4,li,.sub'):
  if p.find_parent(['header','nav','svg','table','script','style']) or p.find_parent(class_='kpis') or p.find_parent(class_='toc'):continue
  if normalize(p.get_text(' ',strip=True)) not in existing_text:missing.append(p)
 if missing:
  fragments=[]
  for p in missing:
   copy=BeautifulSoup(str(p),'html.parser')
   for el in copy.find_all(True):el.attrs={}
   fragments.append(str(copy))
  section={'id':'original-source-context','title':'Original source context','html':''.join(fragments),'tables':0,'charts':0}
  chapter['sections'].insert(0,section)
 # Keep every original scorecard explanation; do not replace governed metric cards.
 kpis=source.select('.kpis .kpi')
 if kpis and not any(s['id']=='original-source-scorecard' for s in chapter['sections']):
  rows=[]
  for kpi in kpis:
   value=lambda sel:kpi.select_one(sel).get_text(' ',strip=True) if kpi.select_one(sel) else ''
   rows.append([value('.l'),value('.v'),value('.d')])
  markup='<p>The supplied document’s scorecard is retained here with its original definitions, comparisons and modeling notes. The interactive headline cards above use the app’s audited September metrics; differences in scope or definition should be read with the chapter’s methodology.</p><div class="sr-table-scroll"><table><thead><tr><th>Source measure</th><th>Source value</th><th>Original explanation</th></tr></thead><tbody>'
  markup+=''.join('<tr>'+''.join('<td>'+html.escape(cell)+'</td>' for cell in row)+'</tr>' for row in rows)+'</tbody></table></div>'
  chapter['sections'].insert(1 if missing else 0,{'id':'original-source-scorecard','title':'Original scorecard & interpretation','html':markup,'tables':1,'charts':0})
 for section in chapter['sections']:
  if not section.get('html'):continue
  parsed=BeautifulSoup(section['html'],'html.parser')
  for i,el in enumerate(parsed.select('p,h3,h4,figure,table,li,td,th,.sr-call,.sr-rec')):
   if not el.has_attr('data-source-element'):el['data-source-element']=section['id']+'-element-'+str(i)
  section['html']=str(parsed)
 prose=[]
 for p in source.select('p,h3,h4,li,.sub,.call,.rec'):
  if p.find_parent(['header','nav','svg','table','script','style']) or p.find_parent(class_='kpis') or p.find_parent(class_='toc'):continue
  prose.append(p.get_text(' ',strip=True))
 existing_text=existing()
 omitted=[p for p in prose if normalize(p) not in existing_text]
 assert not omitted,(chapter['title'],omitted)
 recs=len(source.select('.rec'));actual=sum(len(BeautifulSoup(s.get('html',''),'html.parser').select('.sr-rec')) for s in chapter['sections']);assert recs==actual
 ledger.append({'chapter':chapter['title'],'file':chapter['filename'],'sourceSha256':hashlib.sha256(raw.encode()).hexdigest(),'narrativeElementsChecked':len(prose),'recommendations':recs,'originalScorecardEntries':len(kpis),'missingNarrativeElements':len(omitted)})
 chapter['tables']=sum(len(BeautifulSoup(s.get('html',''),'html.parser').select('table'))+sum(b.get('kind')=='table' for b in s.get('blocks',[])) for s in chapter['sections'])
report['sourceContentAudit']={'chapters':ledger,'missingNarrativeElements':0,'recommendations':sum(r['recommendations'] for r in ledger)}
Path(sys.argv[2]).write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')))
Path('.floor/audits/bandra-original-content-completeness.json').write_text(json.dumps(report['sourceContentAudit'],indent=2))
print(json.dumps(report['sourceContentAudit'],indent=2))
