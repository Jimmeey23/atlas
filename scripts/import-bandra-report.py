"""Prepare supplied Bandra chapters for the native report reader; never execute source scripts."""
import sys, re, json, hashlib
from pathlib import Path
from bs4 import BeautifulSoup
base=Path(sys.argv[1]); destination=Path(sys.argv[2])
order=[('overview','Performance Review','Performance_Review'),('sales-performance','Sales Performance','1_Sales_Performance'),('class-performance','Class Performance','2_Class_Performance'),('instructor-performance','Instructor Performance','3_Instructor_Performance'),('lapsed-churned','Lapsed & Churned','4_Lapsed_Churned'),('format-comparisons','Format Comparisons','5_Format_Comparisons'),('cancellations-discounts','Cancellations & Discounts','6_Cancellations_Discounts'),('studio-overview','Studio Overview','7_Studio_Overview'),('lead-performance','Lead Performance','8_Lead_Performance'),('member-behaviour','Member Behaviour','9_Member_Behaviour')]
def metric(label,value,note='September 2026 · supplied chapter evidence'):return dict(label=label,value=value,note=note)
manual={
'instructor-performance':[metric('Instructors teaching','14'),metric('Studio sessions','259'),metric('Attendances','1,404'),metric('Session revenue','₹13,06,451'),metric('Top instructor revenue','₹2,04,536','September 2026 · Vivaran Dhasmana, 39 sessions'),metric('Top 3 session share','37.5%')],
'lapsed-churned':[metric('September lapses','Unavailable','Source contains historical lifecycle totals, without a September-only lapse count'),metric('September churn rate','Unavailable','No September-only denominator supplied'),metric('September unused sessions','Unavailable','Historical unused sessions must not be shown as September totals')],
'format-comparisons':[metric('Studio sessions','259'),metric('Formats delivered','12','September 2026 · includes hosted and instructor-choice formats'),metric('Attendances','1,404'),metric('Attributed revenue','₹13,06,451'),metric('FIT capacity utilisation','71.0%'),metric('PowerCycle attendances','410')],
'cancellations-discounts':[metric('Late cancellations','199'),metric('Seats booked','1,604'),metric('Booked seats attended','87.5%'),metric('Late cancellations / booked','12.4%','September 2026 · calculated: 199 / 1,604 booked seats'),metric('Discount given','₹1,45,209','September 2026 · supplied Sales Performance chapter'),metric('Discounted sales','31','September 2026 · supplied Sales Performance chapter')],
'studio-overview':[metric('Studio sessions','259'),metric('Attendances','1,404'),metric('Capacity utilisation','42.6%'),metric('Session revenue','₹13,06,451'),metric('Cash received','₹15,29,410'),metric('Unique buyers','139')],
'lead-performance':[metric('Leads created','189'),metric('Trial completed','54.5%','September 2026 creation cohort · source monthly table'),metric('Won','6.3%','September 2026 creation cohort · source monthly table'),metric('Still open','25.9%','September 2026 creation cohort · source monthly table'),metric('Mean lifetime value','₹1,063','September 2026 creation cohort · lifetime outcome, not September cash')],
'member-behaviour':[metric('Members attending','394'),metric('Attended visits','1,404'),metric('Visits per member','3.56'),metric('Members visiting once','205','September 2026 · Studio Overview frequency table'),metric('One-visit share','52.0%','September 2026 · 205 / 394 members'),metric('Busiest hour check-ins','265','September 2026 · 11:00, member behaviour table')]
}
# Repair the source generator's percentage/rate geometry bug. Axes use 0–1 fractions,
# while some series coordinates were generated from percentage values (100 times too large).
def repair_svg(svg):
 lines=[e for e in svg.find_all('line') if e.get('y1')==e.get('y2') and e.get('x1')!=e.get('x2')]
 if len(lines)<2:return False
 ys=[float(e['y1']) for e in lines]; bottom=max(ys); top=min(ys)
 if not any('%' in e.get_text() and float(e.get('x',1000))<100 for e in svg.find_all('text')):return False
 huge=False
 for e in svg.find_all(['circle','rect','path']):
  vals=re.findall(r'-?\d+(?:\.\d+)?',str(e.get('d',''))) if e.name=='path' else [e.get('cy',e.get('y','0'))]
  if any(float(v)<bottom-(bottom-top)*5 for v in vals):huge=True
 if not huge:return False
 for e in svg.find_all(['rect','circle','path','text']):
  if e.name=='rect' and float(e.get('height','0'))>bottom-top+5:
   h=float(e['height'])/100; e['height']=str(round(h,3));e['y']=str(round(bottom-h,3))
  elif e.name=='circle' and float(e.get('cy','0'))<top:
   e['cy']=str(round(bottom-(bottom-float(e['cy']))/100,3))
  elif e.name=='path':
   def coord(m):
    x,y=m.groups(); v=float(y); return x+','+str(round(bottom-(bottom-v)/100,3) if v<top else v)
   e['d']=re.sub(r'(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)',coord,e.get('d',''))
  elif e.name=='text' and float(e.get('y','0'))<top:
   y=float(e['y']); e['y']=str(round(bottom-(bottom-y-5)/100-5,3))
 for e in svg.find_all('text'):
  t=e.get_text(); m=re.fullmatch(r'(\d+(?:\.\d+)?)%',t)
  if m and float(m[1])>100:e.string=f'{float(m[1])/100:g}%'
 return True
