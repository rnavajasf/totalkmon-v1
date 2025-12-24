// CONFIGURACIÓN
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ESTADO
let currentUser = { id: localStorage.getItem('user_uuid'), name: localStorage.getItem('profile_name')||'Anónimo', avatar: localStorage.getItem('profile_avatar')||'🦊', streak: parseInt(localStorage.getItem('streak')||0), votes: parseInt(localStorage.getItem('profile_votes')||0) };
let allQuestions = [];
let currentCategory = 'aleatorio';
let currentJudgeId = null;
let currentClashId = null;
let clashData = { a: '', b: '', va: 0, vb: 0 };
let adminTapCount = 0;
// PARTY MODE STATE
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;

// SONIDO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === 'click') { osc.frequency.setValueAtTime(600, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); if(navigator.vibrate) navigator.vibrate(5); } 
    else if (type === 'swoosh') { osc.type = 'triangle'; gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
    else if (type === 'success') { [440, 554, 659].forEach((f, i) => { const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f; g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i*0.1)); o.start(now); o.stop(now + 0.5); }); }
}

// ==========================================
// MODO FIESTA (REALTIME)
// ==========================================
async function createRoom() {
    if(!currentUser.id) return alert("Espera a que cargue tu perfil.");
    playSfx('click');
    // Generar código de 4 letras
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const { error } = await db.from('rooms').insert({ id: code, host_id: currentUser.id, current_card_text: "¡La fiesta comienza!", current_card_category: "Inicio" });
    
    if(error) return alert("Error al crear sala. Intenta de nuevo.");
    
    currentRoomId = code;
    isHost = true;
    enterPartyMode(code);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("El código debe tener 4 letras.");
    playSfx('click');
    
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no encontrada.");
    
    currentRoomId = code;
    isHost = false;
    enterPartyMode(code);
}

function enterPartyMode(code) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    
    if(isHost) {
        document.getElementById('host-controls').style.display = 'block';
        document.getElementById('guest-controls').style.display = 'none';
    } else {
        document.getElementById('host-controls').style.display = 'none';
        document.getElementById('guest-controls').style.display = 'block';
    }

    // SUSCRIPCIÓN REALTIME (LA MAGIA)
    roomSubscription = db.channel('room-'+code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, (payload) => {
        // Cuando cambia la DB, actualizamos la pantalla
        updatePartyCard(payload.new.current_card_text, payload.new.current_card_category);
    })
    .subscribe();

    // Cargar estado inicial si soy invitado
    if(!isHost) {
        db.from('rooms').select('*').eq('id', code).single().then(({data}) => {
            if(data) updatePartyCard(data.current_card_text, data.current_card_category);
        });
    }
}

function updatePartyCard(text, category) {
    const cardContent = document.querySelector('.party-card .card-inner');
    cardContent.style.opacity = '0';
    playSfx('swoosh');
    setTimeout(() => {
        document.getElementById('party-text').innerText = text;
        document.getElementById('party-cat').innerText = category;
        cardContent.style.opacity = '1';
    }, 200);
}

async function partyNextQuestion() {
    if(!isHost) return;
    // Elegir pregunta random localmente y enviarla a la DB
    const random = allQuestions[Math.floor(Math.random() * allQuestions.length)];
    playSfx('click');
    
    // Al actualizar la DB, Supabase avisará a todos (incluido a mí)
    await db.from('rooms').update({ 
        current_card_text: random.text, 
        current_card_category: random.category 
    }).eq('id', currentRoomId);
}

function exitRoom() {
    if(roomSubscription) db.removeChannel(roomSubscription);
    currentRoomId = null;
    isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
    document.getElementById('join-code').value = "";
}

// ==========================================
// CORE & UTILS
// ==========================================
function triggerAdminUnlock() {
    adminTapCount++;
    if (adminTapCount === 5) {
        if(prompt("🔐 PIN:") === "2025") { alert("CEO Mode."); switchTab('admin'); loadAdminStats(); fetchAdminModeration(); }
        adminTapCount = 0;
    }
}
async function loadAdminStats() {
    const { count: u } = await db.from('profiles').select('*', { count: 'exact', head: true });
    const { count: p } = await db.from('suggestions').select('*', { count: 'exact', head: true });
    if(document.getElementById('admin-users')) document.getElementById('admin-users').innerText = u||0;
    if(document.getElementById('admin-pending')) document.getElementById('admin-pending').innerText = p||0;
}
async function adminCreateClash() {
    const a = document.getElementById('admin-opt-a').value; const b = document.getElementById('admin-opt-b').value;
    if(!a || !b) return alert("Rellena todo.");
    const tom = new Date(); tom.setDate(tom.getDate() + 1); const d = tom.toISOString().split('T')[0];
    await db.from('clashes').delete().eq('publish_date', d);
    await db.from('clashes').insert({ option_a: a, option_b: b, publish_date: d, votes_a: 0, votes_b: 0 });
    alert("Programado.");
}
let adminJudgeId = null;
async function fetchAdminModeration() {
    const { data } = await db.from('suggestions').select('*').limit(1);
    if(data && data.length > 0) { adminJudgeId = data[0].id; document.getElementById('admin-sug-text').innerText = `(${data[0].category}) ${data[0].text}`; }
    else { document.getElementById('admin-sug-text').innerText = "Nada pendiente."; adminJudgeId = null; }
}
async function adminModerate(val) {
    if(!adminJudgeId) return;
    const { data: c } = await db.from('suggestions').select('*').eq('id', adminJudgeId).single();
    if(val===1) { await db.from('questions').insert([{ text: c.text, category: c.category }]); playSfx('success'); }
    await db.from('suggestions').delete().eq('id', adminJudgeId); fetchAdminModeration();
}

