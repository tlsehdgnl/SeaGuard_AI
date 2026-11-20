export const BEACHES = [
  { id: "mangsangresort", name: "망상리조트", source: 57, description: "망상오토캠핑리조트 앞에 펼쳐진 해변이에요. 기곡해변으로도 알려져 있고, 바닷가에서 한옥마을까지 함께 둘러볼 수 있어요." },
  { id: "mangsang", name: "망상", source: 58, description: "넓은 백사장을 따라 바다를 바라보며 걷기 좋은 곳이에요. 주변의 망상사구생태관을 함께 둘러볼 수 있어요." },
  { id: "nobong", name: "노봉", source: 49, description: "망상해변 남쪽에 자리한 아담한 해변이에요. 짧게 바다를 보고 노봉안길 카페에서 쉬는 일정과 어울려요." },
  { id: "daejin", name: "대진", source: 52, description: "서핑으로 알려진 해변이에요. 해변 풍경을 감상한 뒤 대진항 쪽으로 일정을 이어갈 수 있어요." },
  { id: "eodal", name: "어달", source: 63, description: "어달항과 함께 둘러보기 좋은 해변이에요. 해안 풍경을 보고 묵호 쪽으로 이동해 논골담길 벽화를 구경할 수 있어요." },
  { id: "hapyeong", name: "하평", source: 71, description: "평릉동 철길 너머로 모래사장이 펼쳐져요. 바다와 철길이 나란히 이어지는 풍경을 볼 수 있어요." },
  { id: "gase", name: "가세", source: "https://wow1002nae.tistory.com/316", description: "한섬감성바닷길을 따라 고불개에서 북쪽으로 걸으면 만나는 해변이에요. 데크길에서 바위 해안과 바다를 내려다볼 수 있어요." },
  { id: "gobulgae", name: "고불개", source: 47, description: "한섬과 가세 사이에 있는 작은 해변이에요. 해안 산책길을 따라 기암과 모래사장을 함께 볼 수 있어요." },
  { id: "hanseom", name: "한섬", source: 72, description: "동해 시내에서 바다를 만날 수 있는 해변이에요. 한섬감성바닷길을 따라 해안 풍경을 감상하는 코스와 어울려요." },
  { id: "gamchu", name: "감추", source: 46, description: "천곡동 감추사 곁에 길쭉한 모래사장이 있어요. 해안의 갯바위와 소나무를 함께 볼 수 있어요." },
  { id: "chuam", name: "추암", source: 70, description: "촛대바위가 있는 해변이에요. 바위와 바다를 한눈에 보고, 추암조각공원에서 야외 작품을 둘러볼 수 있어요." },
  {"id": "mukhoport", "name": "묵호항", "port": true, "source": 97, "description": "묵호의 어선과 항구 풍경을 보고 활·선어판매센터와 동쪽바다중앙시장을 이어서 둘러볼 수 있어요."},
  {"id": "eodalport", "name": "어달항", "port": true, "source": 62, "description": "어달해변과 묵호 사이에 있는 작은 어항이에요. 해안도로를 따라 항구 풍경을 둘러볼 수 있어요."},
  {"id": "cheongokport", "name": "천곡항", "port": true, "source": 65, "description": "한섬감성바닷길을 걸으며 들를 수 있는 작은 항구예요. 고불개해변과 함께 둘러보기 좋아요."},
];

export function destinationName(id) {
  const place = BEACHES.find(item => item.id === id);
  return place.port ? place.name : place.name + "해변";
}
