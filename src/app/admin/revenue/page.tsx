'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { formatMoney } from '@/lib/money';
import { describeRange, isBackwards, rangeForPreset, rangeFromQuery, rangeToQuery, type DateRange, type RangePreset } from '@/lib/revenueRange';

interface RevenueReport {
  count: number; total: number; accountingCount: number; nextCursor: string | null;
  months: {month: string; revenue: number}[];
  orders: {orderNumber: string; customerName: string; paidAt: string; received: number; status: string}[];
}
const presets: {key: RangePreset; label: string}[] = [
  {key:'all',label:'All time'},{key:'this_month',label:'This month'},
  {key:'last_month',label:'Last month'},{key:'last_30',label:'Last 30 days'},{key:'this_year',label:'This year'},
];
const control = 'rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-700 disabled:opacity-50';
const money = (amount: number) => `£${formatMoney(amount)}`;
function ukToday() {
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(new Date());
  const value = (kind: string) => Number(parts.find(part=>part.type===kind)?.value);
  return new Date(value('year'),value('month')-1,value('day'));
}
function MonthlyChart({months}: {months: RevenueReport['months']}) {
  if (!months.length) return <p className="text-xs text-stone-500">No confirmed payments in this period.</p>;
  const peak=Math.max(1,...months.map(month=>Math.abs(month.revenue)));
  // A native scroll area keeps every month available without shrinking labels.
  return <div className="overflow-x-auto" tabIndex={0} aria-label="Revenue by UK month">
    <div className="flex min-h-48 items-end gap-4 pb-2" style={{minWidth:Math.max(240,months.length*90)}}>
      {months.map(month=><div key={month.month} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center">
        <span className="text-xs text-stone-700">{money(month.revenue)}</span>
        <div aria-hidden="true" className="w-10 rounded-t bg-gold-700" style={{height:Math.max(2,140*Math.abs(month.revenue)/peak)}} />
        <span className="text-xs text-stone-600">{month.month}</span>
      </div>)}
    </div>
  </div>;
}