# Source plots sometimes omitted the multiplied comparison series from the axis maximum.
# Expand that existing linear domain, preserving the inferred plotted values and units.
def fit_axis(svg):
 lines=[e for e in svg.find_all('line') if e.get('y1')==e.get('y2') and e.get('x1')!=e.get('x2')]
 if len(lines)<2:return False
 ys=[float(e['y1']) for e in lines]; bottom=max(ys); top=min(ys); span=bottom-top
 if span<=0:return False
 coords=[]
 for e in svg.find_all(['circle','rect','path']):
  if e.name=='path':coords.extend(float(y) for x,y in re.findall(r'(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)',e.get('d','')))
  else:coords.append(float(e.get('cy',e.get('y',bottom))))
 minimum=min(coords,default=top)
 if minimum>=top-3:return False
 ticks=[e for e in svg.find_all('text') if float(e.get('x',1000))<100 and top<=float(e.get('y',1000))<=bottom+5 and re.fullmatch(r'[\d,.]+%?',e.get_text())]
 if not ticks:return False
 maximum=max(float(e.get_text().replace(',','').replace('%','')) for e in ticks)
 if not maximum:return False
 import math
 required=maximum*(bottom-minimum)/span; step=maximum/4; new_max=math.ceil(required/step)*step; factor=maximum/new_max
 for e in svg.find_all(['rect','circle','path','text']):
  if e.name=='rect' and float(e.get('y',bottom))<bottom and float(e.get('height',0))>10:
   h=float(e['height'])*factor;e['height']=str(round(h,3));e['y']=str(round(bottom-h,3))
  elif e.name=='circle' and float(e.get('cy',bottom))<bottom:e['cy']=str(round(bottom-(bottom-float(e['cy']))*factor,3))
  elif e.name=='path':e['d']=re.sub(r'(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)',lambda m:m[1]+','+str(round(bottom-(bottom-float(m[2]))*factor,3)),e.get('d',''))
  elif e.name=='text' and e not in ticks and float(e.get('y',bottom))<top:
   e['y']=str(round(bottom-(bottom-float(e['y'])-5)*factor-5,3))
 for t in ticks:
  value=float(t.get_text().replace(',','').replace('%',''))/factor;unit='%' if '%' in t.get_text() else '';t.string=f'{value:g}{unit}'
 return True