// SHARE & INIT
async function shareScreenshot(t) {
    playSfx('click'); const cd = document.getElementById('capture-stage'); const td = document.getElementById('capture-text');
    if(t==='oracle') td.innerHTML = `"${document.getElementById('q-text').innerText}"`;
    else if(t==='clash') { 
        const w = clashData.va > clashData.vb ? clashData.a : clashData.b; 
        const p = (clashData.va+clashData.vb)===0?0:Math.round((Math.max(clashData.va,clashData.vb)/(clashData.va+clashData.vb))*100);
        td.innerHTML = `Prefieren:<br><span style="color:#FFD700">${w}</span> (${p}%)`;
    }
    else if(t==='profile') td.innerHTML = `Soy ${currentUser.name} ${currentUser.avatar}<br>Racha: ${currentUser.streak}`;
    try { const c = await html2canvas(cd, {scale:2, useCORS:true}); c.toBlob(async b => { const f=new File([b],"s.png",{type:"image/png"}); if(navigator.share) await navigator.share({files:[f]}); else alert("No soportado."); }); } catch(e){alert("Error img.");}
}
async function initUser() {
    if (!currentUser.id) { const { data } = await db.from('profiles').insert([{ username: currentUser.name, avatar: currentUser.avatar, streak: 1, last_visit: new Date().toISOString() }]).select().single(); if(data) { currentUser.id = data.id; localStorage.setItem('user_uuid', data.id); } }
    else { const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single(); if(data) { currentUser.streak = data.streak; currentUser.votes = data.votes_cast; checkStreakCloud(data); } } updateProfileUI();
}
async function syncProfileToCloud() { if(currentUser.id) await db.from('profiles').update({ username: currentUser.name, avatar: currentUser.avatar, streak: currentUser.streak, votes_cast: currentUser.votes }).eq('id', currentUser.id); }
function checkStreakCloud(d) { const t=new Date().toISOString().split('T')[0]; const l=d.last_visit?d.last_visit.split('T')[0]:null; if(l!==t) { const y=new Date(); y.setDate(y.getDate()-1); if(l===y.toISOString().split('T')[0]) currentUser.streak++; else currentUser.streak=1; db.from('profiles').update({last_visit:new Date().toISOString(), streak:currentUser.streak}).eq('id',currentUser.id); updateProfileUI(); } }

