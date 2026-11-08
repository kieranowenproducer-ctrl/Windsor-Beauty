'use client';

import { useEffect, useRef, useState } from 'react';
import { addressFromName, validProductAddress, RESERVED_PRODUCT_ADDRESSES } from '@/lib/productAddress';

type Row = {slug:string;name:string;address:string};

function AddressRow({row, disabled, onSaved}: {row:Row;disabled:boolean;onSaved:(row:Row)=>void}) {
  const [address,setAddress] = useState(row.address);
  const [saving,setSaving] = useState(false);
  const [message,setMessage] = useState('');
  const current = useRef(row);
  current.current = row;
  async function save() {
    if (saving || disabled) return;
    const proposed=address;
    const expected=row.address;
    setSaving(true); setMessage('');
    try {
      const response=await fetch('/api/admin/products/web-addresses', {method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({slug:row.slug,address:proposed,expectedAddress:expected})});
      const data=await response.json();
      if (!response.ok || !data.success) {setMessage(data.error || 'Could not save. Your entry is kept.');return;}
      setMessage('Saved. Previous links still work.');
      onSaved({...current.current,address:data.to});
    } catch {setMessage('Could not save. Your entry is kept.');}
    finally {setSaving(false);}
  }
  const valid=validProductAddress(address) && !RESERVED_PRODUCT_ADDRESSES.includes(address);
  return <li className="rounded-xl border border-stone-200 bg-white p-4">
    <p className="mb-2 text-sm font-semibold text-stone-800">{row.name}</p>
    <label className="block text-xs text-stone-600" htmlFor={`product-address-${row.slug}`}>Product link after /shop/</label>
    <input id={`product-address-${row.slug}`} type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false}
      value={address} disabled={saving || disabled} onChange={event=>{setAddress(event.target.value);setMessage('');}}
      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800"
      aria-describedby={`product-address-status-${row.slug}`} />
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <button type="button" disabled={saving || disabled} onClick={()=>{setAddress(addressFromName(row.name));setMessage('Review the suggested link, then save.');}}
        className="text-xs font-medium text-gold-700 underline underline-offset-4 disabled:opacity-50">Use product name</button>
      <button type="button" onClick={()=>void save()} disabled={saving || disabled || !valid || address===row.address}
        className="rounded-full bg-gold-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{saving?'Saving...':'Save link'}</button>
    </div>
    <p id={`product-address-status-${row.slug}`} role="status" className="mt-2 text-xs text-stone-600">{message || (!valid?'Use lowercase letters, numbers and single hyphens.':'Changes only the link. Product, price and stock stay the same.')}</p>
  </li>;
}

export default function ProductWebAddresses({onSaved}:{onSaved:()=>void}) {
  const [open,setOpen]=useState(false);
  const [rows,setRows]=useState<Row[]>([]);
  const [ready,setReady]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  useEffect(()=>{
    if (!open) return;
    let active=true;
    setLoading(true);setError('');
    fetch('/api/admin/products/web-addresses',{cache:'no-store'}).then(async response=>{
      const data=await response.json();
      if(!response.ok)throw Error(data.error||'Could not load product links.');
      if(active){setRows(data.products);setReady(data.ready===true);}
    }).catch(err=>{if(active)setError(err instanceof Error?err.message:'Could not load product links.');})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[open]);
  return <section className="mb-5 rounded-2xl border border-stone-200 bg-white p-4">
    <button type="button" aria-expanded={open} aria-controls="product-web-addresses" onClick={()=>setOpen(value=>!value)}
      className="text-sm font-semibold text-stone-800">{open?'Close product links':'Manage product links'}</button>
    {open && <div id="product-web-addresses" className="mt-3">
      <p className="mb-3 text-xs text-stone-600">Choose a product link. Previous links keep working. Each change needs Save link.</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
      {loading ? <p role="status" className="text-sm text-stone-600">Loading product links...</p> : <>
        {!ready && !error && <p className="mb-3 text-sm text-stone-600">Product link editing is not installed yet.</p>}
        <label htmlFor="product-links-search" className="text-xs text-stone-600">Find a product</label>
        <input id="product-links-search" value={search} onChange={event=>setSearch(event.target.value)} type="search"
          className="mb-4 mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800" />
        <ul className="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2">
          {rows.filter(row=>`${row.name} ${row.address}`.toLowerCase().includes(search.toLowerCase())).map(row=>
            <AddressRow key={row.slug} row={row} disabled={!ready || Boolean(error)} onSaved={updated=>{setRows(previous=>previous.map(item=>item.slug===updated.slug?updated:item));onSaved();}} />)}
        </ul>
      </>}
    </div>}
  </section>;
}
