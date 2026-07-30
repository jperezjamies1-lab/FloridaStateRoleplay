
(function(){
  const clone=v=>JSON.parse(JSON.stringify(v));
  const merge=(a,b)=>{if(Array.isArray(a)||Array.isArray(b))return b===undefined?clone(a):clone(b);if(a&&typeof a==='object'&&b&&typeof b==='object'){const o={...a};Object.keys(b).forEach(k=>o[k]=k in a?merge(a[k],b[k]):clone(b[k]));return o}return b===undefined?a:b};
  let state=merge(window.FSRP_DEFAULTS,JSON.parse(localStorage.getItem('fsrpPreviewState')||'{}'));
  const listeners=[];
  const api={get:()=>state,set(next,{persist=true}={}){state=merge(window.FSRP_DEFAULTS,next||{});if(persist)localStorage.setItem('fsrpPreviewState',JSON.stringify(state));listeners.forEach(fn=>fn(state));document.dispatchEvent(new CustomEvent('fsrp:state',{detail:state}));},patch(path,value){const parts=path.split('.');const next=clone(state);let cur=next;parts.slice(0,-1).forEach(k=>cur=cur[k]??(cur[k]={}));cur[parts.at(-1)]=value;api.set(next);},subscribe(fn){listeners.push(fn);return()=>listeners.splice(listeners.indexOf(fn),1)},async loadCloud(){try{const r=await fetch('/api/settings',{headers:{Accept:'application/json'}});if(!r.ok)return;const data=await r.json();if(data&&data.settings)api.set(merge(state,data.settings),{persist:false})}catch{}},reset(){localStorage.removeItem('fsrpPreviewState');api.set(clone(window.FSRP_DEFAULTS),{persist:false})}};
  window.FSRP_STORE=api;
})();
