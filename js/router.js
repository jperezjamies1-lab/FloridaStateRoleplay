
(function(){
 const pages=()=>[...document.querySelectorAll('[data-page]')];
 function route(name){name=(name||location.hash.slice(1)||'home').split('?')[0];const state=window.FSRP_STORE?.get();if(name!=='home'&&name!=='manager'&&state?.features&&state.features[name]===false)name='home';const target=document.querySelector(`[data-page="${CSS.escape(name)}"]`)||document.querySelector('[data-page="home"]');pages().forEach(p=>p.classList.toggle('is-active',p===target));document.querySelectorAll('[data-route]').forEach(a=>a.classList.toggle('is-active',a.dataset.route===name));document.getElementById('mobile-drawer')?.classList.remove('is-open');window.scrollTo({top:0,behavior:'instant'});document.dispatchEvent(new CustomEvent('fsrp:route',{detail:name}));}
 window.addEventListener('hashchange',()=>route());document.addEventListener('click',e=>{const a=e.target.closest('[data-route]');if(a){const name=a.dataset.route;if(location.hash.slice(1)===name){e.preventDefault();route(name)}}});document.addEventListener('DOMContentLoaded',()=>route());window.FSRP_ROUTE=route;
})();
