import type {Crop} from './alignment-export';
import type {Pair,Matrix} from './alignment';
export type AlignmentDraft={version:1;crop?:Crop;opacity?:number;a:Blob;b:Blob;names:[string,string];pairs:Pair[];h:Matrix;local:boolean};
async function db(){return new Promise<IDBDatabase>((resolve,reject)=>{const request=indexedDB.open('zeitblick-alignment',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
export async function saveDraft(draft:AlignmentDraft){const database=await db();try{await new Promise<void>((resolve,reject)=>{const tx=database.transaction('drafts','readwrite');tx.objectStore('drafts').put(draft,'latest');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});}finally{database.close();}}
export async function loadDraft(){const database=await db();try{return await new Promise<AlignmentDraft|undefined>((resolve,reject)=>{const request=database.transaction('drafts').objectStore('drafts').get('latest');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}finally{database.close();}}
