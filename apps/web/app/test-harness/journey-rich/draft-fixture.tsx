"use client";
import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {registerDraftWriter} from '@/components/portal/draft-navigation';
import {DirtyForm} from '@/components/ui/dirty-form';
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs';
import {GlobalCommandPalette} from '@/components/shell/global-command-palette';

/** Existing APP_ENV=test route only. Exercises navigation without any domain/provider adapter. */
export function DraftNavigationFixture({editor}:{editor:boolean}) {
  return <section><GlobalCommandPalette nav={[{href:'/test-harness/journey-rich?count=0&draft=start',label:'Conceptfixture start',icon:'home'}]}/><Link href={`/test-harness/journey-rich?count=0&draft=${editor?'start':'editor'}`}>{editor?'Terug naar fixturestart':'Open conceptfixture'}</Link>{editor?<Tabs defaultValue="editor"><TabsList><TabsTrigger value="editor">Concept</TabsTrigger><TabsTrigger value="other">Andere tab</TabsTrigger></TabsList><TabsContent value="editor"><Editor/><ManualDraft/></TabsContent><TabsContent value="other">Andere inhoud</TabsContent></Tabs>:<p>Conceptfixture start</p>}</section>;
}
function Editor() {
  const [text,setText]=useState(''),[fail,setFail]=useState(true),[status,setStatus]=useState('Leeg');
  const latest=useRef(text),stored=useRef(''),failure=useRef(fail);latest.current=text;failure.current=fail;
  useEffect(()=>registerDraftWriter(async()=>{
    if(failure.current){setStatus('Opslag mislukt; invoer blijft staan');return false;}
    stored.current=latest.current;setStatus('Fixture opgeslagen');return true;
  },()=>latest.current!==stored.current),[]);
  return <div><label>Fictief concept<input value={text} onChange={event=>setText(event.target.value)}/></label><label><input type="checkbox" checked={fail} onChange={event=>setFail(event.target.checked)}/>Simuleer opslagfout</label><p role="status">{status}</p></div>;
}

function ManualDraft() {
 const [failed,setFailed]=useState(false);
 return <DirtyForm onSubmit={event=>{event.preventDefault();setFailed(true);}}>
  <label>Fictief handmatig formulier<input name="manualFixture"/></label>
  <button type="submit">Simuleer mislukte inzending</button>
  {failed?<p role="alert">Fictieve inzending mislukt</p>:null}
 </DirtyForm>;
}
