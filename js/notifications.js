
(function(){
 let filter='all';const panel=()=>document.getElementById('notification-panel');
 function items(){const s=FSRP_STORE.get();return (s.announcements||[]).map(a=>({type:a.category||'announcement',title:a.title,body:a.body,date:a.date})).concat([{type:'website',title:'Website connected',body:'The FSRP community platform is ready.',date:'Now'}])}
 function render(){const list=items().filter(x=>filter==='all'||x.type===filter);document.getElementById('notification-list').innerHTML=list.map(x=>`<article class="notif-item"><span class="eyebrow">${x.type}</span><h3>${x.title}</h3><p>${x.body}</p><small>${x.date||''}</small></article>`).join('');const c=document.getElementById('notif-count');c.textContent=list.length;c.hidden=!list.length}
 document.addEventListener('click',e=>{if(e.target.closest('#notif-trigger,[data-open-notifications]'))panel().classList.toggle('is-open');const f=e.target.closest('[data-notif-filter]');if(f){filter=f.dataset.notifFilter;document.querySelectorAll('[data-notif-filter]').forEach(b=>b.classList.toggle('is-active',b===f));render()}if(e.target.closest('#mark-all-read')){localStorage.setItem('fsrpNotificationsRead','1');document.getElementById('notif-count').hidden=true}});document.addEventListener('fsrp:state',render);document.addEventListener('DOMContentLoaded',render);
})();
