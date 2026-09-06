import {
  PERMISSIONS,
  SIZES,
  calculateCartTotals,
  calculateStockValue,
  canAccess,
  commitSaleToStore,
  getLowStockProducts,
  refundSaleInStore,
  totalProductStock
} from './core.js';

/* =========================================================
   Retail Clothing Store Management System
   Architectural proof of concept, Elaboration iteration 1
   Layers: presentation (render*), logic (services), data (db)
   ========================================================= */

/* ---------- DATA LAYER ---------- */
let db, ui;

function seed(){
  const p = (id,sku,name,cat,brand,price,cost,stock)=>({id,sku,name,cat,brand,price,cost,stock});
  db = {
    users:[
      {u:'nkosinathi', pin:'1234', name:'Shumba.D. Nkosinathi', first:'Nkosinathi', role:'owner'},
      {u:'vernon',     pin:'1234', name:'Vernon Longwani',      first:'Vernon',     role:'cashier'},
      {u:'emmanuel',   pin:'1234', name:'Emmanuel Banda',       first:'Emmanuel',   role:'inventory'}
    ],
    products:[
      p(1,'URB-1001','Oxford shirt, long sleeve','Men','Kaunda Tailors',480,300,{S:6,M:9,L:4,XL:2}),
      p(2,'URB-1002','Straight leg denim jeans','Men','Blue Ridge',750,470,{S:3,M:7,L:6,XL:5}),
      p(3,'URB-1003','Cotton crew neck tee','Men','Urban Basics',250,130,{S:14,M:18,L:11,XL:7}),
      p(4,'URB-2001','Chitenge wrap skirt','Women','Kabwata Prints',420,240,{S:5,M:8,L:6,XL:3}),
      p(5,'URB-2002','Fitted blouse, short sleeve','Women','Zani Couture',390,220,{S:2,M:4,L:2,XL:1}),
      p(6,'URB-2003','A line midi dress','Women','Zani Couture',890,550,{S:3,M:5,L:4,XL:2}),
      p(7,'URB-3001','School polo shirt','Kids','Urban Basics',190,95,{S:22,M:19,L:12,XL:0}),
      p(8,'URB-3002','Kids denim shorts','Kids','Blue Ridge',280,160,{S:9,M:6,L:1,XL:0}),
      p(9,'URB-4001','Quilted winter jacket','Outerwear','Blue Ridge',1250,820,{S:2,M:3,L:2,XL:1}),
      p(10,'URB-4002','Knitted pullover','Outerwear','Kaunda Tailors',660,400,{S:4,M:6,L:5,XL:3})
    ],
    sales:[],
    nextSale:1041,
    nextProduct:11
  };
  seedHistory();
}

/* prior week of trading, so reports and the chart have something to read */
function seedHistory(){
  const pattern=[[3,4],[5,2],[2,6],[6,3],[4,5],[7,4]];
  for(let d=6; d>=1; d--){
    const n = 2 + (d % 3);
    for(let s=0; s<n; s++){
      const items=[];
      const picks = pattern[(d+s)%pattern.length];
      picks.forEach(idx=>{
        const pr = db.products[(idx+s)%db.products.length];
        const size = SIZES[(d+s)%4];
        const qty = 1 + ((d+s)%2);
        items.push({sku:pr.sku,name:pr.name,size,qty,price:pr.price});
      });
      const when = new Date(); when.setDate(when.getDate()-d);
      when.setHours(9+((d+s)%8), (s*13)%60, 0, 0);
      commitSale(items, s%2 ? 'Mobile money' : 'Cash', 'Vernon Longwani', when, true);
    }
  }
}

/* ---------- LOGIC LAYER ---------- */
function findProduct(sku){ return db.products.find(p=>p.sku===sku); }
function stockOf(sku,size){ const p=findProduct(sku); return p?p.stock[size]:0; }
function totalStock(p){ return totalProductStock(p); }
function stockValue(){ return calculateStockValue(db.products); }
function lowStock(){ return getLowStockProducts(db.products); }
function cartTotals(lines){ return calculateCartTotals(lines); }

