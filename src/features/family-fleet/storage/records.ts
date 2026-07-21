import type { FamilyMember } from '../../../hooks/useFamilyMembers'
export type FamilyFleetRecordMap = Record<string, number>
interface Stored { version:1; familyId:string; scores:FamilyFleetRecordMap; updatedAt:string }
const PREFIX='rodinka.family-fleet.records.v1.'
function storage(){try{return window.localStorage}catch{return null}}
function clean(v:unknown){const out:FamilyFleetRecordMap={}; if(v&&typeof v==='object') for(const [k,s] of Object.entries(v as Record<string,unknown>)){const n=Math.floor(Number(s)); if(k&&Number.isFinite(n)&&n>=0) out[k]=n} return out}
export function loadFamilyFleetRecords(familyId:string, s:Storage|null=storage()){if(!s)return {}; try{const raw=s.getItem(PREFIX+familyId); if(!raw)return {}; const parsed=JSON.parse(raw) as Partial<Stored>; return clean(parsed.scores)}catch{return {}}}
export function mergeFamilyFleetRecords(...sources:FamilyFleetRecordMap[]){const m:FamilyFleetRecordMap={}; for(const src of sources) for(const [id,score] of Object.entries(src)) m[id]=Math.max(m[id]??0,Math.floor(score)); return m}
export function saveFamilyFleetRecords(familyId:string, scores:FamilyFleetRecordMap, s:Storage|null=storage()){const next=mergeFamilyFleetRecords(loadFamilyFleetRecords(familyId,s), scores); if(s) s.setItem(PREFIX+familyId, JSON.stringify({version:1,familyId,scores:next,updatedAt:new Date().toISOString()} satisfies Stored)); return next}
export function saveFamilyFleetBestScore(familyId:string, memberId:string, score:number, s:Storage|null=storage()){return saveFamilyFleetRecords(familyId,{[memberId]:Math.max(0,Math.floor(score))},s)}
export function sortFamilyFleetLeaderboard(members:readonly FamilyMember[], scores:FamilyFleetRecordMap){return members.map(m=>({member:m,score:scores[m.id]??0})).sort((a,b)=>b.score-a.score)}
