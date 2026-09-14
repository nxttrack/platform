"use client";

import { useEffect } from "react";
import { flushDraftWriters,hasPendingDraftWrites } from "./draft-navigation";

type Entry={scope:string;index:number};
const key='__nxttrackDraftHistory';
function entry(state:unknown):Entry|null {
  if(!state || typeof state!=='object' || !(key in state)) return null;
  const value=(state as Record<string,unknown>)[key] as Partial<Entry>|null;
  return value && typeof value.scope==='string' && Number.isSafeInteger(value.index)?value as Entry:null;
}

/** Track only opaque history positions; no form content or router tree is stored here. */
export function DraftHistoryBoundary() {
  useEffect(()=>{
    const history=window.history,previous=entry(history.state),scope=previous?.scope??crypto.randomUUID();
    let index=previous?.index??0,alive=true;
    let blocked:{origin:number;target:number;flushing:boolean}|null=null;
    const originalPush=history.pushState,originalReplace=history.replaceState;
    const tagged=(data:unknown,next:number)=>data===null || data===undefined || (typeof data==='object' && !Array.isArray(data))
      ? {...data as Record<string,unknown>,[key]:{scope,index:next}}:data;
    const push:History['pushState']=function(data,title,url) {
      if(!alive) return originalPush.call(history,data,title,url);
      originalPush.call(history,tagged(data,index+1),title,url);index+=1;
    };
    const replace:History['replaceState']=function(data,title,url) {
      return originalReplace.call(history,alive?tagged(data,index):data,title,url);
    };
    history.pushState=push;history.replaceState=replace;
    originalReplace.call(history,tagged(history.state,index),'');
    const pop=(event:PopStateEvent)=>{
      const target=entry(event.state);
      // Cross-document/unowned entries retain native beforeunload handling. Hash-only
      // entries with the same index do not remove the editor context.
      if(!target || target.scope!==scope) return;
      if(blocked) {
        event.stopImmediatePropagation();
        if(target.index!==blocked.origin) {history.go(blocked.origin-target.index);return;}
        if(blocked.flushing) return;
        const attempt=blocked;attempt.flushing=true;
        // The original entry and URL are restored before sending the authenticated action.
        // Next never receives the cancelled pop, so the editors stay mounted on failure.
        void flushDraftWriters().then(saved=>{
          if(!alive || blocked!==attempt) return;
          blocked=null;
          if(saved && !hasPendingDraftWrites()) history.go(attempt.target-attempt.origin);
        });
        return;
      }
      if(target.index!==index && hasPendingDraftWrites()) {
        event.stopImmediatePropagation();blocked={origin:index,target:target.index,flushing:false};
        history.go(index-target.index);return;
      }
      index=target.index;
    };
    window.addEventListener('popstate',pop,true);
    return ()=>{
      alive=false;blocked=null;window.removeEventListener('popstate',pop,true);
      // Preserve another owner's outer wrapper; a captured inner wrapper becomes a no-op.
      if(history.pushState===push) history.pushState=originalPush;
      if(history.replaceState===replace) history.replaceState=originalReplace;
    };
  },[]);
  return null;
}
