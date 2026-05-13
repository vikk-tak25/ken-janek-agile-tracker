const api = (path, opts={}) => fetch(path, opts).then(r=>r.ok? r.json().catch(()=>null) : r.json().then(e=>{throw e}));

const buildCard = (s) => {
  const el = document.createElement('div');
  el.className = 'card';
  el.draggable = true;
  el.dataset.id = s.id;
  el.innerHTML = `<strong>${s.title}</strong><div class="meta">${s.points} pts • ${s.status}</div><div class="acceptance">${s.acceptanceCriteria.map(a=>'<div>- '+a+'</div>').join('')}</div><div class="comments">${s.comments.map(c=>'<div style="font-size:12px;color:#666">'+c.text+' <span style="font-size:10px;color:#999">'+c.createdAt+'</span></div>').join('')}</div><div><input placeholder="Lisa kommentaar" class="commentInput" style="width:80%" /><button class="commentBtn">OK</button> <button class="delBtn">Kustuta</button></div>`;
  // drag handlers
  el.addEventListener('dragstart', (e)=>{ e.dataTransfer.setData('text/plain', s.id); });
  // comment
  el.querySelector('.commentBtn').addEventListener('click', async ()=>{
    const input = el.querySelector('.commentInput');
    const text = input.value.trim();
    if(!text) return alert('Kommentaar ei tohi olla tühi');
    try{
      await api('/api/stories/'+s.id+'/comments', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ text }) });
      load();
    }catch(err){ alert(err.error||'Viga'); }
  });
  el.querySelector('.delBtn').addEventListener('click', async ()=>{
    if(!confirm('Kustutada story?')) return;
    await fetch('/api/stories/'+s.id, { method:'DELETE' });
    load();
  });
  return el;
}

async function load(){
  const stories = await api('/api/stories');
  const todo = document.getElementById('todoList');
  const doing = document.getElementById('doingList');
  const done = document.getElementById('doneList');
  todo.innerHTML=''; doing.innerHTML=''; done.innerHTML='';
  stories.forEach(s=>{
    const el = buildCard(s);
    if(s.status==='todo') todo.appendChild(el);
    if(s.status==='doing') doing.appendChild(el);
    if(s.status==='done') done.appendChild(el);
  });
}

document.querySelectorAll('.col').forEach(col=>{
  col.addEventListener('dragover', e=>{ e.preventDefault(); });
  col.addEventListener('drop', async e=>{
    e.preventDefault();
    const id = Number(e.dataTransfer.getData('text/plain'));
    const status = col.dataset.status;
    // update status
    await fetch('/api/stories/'+id+'/status', { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({ status }) });
    // if dropped into todo, also reorder: send new order
    if(status==='todo'){
      const ids = Array.from(document.querySelectorAll('#todoList .card')).map(c=>Number(c.dataset.id));
      // include the moved card if not present
      if(!ids.includes(id)) ids.unshift(id);
      await fetch('/api/stories/reorder', { method:'PATCH', headers:{'content-type':'application/json'}, body:JSON.stringify({ order: ids }) });
    }
    load();
  });
});

document.getElementById('addBtn').addEventListener('click', async ()=>{
  const title = document.getElementById('title').value.trim();
  const points = parseInt(document.getElementById('points').value,10);
  const status = document.getElementById('status').value;
  const description = document.getElementById('description').value.trim();
  const acceptance = document.getElementById('acceptance').value.split('\n').map(s=>s.trim()).filter(Boolean);
  try{
    await api('/api/stories', { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({ title, points, status, description, acceptanceCriteria: acceptance }) });
    document.getElementById('title').value=''; document.getElementById('points').value=''; document.getElementById('description').value=''; document.getElementById('acceptance').value='';
    load();
  }catch(err){
    document.getElementById('formError').innerText = (err.errors? err.errors.join(', '): (err.error||'Viga')); 
  }
});

load();
