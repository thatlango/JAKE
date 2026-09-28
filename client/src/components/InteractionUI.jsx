import { cloneElement, isValidElement, useEffect, useId, useRef } from 'react';
import { Button } from './ProductUI';

function useDialogFocus(open,onClose){
  const ref=useRef(null);
  const restore=useRef(null);
  useEffect(()=>{
    if(!open)return;
    restore.current=document.activeElement;
    const root=ref.current;
    const focusables=()=>[...(root?.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')||[])];
    const first=focusables()[0];
    const timer=setTimeout(()=>first?.focus(),0);
    const onKey=e=>{
      if(e.key==='Escape'){e.preventDefault();onClose?.();return;}
      if(e.key!=='Tab')return;
      const list=focusables();if(!list.length)return;
      const a=list[0],b=list[list.length-1];
      if(e.shiftKey&&document.activeElement===a){e.preventDefault();b.focus();}
      else if(!e.shiftKey&&document.activeElement===b){e.preventDefault();a.focus();}
    };
    document.addEventListener('keydown',onKey);
    return()=>{clearTimeout(timer);document.removeEventListener('keydown',onKey);restore.current?.focus?.();};
  },[open,onClose]);
  return ref;
}

export function Drawer({open=true,onClose,title,eyebrow='Details',subtitle,children,footer,labelledBy}){
  const generated=useId();
  const titleId=labelledBy||`drawer-title-${generated.replace(/:/g,'')}`;
  const ref=useDialogFocus(open,onClose);
  if(!open)return null;
  return <div className="px-drawer" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose?.()}>
    <section ref={ref} className="px-drawer-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="px-drawer-head">
        <div><div className="px-eyebrow">{eyebrow}</div><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>
        <button type="button" className="px-icon-button" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="px-drawer-body">{children}</div>
      {footer&&<div className="px-form-actions px-drawer-footer">{footer}</div>}
    </section>
  </div>;
}

export function ConfirmDialog({open,onClose,onConfirm,title='Confirm action',body,confirmLabel='Confirm',tone='danger',busy=false}){
  const ref=useDialogFocus(open,onClose);
  if(!open)return null;
  return <div className="px-dialog-scrim" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!busy&&onClose?.()}>
    <section ref={ref} className="px-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="px-confirm-title" aria-describedby="px-confirm-body">
      <h2 id="px-confirm-title">{title}</h2>
      {body&&<p id="px-confirm-body">{body}</p>}
      <div className="px-form-actions">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant={tone} onClick={onConfirm} disabled={busy}>{busy?'Working…':confirmLabel}</Button>
      </div>
    </section>
  </div>;
}

export function FormField({label,description,error,required=false,children,className=''}) {
  const generated=useId();
  const id=`field-${generated.replace(/:/g,'')}`;
  const describedBy=[description?`${id}-help`:null,error?`${id}-error`:null].filter(Boolean).join(' ')||undefined;
  const control=isValidElement(children)?cloneElement(children,{
    id:children.props.id||id,
    'aria-describedby':children.props['aria-describedby']||describedBy,
    'aria-invalid':error?true:children.props['aria-invalid'],
    required:children.props.required??required
  }):children;
  return <div className={`px-field ${className}`.trim()}>
    <label htmlFor={control?.props?.id||id}>{label}{required&&<span aria-hidden="true"> *</span>}</label>
    {control}
    {description&&<small id={`${id}-help`} className="px-field-help">{description}</small>}
    {error&&<small id={`${id}-error`} className="px-field-error" role="alert">{error}</small>}
  </div>;
}