function commitSale(items, method, cashier, when, silent){
  const result = commitSaleToStore({
    products:db.products, sales:db.sales, nextSale:db.nextSale,
    items, method, cashier, when
  });
  if(!result.ok) return result;
  db.nextSale = result.nextSale;
  const sale = result.sale;
  if(!silent) toast('Sale '+sale.id+' recorded');
  return {ok:true, sale};
}

function refundSale(id){
  const result = refundSaleInStore({products:db.products, sales:db.sales, id});
  if(!result.ok) return;
  toast('Sale '+id+' refunded, stock returned');
}

function sameDay(iso,d){ const x=new Date(iso); return x.toDateString()===d.toDateString(); }
function activeSales(){ return db.sales.filter(s=>s.status==='completed'); }
function todaySales(){ const now=new Date(); return activeSales().filter(s=>sameDay(s.at,now)); }

function last7(){
  const out=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const tot=activeSales().filter(s=>sameDay(s.at,d)).reduce((t,s)=>t+s.total,0);
    out.push({d, total:tot, today:i===0});
  }
  return out;
}

function topSellers(){
  const map={};
  activeSales().forEach(s=>s.items.forEach(it=>{
    map[it.sku] = map[it.sku] || {name:it.name, units:0, revenue:0};
    map[it.sku].units += it.qty;
    map[it.sku].revenue += it.qty*it.price;
  }));
  return Object.values(map).sort((a,b)=>b.revenue-a.revenue);
}

function byCategory(){
  const map={};
  activeSales().forEach(s=>s.items.forEach(it=>{
    const p=findProduct(it.sku); const c=p?p.cat:'Other';
    map[c]=(map[c]||0)+it.qty*it.price;
  }));
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
}

function can(view){ return canAccess(ui.user.role,view); }

