function soon(e){ if(e){e.preventDefault();e.stopPropagation();} showSoonToast('Скоро появится'); return false }
function showSoonToast(msg){
  var t=document.getElementById('__soonToast');
  if(!t){
    t=document.createElement('div');
    t.id='__soonToast';
    t.style.cssText='position:fixed;left:50%;bottom:34px;transform:translateX(-50%) translateY(20px);background:linear-gradient(135deg,#7C3AED,#4F46E5);color:#fff;padding:13px 26px;border-radius:99px;font-size:14px;font-weight:600;font-family:Inter,-apple-system,sans-serif;box-shadow:0 10px 36px rgba(124,58,237,.45);z-index:99999;opacity:0;transition:opacity .3s,transform .3s;pointer-events:none';
    document.body.appendChild(t);
  }
  t.textContent=msg;
  requestAnimationFrame(function(){ t.style.opacity='1'; t.style.transform='translateX(-50%) translateY(0)'; });
  clearTimeout(window.__soonTimer);
  window.__soonTimer=setTimeout(function(){ t.style.opacity='0'; t.style.transform='translateX(-50%) translateY(20px)'; },2200);
}
