"""Refresh the official Donghae tsunami evacuation-place snapshot; fail before overwrite."""
import json, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path
url='https://www.safekorea.go.kr/safekorea-kor/flsm/flsm/facilityDataList.do'
data=urllib.parse.urlencode(dict(tableNm='TFK_TSUNAMI_SHELTER_TEMP',tableKorNm='지진해일대피소',sggCd='51170',page=1,size=100)).encode()
with urllib.request.urlopen(urllib.request.Request(url,data=data),timeout=30) as response:
    raw=json.load(response)
rows=raw['mapList']
assert len(rows)==int(raw['totalCnt']) and len(rows)>=20, 'Incomplete response; existing snapshot retained'
items=[]
for row in rows:
    if row['delYn']!='N': continue
    assert row['sigunguName']=='동해시' and 37<row['lat']<38 and 128<row['lon']<130
    items.append(dict(id=str(row['id']),name=row['shelNm'].strip(),address=row['address'],point=[row['lat'],row['lon']],elevation=row['height'],modified_at=datetime.fromtimestamp(row['modifyDate']/1000,timezone.utc).isoformat()))
assert len({r['id'] for r in items})==len(items)
result=dict(source='행정안전부 국민재난안전포털',source_url='https://www.safekorea.go.kr/safekorea-kor/flsm/flsm/facilitiesSafteyMap.do?menuSn=234',dataset_url='https://www.data.go.kr/data/15138870/openapi.do',retrieved_at=datetime.now(timezone.utc).isoformat(),coverage='동해시',kind='tsunami',items=items)
Path(__file__).resolve().parents[1].joinpath('src/shelters.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(f'Updated {len(items)} official tsunami evacuation places')
