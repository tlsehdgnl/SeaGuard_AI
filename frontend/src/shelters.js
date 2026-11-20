export function validPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0])<=90 && Math.abs(point[1])<=180;
}
export function distanceMeters(a, b) {
  if (!validPoint(a) || !validPoint(b)) return Infinity;
  const rad = n => n*Math.PI/180;
  const h = Math.sin(rad(b[0]-a[0])/2)**2 + Math.cos(rad(a[0]))*Math.cos(rad(b[0]))*Math.sin(rad(b[1]-a[1])/2)**2;
  return 6371000*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h))));
}
export function nearestShelters(point, items, limit=3) {
  if (!validPoint(point)) return [];
  return items.filter(item=>validPoint(item.point)).map(item=>({...item,distance:distanceMeters(point,item.point)}))
    .filter(item=>item.distance<=15000).sort((a,b)=>a.distance-b.distance || a.id.localeCompare(b.id)).slice(0,limit);
}
