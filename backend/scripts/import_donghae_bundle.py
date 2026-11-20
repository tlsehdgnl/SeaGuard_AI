"""Idempotent GLAB import; retains source files privately, never executes bundle code."""
import csv, hashlib, io, json, mimetypes, sys
from pathlib import Path
import httpx
from dotenv import dotenv_values


def main(folder):
    env=dotenv_values(Path(__file__).resolve().parents[1]/'.env.local')
    base=env['SUPABASE_URL'].rstrip('/')
    with httpx.Client(base_url=base,headers={'apikey':env['SUPABASE_SECRET_KEY']},timeout=60) as client:
        def request(method,path,**kwargs):
            r=client.request(method,path,**kwargs)
            if r.status_code not in (200,201,204,206):
                raise RuntimeError(f'{path}: HTTP {r.status_code}')
            return r
        bucket='departner-source-bundle'
        check=client.get('/storage/v1/bucket/'+bucket)
        if check.status_code==404 or (check.status_code==400 and check.json().get('code')=='NoSuchBucket'): request('POST','/storage/v1/bucket',json={'id':bucket,'name':bucket,'public':False})
        elif check.status_code!=200: raise RuntimeError('Cannot inspect source bucket')
        elif check.json().get('public'): raise RuntimeError('Source bucket must be private')
        def upsert(table,rows):
            for start in range(0,len(rows),100):
                request('POST','/rest/v1/'+table,headers={'Prefer':'resolution=merge-duplicates'},json=rows[start:start+100])
        report=[]
        for path in sorted(Path(folder).iterdir()):
            if not path.is_file(): continue
            raw=path.read_bytes(); digest=hashlib.sha256(raw).hexdigest()
            request('POST','/storage/v1/object/'+bucket+'/'+path.name,content=raw,headers={'Content-Type':mimetypes.guess_type(path.name)[0] or 'application/octet-stream','x-upsert':'true'})
            records=[]
            if path.suffix=='.json':
                value=json.loads(raw)
                records=value if isinstance(value,list) else [value]
            elif path.suffix=='.csv': records=list(csv.DictReader(io.StringIO(raw.decode('utf-8-sig'))))
            elif path.suffix in ('.md','.mjs'): records=[{'text':raw.decode('utf-8-sig'),'executable':False}]
            # The catalog is normalized below; original JSON remains in private storage.
            if path.name != 'seaguard-catalog.json':
                upsert('depart_source_records',[{'id':hashlib.sha256((path.name+':'+str(i)).encode()).hexdigest(),'source_file':path.name,'row_number':i,'payload':r} for i,r in enumerate(records,1)])
            upsert('depart_imports',[{'filename':path.name,'sha256':digest,'bytes':len(raw),'rows':len(records)}])
            report.append({'file':path.name,'rows':len(records),'sha256':digest})
        catalog=json.loads((Path(folder)/'seaguard-catalog.json').read_text())
        rows=[]
        for group in ('attractions','venues','facilities','courses'):
            for r in catalog[group]:
                rows.append({'id':r.get('id') or r.get('poi_id') or r.get('facility_id') or r.get('course_id'),
                    'kind':r.get('kind') or group,'name':r.get('name') or r.get('시설명') or r.get('코스명'),
                    'address':r.get('address') or r.get('주소'), 'latitude':r.get('latitude') or r.get('위도') or None,
                    'longitude':r.get('longitude') or r.get('경도') or None,'recommend_state':r.get('recommend_state','reference'),
                    'checked_at':r.get('checked_at') or r.get('확인 날짜'), 'source_file':'seaguard-catalog.json','payload':r})
        if len({r['id'] for r in rows})!=len(rows): raise RuntimeError('Duplicate catalog IDs')
        upsert('depart_catalog',rows)
        counts=request('GET','/rest/v1/depart_catalog?select=id',headers={'Prefer':'count=exact','Range':'0-0'}).headers.get('content-range')
        print(json.dumps({'files':report,'catalog_records':len(rows),'verified_content_range':counts},ensure_ascii=False,indent=2))

if __name__=='__main__': main(sys.argv[1])
