"use client";
import { useEffect,useRef,useState } from "react";
import { useCartStore } from "@/lib/stores/cart-store";
import type { CartLine } from "@/lib/rebohrome-data";
export function CartSync({userId}:{userId:string|null}){
 const hydrated=useCartStore(s=>s.hydrated),lines=useCartStore(s=>s.lines),replace=useCartStore(s=>s.replaceLines);
 const [ready,setReady]=useState(false),[readyUser,setReadyUser]=useState<string|null|undefined>(undefined),[error,setError]=useState('');
 const version=useRef(0),last=useRef(''),busy=useRef(false),currentUser=useRef(userId);
 currentUser.current=userId;
 useEffect(()=>{if(!hydrated)return;setReady(false);setError('');let canceled=false;
  async function init(){
   const localKey=`rebohrome-cart:${userId||'guest'}`;
   let cached:CartLine[]=[];try{cached=JSON.parse(localStorage.getItem(localKey)||'[]');}catch{}
   if(!userId){replace(cached);last.current=JSON.stringify(cached);setReadyUser(userId);setReady(true);return;}
   try{const response=await fetch('/api/cart',{cache:'no-store'});if(!response.ok)throw new Error();const body=await response.json();if(canceled)return;
     version.current=body.version;last.current=JSON.stringify(body.items);replace(body.items);setReadyUser(userId);setReady(true);
   }catch{if(!canceled){replace([]);setError('Could not load your cart. Reload the page to retry.');}}
  }void init();return()=>{canceled=true;};
 },[hydrated,userId,replace]);
 useEffect(()=>{if(!ready||readyUser!==userId)return;localStorage.setItem(`rebohrome-cart:${userId||'guest'}`,JSON.stringify(lines));
  if(!userId||last.current===JSON.stringify(lines))return;
  const timeout=setTimeout(async()=>{
    if(busy.current)return;busy.current=true;
    try{while(currentUser.current===userId){const items=useCartStore.getState().lines,serialized=JSON.stringify(items);if(last.current===serialized)break;
      const response=await fetch('/api/cart',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({items,version:version.current})});
      if(currentUser.current!==userId)break;
      if(response.status===409){const fresh=await fetch('/api/cart',{cache:'no-store'});if(!fresh.ok)throw new Error();const body=await fresh.json();version.current=body.version;last.current=JSON.stringify(body.items);replace(body.items);setError('Cart updated from another tab. Please review it before checkout.');break;}
      if(!response.ok)throw new Error();const body=await response.json();version.current=body.version;last.current=serialized;
    }}catch{setError('Your cart could not be saved. Reload before checkout.');}finally{busy.current=false;}
  },250);return()=>clearTimeout(timeout);
 },[ready,readyUser,lines,userId,replace]);
 return error?<div role="alert" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-950">{error}</div>:null;
}
