"""Correct directly comparable source cells while keeping authored report content intact."""
import json,re
from bs4 import BeautifulSoup
from pathlib import Path
model=json.load(open('/tmp/bandra-restored-source.json'))
source=json.load(open('/tmp/bandra-report-current.json'))
mapdata={'sales-performance':'revenue-performance','class-performance':'sessions','instructor-performance':'sessions','format-comparisons':'sessions','studio-overview':'sessions','member-behaviour':'attendance','cancellations-discounts':'sessions','lead-performance':'leads','overview':'conversion-funnel','lapsed-churned':'lapsed'}
metrics={'sessions':'sessions','classes':'sessions','classes run':'sessions','sessions run':'sessions','seats':'capacity','seats offered':'capacity','capacity':'capacity','attended':'attendance','attendees':'attendance','attendances':'attendance','attendance':'attendance','filled':'attendance','fill':'fill_rate','fill rate':'fill_rate','utilisation':'fill_rate','utilization':'fill_rate','avg class':'avg_class_size_incl','average class':'avg_class_size_incl','class revenue':'revenue','revenue / class':'revenue_per_session','per class':'revenue_per_session','revenue per session':'revenue_per_session','revenue / attendee':'rev_pac','per head':'rev_pac','per head':'rev_pac','booked':'booked','seats booked':'booked','cash':'gross_revenue','gross':'gross_revenue','net of vat':'net_revenue','vat':'vat','aov':'aov','buyers':'buyers','units':'units','units sold':'units','discount given':'discount_value','discount':'discount_value','discount rate':'discount_rate','distinct sales':'transactions','sales':'transactions','transactions':'transactions','check-ins':'checkins','members':'unique_attendees','visits per member':'visits_per_member'}
fieldmap={'trainer':'trainer','format':'format','class format':'format','product':'product','category':'category','day':'day','start hour':'time','hour':'time','payment method':'payment_method','salesperson':'associate','sold by':'associate','associate':'associate','code':'discount_code'}
registry={m['id']:m for m in json.load(open('src/semantics/registry.json'))}
def fmt(metric,value):
 m=registry.get(metric,{});v=float(value)
 if m.get('format')=='percent':return f'{v*100:.1f}%'
 if m.get('format')=='currency':
  s=str(round(abs(v)));head,tail=s[:-3],s[-3:];parts=[]
  while head:parts.insert(0,head[-2:]);head=head[:-2]
  return ('−' if v<0 else '')+'₹'+','.join(parts+[tail])
 if m.get('format') in ['ratio','decimal','days']:return f'{v:.2f}'
 return f'{round(v):,}'
changes=[]
for chapter in model['importedChapters']:
 data=model['chapters'].get(mapdata[chapter['id']],{});groups={g['field']:g['rows'] for g in data.get('groups',[])}
 for section in chapter['sections']:
  if not section['html']:continue
  soup=BeautifulSoup(section['html'],'html.parser')
  for table in soup.select('table'):
   heads=[x.get_text(' ',strip=True) for x in table.select('tr:first-child th, tr:first-child td')]
   if not heads:continue
   field=fieldmap.get(heads[0].lower());rows={str(r['g']).strip().lower():r for r in groups.get(field,[])}
   # Historical and cohort-model columns keep their distinct source definitions.
   alltime=any(re.search(r'all.time|lifetime|months on record|classes completed|days in force|prior|ever|matured|90.day|30.day',h,re.I) for h in heads)
   monthly=not alltime and chapter['id'] not in ['lead-performance','lapsed-churned','overview']
   for tr in table.select('tr')[1:]:
    cells=tr.select('td,th');label=cells[0].get_text(' ',strip=True) if cells else ''
    row=rows.get(label.strip().lower()) if field else next((r for r in data.get('history',[]) if r['month']=='2026-09'),{}) if re.fullmatch(r'(Sept?\s*)?2026|Sept?\s*26|2026-09',label,re.I) else None
    if not row:continue
    for i,(head,cell) in enumerate(zip(heads,cells)):
     if i==0:continue
     h=head.lower().strip();year=re.search(r'(?:20)?(24|25|26)\b',h)
     if year and year[1]!='26':continue
     if not monthly and not re.search(r'sep.*(?:26|2026)|september|\b2026\b',h):continue
     h=re.sub(r'\s*(?:sept?[-\s]*(?:20)?26|2026|\(html exact\)|\(pdf\))','',h).strip()
     metric=metrics.get(h)
     if h=='revenue':metric='gross_revenue' if mapdata[chapter['id']]=='revenue-performance' else 'revenue'
     if metric=='rev_pac' and 'attendance' in row: value=row['revenue']/row['attendance'] if row['attendance'] else None
     elif metric and metric in row:value=row[metric]
     else:continue
     if value is None:continue
     old=cell.get_text(' ',strip=True);new=fmt(metric,value)
     if old!=new:
      changes.append({'chapter':chapter['id'],'section':section['id'],'row':label,'column':head,'source':old,'app':new});cell.clear();cell.append(new);cell['data-app-verified']='true';cell['title']='Reconciled with the app’s September 2026 data'
   table['data-source-dataset']=mapdata[chapter['id']]
  # Stable identifiers include every cell, enabling manual and AI element edits.
  for i,el in enumerate(soup.select('p,h3,h4,figure,table,li,td,th,.sr-call,.sr-rec')):el['data-source-element']=f'{section["id"]}-element-{i}'
  section['html']=str(soup)
model['dataAudit']['sourceCellCorrections']=len(changes)
model['dataAudit']['corrections'].append(f'{len(changes)} directly comparable authored table cells were reconciled with the app. Cohort-model and historical columns keep their source periods and definitions.')
json.dump(changes,open('.floor/audits/bandra-source-cell-corrections.json','w'),ensure_ascii=False,indent=2)
json.dump(model,open('/tmp/bandra-restored-source.json','w'),ensure_ascii=False,separators=(',',':'))
print('Authored narrative retained; directly comparable cells reconciled:',len(changes))