/* ---------- HELPERS ---------- */
const $ = s=>document.querySelector(s);
const money = n=>'K'+Math.round(n).toLocaleString('en-US');
const esc = s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dayName = d=>['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
const clock = iso=>new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
const dateShort = iso=>{const d=new Date(iso);return d.getDate()+' '+['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];};

let toastTimer;
function toast(msg){
  const t=$('#toast'); t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),2600);
}

/* ---------- PRESENTATION: SIGN IN ---------- */
document.querySelectorAll('.acct').forEach(b=>{
  b.onclick=()=>{ $('#u').value=b.dataset.u; $('#p').value=b.dataset.p; $('#p').focus(); };
});
$('#signin').onclick = attemptLogin;
$('#p').addEventListener('keydown', e=>{ if(e.key==='Enter') attemptLogin(); });
$('#u').addEventListener('keydown', e=>{ if(e.key==='Enter') $('#p').focus(); });

function attemptLogin(){
  const u=$('#u').value.trim().toLowerCase(), p=$('#p').value.trim();
  const found = db.users.find(x=>x.u===u && x.pin===p);
  if(!found){ $('#loginErr').style.display='block'; return; }
  $('#loginErr').style.display='none';
  ui = {user:found, view:'dash', cart:[], search:'', cat:'All', lastReceipt:null};
  $('#login').style.display='none';
  $('#app').style.display='flex';
  $('#userName').textContent=found.name;
  $('#roleTag').textContent={owner:'Owner',cashier:'Cashier',inventory:'Inventory'}[found.role];
  render();
}
$('#signout').onclick=()=>{
  $('#app').style.display='none'; $('#login').style.display='grid';
  $('#u').value=''; $('#p').value=''; ui=null;
};

/* ---------- PRESENTATION: SHELL ---------- */
const VIEWS = [
  ['dash','Dashboard'],['till','Point of sale'],['stock','Inventory'],
  ['reports','Reports'],['sales','Sales history'],['project','Project scope']
];

function render(){
  if(!can(ui.view)) ui.view = PERMISSIONS[ui.user.role][0];
  $('#nav').innerHTML = VIEWS.filter(v=>can(v[0]))
    .map(([id,label])=>`<button class="${ui.view===id?'on':''}" data-v="${id}">${label}</button>`).join('')
    + `<div class="nav-note">Proof of concept. Data is held in memory and resets when the page reloads.</div>`;
  $('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{ ui.view=b.dataset.v; render(); });
  ({dash:viewDash, till:viewTill, stock:viewStock, reports:viewReports, sales:viewSales, project:viewProject})[ui.view]();
}

/* ---------- VIEW: DASHBOARD ---------- */
function viewDash(){
  const t = todaySales();
  const revenue = t.reduce((a,s)=>a+s.total,0);
  const units = t.reduce((a,s)=>a+s.items.reduce((x,i)=>x+i.qty,0),0);
  const low = lowStock();
  const bars = last7();
  const peak = Math.max(...bars.map(b=>b.total),1);
  const recent = activeSales().slice(-6).reverse();

  $('#main').innerHTML = `
  <div class="view-head">
    <h2>Good day, ${esc(ui.user.first)}</h2>
    <p>${new Date().toLocaleDateString('en-GB',{weekday:'long', day:'numeric', month:'long', year:'numeric'})}</p>
  </div>
  <div class="strip">
    <div><div class="k">Takings today</div><div class="v num">${money(revenue)}</div></div>
    <div><div class="k">Items sold today</div><div class="v num">${units}</div></div>
    <div><div class="k">Lines running low</div><div class="v num ${low.length?'warn':''}">${low.length}</div></div>
    <div><div class="k">Stock at cost</div><div class="v num">${money(stockValue())}</div></div>
  </div>
  <div class="grid2">
    <div class="block">
      <h3>Takings, last seven days</h3>
      <div class="pad">
        <div class="chart">
          ${bars.map(b=>`
            <div class="bar" title="${money(b.total)}">
              <div class="amt num">${b.total ? (b.total>=10000 ? Math.round(b.total/1000)+'k' : (Math.round(b.total/100)/10)+'k') : ''}</div>
              <i class="${b.today?'today':''}" style="height:${Math.max(2,(b.total/peak)*100)}%"></i>
              <label>${dayName(b.d)}</label>
            </div>`).join('')}
        </div>
      </div>
    </div>
    <div class="block">
      <h3>Reorder before the weekend</h3>
      ${low.length ? `<table><tbody>${low.slice(0,6).map(p=>`
        <tr><td>${esc(p.name)}<div class="muted" style="font-size:12.5px">${p.sku}</div></td>
        <td class="r num">${totalStock(p)} left</td></tr>`).join('')}</tbody></table>`
      : `<div class="empty">Every line is above the reorder level.</div>`}
    </div>
  </div>
  <div class="block" style="margin-top:18px">
    <h3>Recent sales</h3>
    ${recent.length?`<table>
      <thead><tr><th>Sale</th><th>Time</th><th>Served by</th><th>Payment</th><th class="r">Total</th></tr></thead>
      <tbody>${recent.map(s=>`<tr>
        <td class="num">${s.id}</td><td class="num">${dateShort(s.at)}, ${clock(s.at)}</td>
        <td>${esc(s.cashier)}</td><td>${esc(s.method)}</td>
        <td class="r num">${money(s.total)}</td></tr>`).join('')}</tbody></table>`
      :`<div class="empty">No sales recorded yet.</div>`}
  </div>`;
}

/* ---------- VIEW: POINT OF SALE ---------- */
function viewTill(){
  const cats = ['All', ...new Set(db.products.map(p=>p.cat))];
  const q = ui.search.toLowerCase();
  const list = db.products.filter(p=>
    (ui.cat==='All'||p.cat===ui.cat) &&
    (p.name.toLowerCase().includes(q)||p.brand.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q))
  );
  const t = cartTotals(ui.cart);

  $('#main').innerHTML = `
  <div class="view-head"><h2>Point of sale</h2><p>Pick a size to add the item to the sale.</p></div>
  <div class="till">
    <div class="block">
      <div class="searchrow">
        <input type="text" id="q" placeholder="Search by name, brand or code" value="${esc(ui.search)}">
        <select id="cat">${cats.map(c=>`<option ${c===ui.cat?'selected':''}>${c}</option>`).join('')}</select>
      </div>
      ${list.length ? list.map(p=>`
        <div class="item">
          <div>
            <h4>${esc(p.name)}</h4>
            <div class="meta">${esc(p.brand)} &nbsp;/&nbsp; ${p.sku} &nbsp;/&nbsp; ${p.cat}</div>
            <div class="sizes">
              ${SIZES.map(s=>{
                const inCart = ui.cart.filter(l=>l.sku===p.sku&&l.size===s).reduce((a,l)=>a+l.qty,0);
                const left = p.stock[s]-inCart;
                return `<button class="size" data-sku="${p.sku}" data-size="${s}" ${left<=0?'disabled':''}>
                  <b>${s}</b><small>${left>0?left+' left':'none'}</small></button>`;
              }).join('')}
            </div>
          </div>
          <div class="price num">${money(p.price)}</div>
        </div>`).join('')
      : `<div class="empty">Nothing matches that search.</div>`}
    </div>

    <div class="block">
      <h3>Current sale</h3>
      <div class="pad">
        ${ui.cart.length ? ui.cart.map((l,i)=>`
          <div class="cart-line">
            <div>
              <div class="nm">${esc(l.name)}</div>
              <div class="sub">Size ${l.size} &nbsp;/&nbsp; ${money(l.price)} each</div>
              <div class="qty">
                <button data-dec="${i}" aria-label="Reduce quantity">-</button>
                <span class="num">${l.qty}</span>
                <button data-inc="${i}" aria-label="Increase quantity">+</button>
                <button class="rm" data-rm="${i}">Remove</button>
              </div>
            </div>
            <div class="num" style="font-weight:600">${money(l.price*l.qty)}</div>
          </div>`).join('')
        : `<div class="muted" style="padding:14px 0;font-size:13.5px">No items yet. The sale total updates as you add them.</div>`}

        <div class="totals">
          <div><span>Goods</span><span class="num">${money(t.net)}</span></div>
          <div><span>VAT at 16 percent</span><span class="num">${money(t.vat)}</span></div>
          <div class="grand"><span>Total</span><span class="num">${money(t.gross)}</span></div>
          <label class="field"><span>Payment method</span>
            <select id="method">
              <option>Cash</option><option>Mobile money</option><option>Card</option>
            </select></label>
          <button class="btn wide" id="pay" ${ui.cart.length?'':'disabled'}>Take payment</button>
          ${ui.cart.length?`<button class="btn quiet wide" id="clear" style="margin-top:8px">Cancel sale</button>`:''}
        </div>
      </div>
    </div>
  </div>
  ${ui.lastReceipt?receiptBlock(ui.lastReceipt):''}`;

  const qEl=$('#q');
  qEl.oninput=e=>{ ui.search=e.target.value; const pos=e.target.selectionStart; viewTill(); const n=$('#q'); n.focus(); n.setSelectionRange(pos,pos); };
  $('#cat').onchange=e=>{ ui.cat=e.target.value; viewTill(); };

  document.querySelectorAll('.size').forEach(b=>b.onclick=()=>{
    const {sku,size}=b.dataset, p=findProduct(sku);
    const line = ui.cart.find(l=>l.sku===sku&&l.size===size);
    if(line) line.qty++; else ui.cart.push({sku, name:p.name, size, qty:1, price:p.price});
    viewTill();
  });
  document.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{
    const l=ui.cart[b.dataset.inc];
    const inCart=ui.cart.filter(x=>x.sku===l.sku&&x.size===l.size).reduce((a,x)=>a+x.qty,0);
    if(stockOf(l.sku,l.size)-inCart<=0){ toast('That is all the stock on the shelf'); return; }
    l.qty++; viewTill();
  });
  document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{
    const l=ui.cart[b.dataset.dec]; l.qty--; if(l.qty<1) ui.cart.splice(b.dataset.dec,1); viewTill();
  });
  document.querySelectorAll('[data-rm]').forEach(b=>b.onclick=()=>{ ui.cart.splice(b.dataset.rm,1); viewTill(); });

  const clearBtn=$('#clear'); if(clearBtn) clearBtn.onclick=()=>{ ui.cart=[]; ui.lastReceipt=null; viewTill(); };
  $('#pay').onclick=()=>{
    const res = commitSale(ui.cart, $('#method').value, ui.user.name);
    if(!res.ok){ toast(res.msg); return; }
    ui.lastReceipt=res.sale; ui.cart=[]; viewTill();
    window.scrollTo({top:document.body.scrollHeight, behavior:'smooth'});
  };
}