safe_tags={'p','div','span','strong','b','i','em','br','h2','h3','h4','ul','ol','li','a','table','thead','tbody','tfoot','tr','th','td','caption','figure','figcaption','details','summary','section','blockquote','svg','g','path','rect','circle','line','polyline','polygon','text','tspan','defs','clippath','title'}
svgattrs={'viewbox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','stroke','stroke-width','stroke-linejoin','stroke-linecap','text-anchor','font-size','transform','opacity','fill-opacity','stroke-dasharray','xmlns','preserveaspectratio'}
colors={'#0F4C5C':'var(--accent)','#0f2c5e':'var(--accent)','#3F7F8C':'var(--accent)','#A6C4C9':'var(--text-3)','#BE7048':'var(--warning)','#E7E5E2':'var(--hairline)','#6B7280':'var(--text-2)','#12161A':'var(--text-1)','#D3D7DA':'var(--hairline)'}
def clean(node):
 for bad in node.select('script, style, iframe, object, embed, form, input, button, nav, link, meta'):bad.decompose()
 for e in list(node.find_all(True)):
  if not e.parent:continue
  if e.name not in safe_tags:e.unwrap();continue
  old=e.get('class',[]); attrs={}
  in_svg=e.name=='svg' or e.find_parent('svg') is not None
  if in_svg:
   for k,v in e.attrs.items():
    if k.lower() in svgattrs: attrs[{'viewbox':'viewBox','preserveaspectratio':'preserveAspectRatio'}.get(k,k)]=colors.get(str(v),v)
  else:
   for k in ['colspan','rowspan','scope','open']:
    if k in e.attrs:attrs[k]=e[k]
   classes=[]
   for c in old:
    if c in ['sub','call','rec','hcard','imp','lbl','stat','v','l','d','cnote','tag','funnel','step','flow','table-wrap']:classes.append('sr-'+c)
   if classes:attrs['class']=' '.join(classes)
  e.attrs=attrs
  if e.name=='table':
   wrapper=BeautifulSoup('<div class="sr-table-scroll"></div>','html.parser').div
   e.wrap(wrapper)
 return str(node)
chapters=[]
for id,title,suffix in order:
 p=base/f'Bandra_September_2026_{suffix}.html'; raw=p.read_text(); soup=BeautifulSoup(raw,'html.parser'); header=soup.find('header');summary=header.select_one('.lede').get_text(' ',strip=True) if header and header.select_one('.lede') else ''
 metrics=manual.get(id)
 if metrics is None:
  metrics=[metric(k.select_one('.l').get_text(' ',strip=True),k.select_one('.v').get_text(' ',strip=True),'September 2026 · '+(k.select_one('.d').get_text(' ',strip=True) if k.select_one('.d') else 'supplied source')) for k in soup.select('.kpi')]
 wrap=soup.select_one('.wrap'); first=wrap.find('h2'); wrap=first.parent if first and first.parent.name=='footer' else wrap; sections=[]; current=None
 for child in list(wrap.children):
  if getattr(child,'name',None)=='h2':
   current=dict(id=f'section-{len(sections)+1}',title=child.get_text(' ',strip=True),nodes=[]);sections.append(current)
  elif current is not None and getattr(child,'name',None) not in ['style','script','nav']:
   if getattr(child,'attrs',{}) and ('kpis' in child.get('class',[]) or 'toc' in child.get('class',[])):continue
   current['nodes'].append(str(child))
 result=[]
 for s in sections:
  fragment=BeautifulSoup(''.join(s.pop('nodes')),'html.parser'); repairs=0
  for svg in fragment.find_all('svg'):
   fixed=repair_svg(svg); expanded=fit_axis(svg); repairs+=bool(fixed or expanded)
  result.append(dict(**s,html=clean(fragment),tables=len(fragment.find_all('table')),charts=len(fragment.find_all('svg')),chartRepairs=repairs))
 scopeNote='Headline cards show September 2026 only. Supporting analysis includes historical cohorts, year-to-date comparisons and source-reported snapshots; those retain their stated scope.'
 if id=='lapsed-churned':scopeNote='The supplied lifecycle chapter covers memberships from 2022 through its stated October 2026 snapshot. It does not supply September-only lapse or churn totals; monthly cards remain unavailable.'
 if id=='instructor-performance':scopeNote+=' Payroll conversion evidence ends in August 2026 and is retained as historical context, excluded from September cards.'
 chapters.append(dict(id=id,title=title,filename=p.name,html='',sha256=hashlib.sha256(raw.encode()).hexdigest(),tables=sum(s['tables'] for s in result),charts=sum(s['charts'] for s in result),summary=summary,metrics=metrics,sections=result,scopeNote=scopeNote))
destination.write_text(json.dumps(chapters,ensure_ascii=False));print(json.dumps([dict(title=c['title'],cards=len(c['metrics']),tables=c['tables'],charts=c['charts'],repairs=sum(s['chartRepairs'] for s in c['sections'])) for c in chapters],indent=2))
