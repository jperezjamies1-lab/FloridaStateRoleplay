
export function json(data,status=200,extra={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store',...extra}})}
export async function body(request){try{return await request.json()}catch{return{}}}
export function timingSafeEqual(a,b){a=String(a||'');b=String(b||'');if(a.length!==b.length)return false;let r=0;for(let i=0;i<a.length;i++)r|=a.charCodeAt(i)^b.charCodeAt(i);return r===0}
export function bearer(request){return (request.headers.get('authorization')||'').replace(/^Bearer\s+/i,'')}