function receiptBlock(s){
  const t = cartTotals(s.items);
  return `<div class="block" style="margin-top:18px;max-width:360px">
    <h3>Receipt ${s.id}</h3>
    <div class="pad receipt">
      <div class="rline"><span>Urban Clothing, Lusaka</span><span>${dateShort(s.at)}, ${clock(s.at)}</span></div>
      <div class="rline"><span>Served by ${esc(s.cashier)}</span><span>${esc(s.method)}</span></div>
      <hr>
      ${s.items.map(i=>`<div class="rline"><span>${i.qty} x ${esc(i.name)} (${i.size})</span><span class="num">${money(i.price*i.qty)}</span></div>`).join('')}
      <hr>
      <div class="rline"><span>Goods</span><span class="num">${money(t.net)}</span></div>
      <div class="rline"><span>VAT</span><span class="num">${money(t.vat)}</span></div>
      <div class="rline" style="font-weight:600;font-size:15px;margin-top:6px"><span>Total</span><span class="num">${money(t.gross)}</span></div>
      <hr>
      <div style="color:var(--ink-soft)">Stock levels updated. Returns accepted within 14 days with this receipt.</div>
    </div>
  </div>`;
}

/* ---------- VIEW: INVENTORY ---------- */
function viewStock(){
  const rows = db.products.map(p=>{
    const tot = totalStock(p);
    const tag = tot===0 ? '<span class="pill out">Out of stock</span>'
              : tot<=8 ? '<span class="pill low">Reorder</span>'
              : '<span class="pill ok">Healthy</span>';
    return `<tr>
      <td><div style="font-weight:500">${esc(p.name)}</div><div class="muted" style="font-size:12.5px">${p.sku} / ${esc(p.brand)}</div></td>
      <td>${p.cat}</td>
      ${SIZES.map(s=>`<td class="r num" style="${p.stock[s]<=2?'color:var(--clay)':''}">${p.stock[s]}</td>`).join('')}
      <td class="r num" style="font-weight:600">${tot}</td>
      <td class="r num">${money(p.price)}</td>
      <td>${tag}</td>
      <td class="r"><button class="btn quiet" data-restock="${p.sku}">Receive stock</button></td>
    </tr>`;
  }).join('');

  $('#main').innerHTML = `
  <div class="view-head"><h2>Inventory</h2><p>Stock is held per size. Anything at eight units or fewer is flagged for reorder.</p></div>
  <div class="block">
    <div class="inline-form">
      <label><span>Item name</span><input type="text" id="nName" placeholder="Linen shirt"></label>
      <label><span>Category</span><select id="nCat"><option>Men</option><option>Women</option><option>Kids</option><option>Outerwear</option></select></label>
      <label><span>Brand</span><input type="text" id="nBrand" placeholder="Zani Couture"></label>
      <label><span>Cost</span><input type="number" id="nCost" placeholder="240"></label>
      <label><span>Selling price</span><input type="number" id="nPrice" placeholder="420"></label>
      <label><span>Units per size</span><input type="number" id="nQty" placeholder="5"></label>
      <button class="btn" id="addProd">Add item</button>
    </div>
    <table>
      <thead><tr><th>Item</th><th>Category</th>${SIZES.map(s=>`<th class="r">${s}</th>`).join('')}<th class="r">Total</th><th class="r">Price</th><th>Status</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;

  document.querySelectorAll('[data-restock]').forEach(b=>b.onclick=()=>{
    const p=findProduct(b.dataset.restock);
    const size=prompt('Which size are you receiving? S, M, L or XL','M');
    if(!size||!SIZES.includes(size.toUpperCase())) return;
    const n=parseInt(prompt('How many units?','10'),10);
    if(!n||n<1) return;
    p.stock[size.toUpperCase()]+=n;
    toast(n+' units of '+p.name+' received');
    viewStock();
  });

  $('#addProd').onclick=()=>{
    const name=$('#nName').value.trim(), brand=$('#nBrand').value.trim()||'Unbranded';
    const cost=+$('#nCost').value, price=+$('#nPrice').value, qty=+$('#nQty').value;
    if(!name||!price){ toast('Enter at least a name and a selling price'); return; }
    const id=db.nextProduct++;
    const stock={}; SIZES.forEach(s=>stock[s]=qty||0);
    db.products.push({id, sku:'URB-'+(9000+id), name, cat:$('#nCat').value, brand, price, cost:cost||Math.round(price*0.6), stock});
    toast(name+' added to the catalogue');
    viewStock();
  };
}

/* ---------- VIEW: REPORTS ---------- */
function viewReports(){
  const sales=activeSales();
  const revenue=sales.reduce((a,s)=>a+s.total,0);
  const units=sales.reduce((a,s)=>a+s.items.reduce((x,i)=>x+i.qty,0),0);
  const refunded=db.sales.filter(s=>s.status==='refunded');
  const refundVal=refunded.reduce((a,s)=>a+s.total,0);
  const top=topSellers().slice(0,6);
  const cats=byCategory();
  const catPeak=Math.max(...cats.map(c=>c[1]),1);

  $('#main').innerHTML=`
  <div class="view-head">
    <h2>Reports</h2>
    <p>Every completed sale since the system went live. Refunded sales are excluded from revenue.</p>
  </div>
  <div class="strip">
    <div><div class="k">Revenue</div><div class="v num">${money(revenue)}</div></div>
    <div><div class="k">Transactions</div><div class="v num">${sales.length}</div></div>
    <div><div class="k">Units sold</div><div class="v num">${units}</div></div>
    <div><div class="k">Refunded</div><div class="v num ${refundVal?'warn':''}">${money(refundVal)}</div></div>
  </div>
  <div class="grid2">
    <div class="block">
      <h3>Best selling lines</h3>
      <table>
        <thead><tr><th>Item</th><th class="r">Units</th><th class="r">Revenue</th></tr></thead>
        <tbody>${top.map(t=>`<tr><td>${esc(t.name)}</td><td class="r num">${t.units}</td><td class="r num">${money(t.revenue)}</td></tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="block">
      <h3>Revenue by category</h3>
      <div class="pad">
        ${cats.map(([c,v])=>`
          <div style="margin-bottom:12px">
            <div style="display:flex;justify-content:space-between;font-size:13.5px;margin-bottom:4px">
              <span>${c}</span><span class="num">${money(v)}</span></div>
            <div style="height:8px;background:#EDEFF2;border-radius:2px">
              <div style="height:8px;width:${(v/catPeak)*100}%;background:var(--denim);border-radius:2px"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>
  </div>
  <div style="margin-top:16px"><button class="btn ghost" id="csv">Download sales as CSV</button></div>`;

  $('#csv').onclick=()=>{
    const rows=[['Sale','Date','Cashier','Payment','Item','Size','Qty','Unit price','Line total','Status']];
    db.sales.forEach(s=>s.items.forEach(i=>rows.push([
      s.id, new Date(s.at).toLocaleString('en-GB'), s.cashier, s.method,
      i.name, i.size, i.qty, i.price, i.qty*i.price, s.status
    ])));
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download='urban-clothing-sales.csv'; a.click(); URL.revokeObjectURL(a.href);
    toast('Sales report downloaded');
  };
}

/* ---------- VIEW: SALES HISTORY ---------- */
function viewSales(){
  const list=[...db.sales].reverse();
  const canRefund = ui.user.role==='owner';
  $('#main').innerHTML=`
  <div class="view-head">
    <h2>Sales history</h2>
    <p>${canRefund?'Refunding a sale returns every item to stock and removes it from revenue.':'Only the store owner can process a refund.'}</p>
  </div>
  <div class="block">
    <table>
      <thead><tr><th>Sale</th><th>Date</th><th>Items</th><th>Served by</th><th>Payment</th><th class="r">Total</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(s=>`<tr>
        <td class="num">${s.id}</td>
        <td class="num">${dateShort(s.at)}, ${clock(s.at)}</td>
        <td>${s.items.map(i=>esc(i.name)+' ('+i.size+' x'+i.qty+')').join('<br>')}</td>
        <td>${esc(s.cashier)}</td>
        <td>${esc(s.method)}</td>
        <td class="r num">${money(s.total)}</td>
        <td>${s.status==='refunded'?'<span class="pill void">Refunded</span>':'<span class="pill ok">Completed</span>'}</td>
        <td class="r">${(canRefund && s.status==='completed')?`<button class="btn danger" data-refund="${s.id}">Refund</button>`:''}</td>
      </tr>`).join('')}</tbody>
    </table>
  </div>`;
  document.querySelectorAll('[data-refund]').forEach(b=>b.onclick=()=>{
    if(!confirm('Refund sale '+b.dataset.refund+' and return the items to stock?')) return;
    refundSale(b.dataset.refund); viewSales();
  });
}

/* ---------- VIEW: PROJECT SCOPE ---------- */
function viewProject(){
  const built=[
    ['UC-01','User authentication with role based access','Built'],
    ['UC-02','Manage products and catalogue','Built'],
    ['UC-03','Process sales at the till','Built'],
    ['UC-04','Manage inventory and receive stock','Built'],
    ['UC-05','Generate sales reports','Built'],
    ['UC-06','Handle returns and refunds','Built'],
    ['UC-07','Customer accounts and online browsing','Iteration 2'],
    ['UC-08','Online payment gateway','Iteration 3'],
    ['UC-09','Order tracking','Iteration 3'],
    ['UC-10','Supplier purchase orders','Iteration 3']
  ];
  $('#main').innerHTML=`
  <div class="view-head">
    <h2>Project scope</h2>
    <p>Retail Clothing Store Management System, Unified Process, Elaboration iteration 1.</p>
  </div>
  <div class="grid2">
    <div class="block">
      <h3>Use cases</h3>
      ${built.map(([id,name,st])=>`<div class="usecase">
        <span class="id">${id}</span><span class="nm">${name}</span>
        <span class="pill ${st==='Built'?'ok':'out'}">${st}</span></div>`).join('')}
    </div>
    <div>
      <div class="block">
        <h3>Architecture proved by this prototype</h3>
        <div class="layer"><b>Presentation</b><span>Role aware navigation, till screen, inventory grid, reporting views.</span></div>
        <div class="layer"><b>Business logic</b><span>Sale commit with stock validation, VAT split, refund reversal, reorder thresholds, permission checks.</span></div>
        <div class="layer"><b>Data</b><span>In memory store standing in for the relational schema. Products, variants, sales, sale lines, users.</span></div>
      </div>
      <div class="block" style="margin-top:18px">
        <h3>Risks this prototype retires</h3>
        <div class="layer"><b>Stock accuracy</b><span>Sales and refunds move stock in one place, so the count cannot drift.</span></div>
        <div class="layer"><b>Role separation</b><span>The cashier account cannot reach inventory or refunds. Try signing in as vernon.</span></div>
        <div class="layer"><b>Reporting delay</b><span>Reports read live sale records rather than a nightly export.</span></div>
      </div>
    </div>
  </div>`;
}

/* ---------- BOOT ---------- */
seed();
$('#u').focus();
