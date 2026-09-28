let sequence=0;
const openers=new WeakMap();

function enhanceFields(root=document){
  root.querySelectorAll?.('.px-field').forEach(field=>{
    const label=field.querySelector(':scope > label')||field.querySelector('label');
    const control=field.querySelector('input,select,textarea');
    if(!label||!control)return;
    if(!control.id)control.id=`jake-field-${++sequence}`;
    if(!label.htmlFor)label.htmlFor=control.id;
  });
}

function enhanceDialogs(root=document){
  root.querySelectorAll?.('.px-drawer-card,.modal-box').forEach(dialog=>{
    if(!dialog.getAttribute('role'))dialog.setAttribute('role','dialog');
    dialog.setAttribute('aria-modal','true');
    const heading=dialog.querySelector('h1,h2,.module-title,.modal-title');
    if(heading){
      if(!heading.id)heading.id=`jake-dialog-title-${++sequence}`;
      if(!dialog.getAttribute('aria-labelledby'))dialog.setAttribute('aria-labelledby',heading.id);
    } else if(!dialog.getAttribute('aria-label')) dialog.setAttribute('aria-label','JakeOS dialog');
    const close=[...dialog.querySelectorAll('button')].find(btn=>['×','✕'].includes(btn.textContent.trim()));
    if(close&&!close.getAttribute('aria-label'))close.setAttribute('aria-label','Close');
  });
}

function enhance(root=document){enhanceFields(root);enhanceDialogs(root);}

function visibleDialog(){
  const dialogs=[...document.querySelectorAll('[role="dialog"][aria-modal="true"],[role="alertdialog"][aria-modal="true"]')];
  return dialogs.reverse().find(el=>el.offsetParent!==null)||null;
}

function focusables(dialog){
  return [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
    .filter(el=>el.offsetParent!==null);
}

export function installAccessibilityBridge(){
  enhance();
  const observer=new MutationObserver(records=>{
    for(const record of records){
      for(const node of record.addedNodes){
        if(!(node instanceof Element))continue;
        enhance(node);
        const dialog=node.matches?.('.px-drawer-card,.modal-box,[role="dialog"],[role="alertdialog]')?node:node.querySelector?.('.px-drawer-card,.modal-box,[role="dialog"],[role="alertdialog]');
        if(dialog){
          openers.set(dialog,document.activeElement);
          queueMicrotask(()=>focusables(dialog)[0]?.focus());
        }
      }
      for(const node of record.removedNodes){
        if(!(node instanceof Element))continue;
        const dialog=node.matches?.('.px-drawer-card,.modal-box,[role="dialog"],[role="alertdialog]')?node:null;
        openers.get(dialog)?.focus?.();
      }
    }
  });
  observer.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('keydown',event=>{
    const dialog=visibleDialog();if(!dialog)return;
    if(event.key==='Escape'){
      const close=[...dialog.querySelectorAll('button')].find(btn=>btn.getAttribute('aria-label')==='Close'||['×','✕'].includes(btn.textContent.trim()));
      if(close){event.preventDefault();close.click();}
      return;
    }
    if(event.key!=='Tab')return;
    const list=focusables(dialog);if(!list.length)return;
    const first=list[0],last=list[list.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  return()=>observer.disconnect();
}