export default function AdminRevenuePage() {
  const [range,setRange]=useState<DateRange>({from:'',to:''});
  const [ready,setReady]=useState(false);
  const [report,setReport]=useState<RevenueReport|null>(null);
  const [loading,setLoading]=useState(false), [moreLoading,setMoreLoading]=useState(false);
  const [error,setError]=useState('');
  const generation=useRef(0), moreBusy=useRef(false);
  const backwards=isBackwards(range);
  useEffect(()=>{setRange(rangeFromQuery(window.location.search,ukToday()));setReady(true);},[]);
  useEffect(()=>{
    if(!ready) return;
    const serial=++generation.current, abort=new AbortController();
    moreBusy.current=false;setMoreLoading(false);setReport(null);setError('');
    window.history.replaceState(null,'',window.location.pathname+rangeToQuery(range));
    if(backwards){setLoading(false);return;}
    setLoading(true);
    fetch('/api/admin/revenue'+rangeToQuery(range),{signal:abort.signal,cache:'no-store'})
      .then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load revenue.');return data;})
      .then(data=>{if(generation.current===serial)setReport(data);})
      .catch(err=>{if(!abort.signal.aborted&&generation.current===serial)setError(err.message||'Could not load revenue.');})
      .finally(()=>{if(generation.current===serial)setLoading(false);});
    return()=>abort.abort();
  },[range,ready,backwards]);
  async function loadMore() {
    if(!report?.nextCursor || moreBusy.current)return;
    const serial=generation.current;moreBusy.current=true;setMoreLoading(true);setError('');
    const params=new URLSearchParams(rangeToQuery(range));params.set('cursor',report.nextCursor);
    try {
      const response=await fetch('/api/admin/revenue?'+params.toString(),{cache:'no-store'});
      const data=await response.json();if(!response.ok)throw new Error(data.error||'Could not load more orders.');
      if(serial===generation.current)setReport(current=>current?{...data,orders:Array.from(new Map([...current.orders,...data.orders].map(order=>[order.orderNumber,order])).values())}:null);
    }catch(err){if(serial===generation.current)setError(err instanceof Error?err.message:'Could not load more orders.');}
    finally{if(serial===generation.current){moreBusy.current=false;setMoreLoading(false);}}
  }
  const unavailable=loading||backwards||!report||report.accountingCount===0;
  return <div className="h-full bg-stone-50 flex flex-col lg:flex-row overflow-clip">
    <AdminSidebar />
    <main className="flex-1 min-w-0 p-4 sm:p-8">
      <div className="max-w-5xl space-y-6">
        <Link href="/admin/dashboard" className={control}>Back to dashboard</Link>
        <div><h1 className="text-lg font-semibold text-stone-800">Revenue</h1>
          <p className="mt-1 text-xs text-stone-600">Confirmed payments by UK payment date. Includes delivery; excludes the separately charged PayPal fee and cancelled or refunded orders.</p>
          <p className="mt-2 text-xs text-stone-600">{describeRange(range)}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 space-y-4">
          <div className="flex flex-wrap gap-2">{presets.map(preset=><button key={preset.key} type="button" className={control} onClick={()=>setRange(rangeForPreset(preset.key,ukToday()))}>{preset.label}</button>)}</div>
          <div className="flex flex-wrap gap-4">{(['from','to'] as const).map(key=><label key={key} className="text-xs text-stone-700"><span className="mb-1 block">{key==='from'?'From':'To'} (UK date)</span><input type="date" className={control} value={range[key]} onChange={event=>setRange(current=>({...current,[key]:event.target.value}))}/></label>)}</div>
          {backwards&&<p role="alert" className="text-xs text-red-700">Choose a To date on or after the From date.</p>}
        </div>
        {error&&<p role="alert" className="text-xs text-red-700">{error} <button type="button" className={control} onClick={()=>setRange({...range})}>Try again</button></p>}
        <div className="grid gap-4 sm:grid-cols-3">{[
          {label:'Revenue',value:money(report?.total??0)},
          {label:'Paid orders',value:String(report?.count??0)},
          {label:'Average order',value:money(report?.count?report.total/report.count:0)},
        ].map(tile=><div key={tile.label} className="rounded-xl border border-stone-200 bg-white p-5"><p className="text-xs text-stone-600">{tile.label}</p><p className="mt-2 text-2xl text-stone-800">{loading||!report?'...':tile.value}</p></div>)}</div>
        <section className="rounded-xl border border-stone-200 bg-white p-5" aria-label="Monthly revenue"><h2 className="mb-4 text-sm font-semibold text-stone-800">Revenue by month</h2>{loading?<p className="text-xs">Loading...</p>:report&&<MonthlyChart months={report.months}/>}</section>
        <div className="rounded-xl border border-stone-200 bg-white p-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-stone-600">Accounting export uses its existing confirmed-payment rules. Unverified costs and refunds stay blank.</p><a href={'/api/admin/accounting-export'+rangeToQuery(range)} aria-disabled={unavailable||undefined} tabIndex={unavailable?-1:undefined} onClick={event=>{if(unavailable)event.preventDefault();}} className={control+' '+(unavailable?'opacity-50':'')}>Download Accounting CSV</a></div>
        <section className="rounded-xl border border-stone-200 bg-white p-4"><h2 className="mb-3 text-sm font-semibold text-stone-800">Paid orders</h2><p className="mb-3 text-xs text-stone-600">Showing {report?.orders.length??0} of {report?.count??0}. Totals above cover the full chosen period.</p><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{['Order','Paid on (UK)','Customer','Revenue','Status'].map(label=><th key={label} className="p-3 font-medium text-stone-600">{label}</th>)}</tr></thead><tbody>{report?.orders.map(order=><tr key={order.orderNumber} className="border-t border-stone-200"><td className="p-3"><Link href={'/admin/orders?search='+encodeURIComponent(order.orderNumber)} className="underline">{order.orderNumber}</Link></td><td className="p-3 whitespace-nowrap">{new Date(order.paidAt).toLocaleDateString('en-GB',{timeZone:'Europe/London',day:'numeric',month:'short',year:'numeric'})}</td><td className="p-3">{order.customerName}</td><td className="p-3">{money(order.received)}</td><td className="p-3">{order.status.replaceAll('_',' ')}</td></tr>)}</tbody></table></div>{!loading&&report?.count===0&&<p className="p-3 text-xs text-stone-600">No confirmed payments in this period.</p>}{report?.nextCursor&&<button type="button" onClick={loadMore} disabled={moreLoading} className={control+' mt-4'}>{moreLoading?'Loading...':'Load more orders'}</button>}</section>
      </div>
    </main>
  </div>;
}