async function fetchQuestions() { const {data}=await db.from('questions').select('*').limit(50); if(data) allQuestions=data; else allQuestions=[{text:"Hola",category:"Inicio"}]; nextQuestion(); }
function nextQuestion() { 
    let pool=allQuestions; if(currentCategory!=='aleatorio') pool=allQuestions.filter(q=>q.category.toLowerCase()===currentCategory.toLowerCase()); if(pool.length===0) pool=allQuestions;
    const el=document.querySelector('.card-inner'); if(el) { el.style.opacity='0'; setTimeout(()=>{ const r=pool[Math.floor(Math.random()*pool.length)]; document.getElementById('q-text').innerText=r.text; document.getElementById('q-cat').innerText=r.category; el.style.opacity='1'; },200); }
}
function setCategory(c, b) { playSfx('click'); currentCategory=c; document.querySelectorAll('.topic-chip').forEach(btn=>btn.classList.remove('active')); if(b) b.classList.add('active'); nextQuestion(); }
async function loadClash() {
    const t=new Date().toISOString().split('T')[0]; let {data}=await db.from('clashes').select('*').eq('publish_date',t); if(!data||data.length===0) { const {data:r}=await db.from('clashes').select('*').limit(1); data=r; }
    if(data&&data.length>0) { const c=data[0]; currentClashId=c.id; clashData={a:c.option_a, b:c.option_b, va:c.votes_a, vb:c.votes_b}; document.getElementById('text-a').innerText=c.option_a; document.getElementById('text-b').innerText=c.option_b; if(currentUser.id) { const {data:v}=await db.from('user_votes').select('*').eq('user_id',currentUser.id).eq('clash_id',currentClashId).single(); if(v||localStorage.getItem('voted_'+c.id)) showResults(c.votes_a,c.votes_b); } }
}
async function voteClash(o) { if(!currentClashId||!currentUser.id||document.getElementById('clash-section').classList.contains('voted')) return; playSfx('click'); let a=clashData.va, b=clashData.vb; if(o==='a') a++; else b++; showResults(a,b); await db.from('user_votes').insert({user_id:currentUser.id, clash_id:currentClashId, vote_option:o}); await db.from('clashes').update({votes_a:a, votes_b:b}).eq('id',currentClashId); localStorage.setItem('voted_'+currentClashId,'true'); currentUser.votes++; updateProfileUI(); syncProfileToCloud(); }
function showResults(a,b) { const t=a+b; let pa=t===0?0:Math.round((a/t)*100), pb=t===0?0:Math.round((b/t)*100); document.getElementById('bar-a').style.width=pa+'%'; document.getElementById('bar-b').style.width=pb+'%'; document.getElementById('perc-a').innerText=pa+'%'; document.getElementById('perc-b').innerText=pb+'%'; document.getElementById('clash-section').classList.add('voted'); }
async function fetchJudge() { const {data}=await db.from('suggestions').select('*').limit(5); if(data&&data.length>0) { const r=data[Math.floor(Math.random()*data.length)]; currentJudgeId=r.id; document.getElementById('judge-text').innerText=r.text; document.getElementById('judge-cat').innerText=r.category; } else { document.getElementById('judge-text').innerText="Nada."; currentJudgeId=null; } }
async function voteJudgment(v) { if(!currentJudgeId) return; playSfx('click'); const {data:c}=await db.from('suggestions').select('*').eq('id',currentJudgeId).single(); if(!c) { fetchJudge(); return; } let nv=(c.votes||0)+v; if(nv>=5) { await db.from('questions').insert([{text:c.text, category:c.category}]); await db.from('suggestions').delete().eq('id',currentJudgeId); playSfx('success'); } else if(nv<=-5) await db.from('suggestions').delete().eq('id',currentJudgeId); else await db.from('suggestions').update({votes:nv}).eq('id',currentJudgeId); currentUser.votes++; updateProfileUI(); syncProfileToCloud(); fetchJudge(); }
function updateProfileUI() { if(!document.getElementById('profile-name')) return; document.getElementById('profile-name').value=currentUser.name; document.getElementById('profile-avatar').innerText=currentUser.avatar; document.getElementById('stat-streak').innerText=currentUser.streak; document.getElementById('streak-count').innerText=currentUser.streak; document.getElementById('stat-votes').innerText=currentUser.votes; localStorage.setItem('profile_name',currentUser.name); localStorage.setItem('profile_avatar',currentUser.avatar); localStorage.setItem('streak',currentUser.streak); localStorage.setItem('profile_votes',currentUser.votes); const l=Math.floor(currentUser.votes/10)+1; let t="Novato"; if(l>5) t="Juez"; if(l>20) t="Oráculo"; if(l>50) t="Dios"; document.getElementById('profile-level').innerText=`Nivel ${l}: ${t}`; }
function saveProfile() { const n=document.getElementById('profile-name').value; if(n.trim()==="") return; currentUser.name=n; updateProfileUI(); syncProfileToCloud(); }
function toggleAvatarEdit() { const s=document.getElementById('avatar-selector'); s.style.display=s.style.display==='none'?'grid':'none'; playSfx('click'); }
function setAvatar(e) { currentUser.avatar=e; document.getElementById('avatar-selector').style.display='none'; playSfx('success'); updateProfileUI(); syncProfileToCloud(); }
async function sendSuggestion() { const t=document.getElementById('sug-text').value; const c=document.getElementById('sug-cat').value; if(!t) return; await db.from('suggestions').insert([{text:t, category:c, votes:0}]); alert("Enviado."); closeModal(); document.getElementById('sug-text').value=""; }
function switchTab(t, el) { playSfx('click'); document.querySelectorAll('.dock-item').forEach(d=>d.classList.remove('active')); if(el) el.classList.add('active'); ['oracle','clash','party','judgment','profile','admin'].forEach(s=>{ const sec=document.getElementById(s+'-section'); if(sec) sec.classList.remove('active-section'); }); const tg=document.getElementById(t+'-section'); if(tg) tg.classList.add('active-section'); if(t==='clash') loadClash(); if(t==='judgment') fetchJudge(); if(t==='profile') updateProfileUI(); }
function openModal() { document.getElementById('suggestionModal').style.display='flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display='none'; }
function openStreakModal() { document.getElementById('modal-streak-count').innerText=currentUser.streak; document.getElementById('streakModal').style.display='flex'; playSfx('click'); }
function closeStreakModal() { document.getElementById('streakModal').style.display='none'; }

document.addEventListener('DOMContentLoaded', () => { initUser(); fetchQuestions(); });