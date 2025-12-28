// ==========================================
// CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const imposterWords = ["Hospital", "Escuela", "Playa", "Cine", "Gimnasio", "Aeropuerto", "Zoológico", "Hotel", "Cárcel", "Banco", "Museo", "Restaurante", "Circo"];
const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da Felicidad", b: "No da Felicidad" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" }
];

// ESTADO
let currentUser = { id: localStorage.getItem('u_id'), name: localStorage.getItem('u_name')||'Anónimo', avatar: localStorage.getItem('u_av')||'🦊', streak: 0, votes: 0 };
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';
let allQuestions = [];
let currentCategory = 'Mix';
let clashData = { id: null, a: '', b: '', va: 0, vb: 0 };
let adminTapCount = 0;

// ==========================================
// DELEGACIÓN DE EVENTOS CENTRALIZADA
// ==========================================
document.addEventListener('click', (e) => {
    const target = e.target;
    const btn = target.closest('[data-action]');
    
    if (btn) {
        const action = btn.dataset.action;
        const val = btn.dataset.val;
        
        if (action === 'setCategory') setCategory(val, btn);
        if (action === 'nextQuestion') nextQuestion();
        if (action === 'voteClash') voteClash(val);
        if (action === 'share') shareScreenshot(val);
        if (action === 'selectGameMode') selectGameMode(val);
        if (action === 'createRoom') createRoom();
        if (action === 'joinRoom') joinRoom();
        if (action === 'exitRoom') exitRoom();
        if (action === 'partyNextRound') partyNextRound();
        if (action === 'switchTab') switchTab(val, btn);
        if (action === 'toggleAvatarEdit') toggleAvatarEdit();
        if (action === 'setAvatar') setAvatar(val);
        if (action === 'voteJudgment') voteJudgment(parseInt(val));
        if (action === 'openModal') openModal();
        if (action === 'closeModal') closeModal();
        if (action === 'sendSuggestion') sendSuggestion();
        if (action === 'openStreakModal') openStreakModal();
        if (action === 'closeStreakModal') closeStreakModal();
    }
});

// EVENTOS DE CAMPO DE TEXTO
document.getElementById('profile-name').addEventListener('blur', saveProfile);
document.getElementById('profile-level').addEventListener('click', triggerAdminUnlock);

// ==========================================
// ARRANQUE
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    updateProfileUI();
    await initUser();
    await fetchQuestions();
    await loadClash();
});

async function initUser() {
    if (!currentUser.id) {
        const { data } = await db.from('profiles').insert([{ username: currentUser.name, avatar: currentUser.avatar }]).select().single();
        if(data) { currentUser.id = data.id; localStorage.setItem('u_id', data.id); }
    } else {
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if(data) { currentUser.streak = data.streak || 0; currentUser.votes = data.votes_cast || 0; updateProfileUI(); }
        else { localStorage.removeItem('u_id'); currentUser.id = null; await initUser(); }
    }
}

// ==========================================
// LOGICA DE JUEGO
// ==========================================
async function fetchQuestions() { 
    const { data } = await db.from('questions').select('*').limit(2000); 
    if(data && data.length > 0) allQuestions = data; 
    else allQuestions = [{text:"Cargando...", category:"Mix"}]; 
    nextQuestion(); 
}

function nextQuestion() { 
    let pool = [];
    if(currentCategory.toLowerCase() === 'mix') pool = allQuestions;
    else pool = allQuestions.filter(q => q.category.toLowerCase() === currentCategory.toLowerCase());
    if(pool.length === 0) pool = allQuestions;
    
    const r = pool[Math.floor(Math.random() * pool.length)]; 
    document.getElementById('q-text').innerText = r.text;
    document.getElementById('q-cat').innerText = r.category;
    playSfx('swoosh');
}

function setCategory(cat, btn) { 
    playSfx('click'); 
    currentCategory = cat; 
    document.querySelectorAll('.topic-chip').forEach(x => x.classList.remove('active')); 
    btn.classList.add('active'); 
    nextQuestion(); 
}

// MULTIJUGADOR
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    document.querySelector(`[data-val="${mode}"]`).classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Cargando perfil...");
    playSfx('click');
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    await db.from('rooms').insert({ id: code, host_id: currentUser.id, current_card_text: "Sala Lista", current_card_category: "...", gamemode: selectedGameMode, game_state: 'waiting' });
    await db.from('room_participants').upsert({ room_id: code, user_id: currentUser.id, role: 'spectator' });
    currentRoomId = code; isHost = true; enterPartyMode(code);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código incorrecto");
    playSfx('click');
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no existe");
    await db.from('room_participants').upsert({ room_id: code, user_id: currentUser.id, role: 'spectator' });
    currentRoomId = code; isHost = false; selectedGameMode = data.gamemode;
    enterPartyMode(code);
}

function enterPartyMode(code) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    updateGameUI();

    document.getElementById('host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('guest-controls').style.display = isHost ? 'none' : 'block';

    if(roomSubscription) db.removeChannel(roomSubscription);
    roomSubscription = db.channel('room-'+code)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, payload => {
            handleRoomUpdate(payload.new);
        })
        .subscribe();
        
    db.from('rooms').select('*').eq('id', code).single().then(({data}) => { if(data) handleRoomUpdate(data); });
}

function updateGameUI() {
    ['classic', 'imposter', 'versus'].forEach(m => document.getElementById('party-card-' + m).style.display = 'none');
    document.getElementById('party-card-' + selectedGameMode).style.display = 'flex';
}

async function handleRoomUpdate(room) {
    if(room.gamemode !== selectedGameMode) { selectedGameMode = room.gamemode; updateGameUI(); }
    
    // Animación visual
    const activeCard = document.getElementById('party-card-' + selectedGameMode);
    activeCard.classList.remove('flash-animation'); void activeCard.offsetWidth; activeCard.classList.add('flash-animation');
    playSfx('swoosh');

    if(selectedGameMode === 'classic') {
        document.getElementById('party-text').innerText = room.current_card_text;
        document.getElementById('party-cat').innerText = room.current_card_category;
    } 
    else if(selectedGameMode === 'imposter') {
        const txt = document.getElementById('imposter-role-text');
        txt.style.filter = 'blur(15px)';
        if(currentUser.id === room.imposter_id) txt.innerText = "🤫 ERES EL IMPOSTOR";
        else txt.innerText = room.current_card_text;
    }
    else if(selectedGameMode === 'versus') {
        document.getElementById('versus-main-text').innerText = room.current_card_text;
        await fetchVersusRole(room.current_card_category, 3);
    }
}

async function fetchVersusRole(categoryStr, retries) {
    const { data } = await db.from('room_participants').select('role').match({room_id: currentRoomId, user_id: currentUser.id}).single();
    const roleText = document.getElementById('versus-role-text');
    const box = document.getElementById('versus-role-box');
    const opts = categoryStr.split('|');
    
    box.classList.remove('team-a-style', 'team-b-style');
    if(data && data.role === 'team_a') { box.classList.add('team-a-style'); roleText.innerText = "DEFENDER: " + (opts[0]||'A'); }
    else if(data && data.role === 'team_b') { box.classList.add('team-b-style'); roleText.innerText = "DEFENDER: " + (opts[1]||'B'); }
    else {
        if(retries > 0) setTimeout(() => fetchVersusRole(categoryStr, retries-1), 500);
        else roleText.innerText = "ESPERANDO...";
    }
}

async function partyNextRound() {
    if(!isHost) return;
    playSfx('click');
    
    if(selectedGameMode === 'classic') {
        const r = allQuestions[Math.floor(Math.random()*allQuestions.length)];
        await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'imposter') {
        const w = imposterWords[Math.floor(Math.random()*imposterWords.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        let imp = currentUser.id;
        if(ps.length) imp = ps[Math.floor(Math.random()*ps.length)].user_id;
        await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'versus') {
        const d = debateTopics[Math.floor(Math.random()*debateTopics.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        if(ps.length) {
            for(let i=ps.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
            const updates = ps.map((p, i) => db.from('room_participants').update({ role: i%2===0?'team_a':'team_b' }).match({room_id: currentRoomId, user_id: p.user_id}));
            await Promise.all(updates);
        }
        setTimeout(async () => {
            await db.from('rooms').update({ current_card_text: d.title, current_card_category: d.a+"|"+d.b }).eq('id', currentRoomId);
        }, 200);
    }
}

function exitRoom() {
    if(roomSubscription) db.removeChannel(roomSubscription);
    if(currentRoomId) db.from('room_participants').delete().match({room_id: currentRoomId, user_id: currentUser.id});
    currentRoomId = null; isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
    document.getElementById('join-code').value = "";
}

// RESTO DE FUNCIONES
async function loadClash() {
    const t=new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', t);
    if (!data || data.length === 0) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
    if(data && data.length > 0) {
        const c=data[0]; currentClashId=c.id; clashData={a:c.option_a, b:c.option_b, va:c.votes_a, vb:c.votes_b};
        document.getElementById('text-a').innerText=c.option_a; document.getElementById('text-b').innerText=c.option_b;
        if(localStorage.getItem('voted_'+c.id)) showResults(c.votes_a, c.votes_b);
    }
}
async function voteClash(o) {
    if(!currentClashId || document.getElementById('clash-section').classList.contains('voted')) return;
    playSfx('click');
    let a=clashData.va, b=clashData.vb; if(o==='a') a++; else b++;
    showResults(a, b);
    localStorage.setItem('voted_'+currentClashId, 'true');
    if(currentUser.id) {
        await db.from('user_votes').insert({user_id:currentUser.id, clash_id:currentClashId, vote_option:o});
        await db.from('clashes').update({votes_a:a, votes_b:b}).eq('id',currentClashId);
    }
}
function showResults(a,b) {
    const t=a+b; let pa=t===0?0:Math.round((a/t)*100), pb=t===0?0:Math.round((b/t)*100);
    document.getElementById('bar-a').style.width=pa+'%'; document.getElementById('bar-b').style.width=pb+'%';
    document.getElementById('perc-a').innerText=pa+'%'; document.getElementById('perc-b').innerText=pb+'%';
    document.getElementById('clash-section').classList.add('voted');
}
function updateProfileUI() {
    if(!document.getElementById('profile-name')) return;
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('stat-votes').innerText = currentUser.votes;
    localStorage.setItem('u_name', currentUser.name); localStorage.setItem('u_av', currentUser.avatar);
}
function saveProfile() { currentUser.name = document.getElementById('profile-name').value; updateProfileUI(); if(currentUser.id) db.from('profiles').update({username:currentUser.name}).eq('id', currentUser.id); }
function toggleAvatarEdit() { const s=document.getElementById('avatar-selector'); s.style.display = s.style.display==='none'?'grid':'none'; }
function setAvatar(e) { currentUser.avatar=e; document.getElementById('avatar-selector').style.display = 'none'; saveProfile(); }
function switchTab(t, el) { 
    playSfx('click'); document.querySelectorAll('.dock-item').forEach(d=>d.classList.remove('active')); if(el) el.classList.add('active');
    ['oracle','clash','party','judgment','profile','admin'].forEach(s => document.getElementById('section-'+s).classList.remove('active-section'));
    document.getElementById('section-'+t).classList.add('active-section');
    if(t==='clash') loadClash();
}
async function fetchJudge() {
    const { data } = await db.from('suggestions').select('*').limit(5);
    if (data && data.length > 0) {
        const r = data[Math.floor(Math.random() * data.length)];
        currentJudgeId = r.id;
        document.getElementById('judge-text').innerText = r.text;
        document.getElementById('judge-cat').innerText = r.category;
    } else { document.getElementById('judge-text').innerText = "Nada pendiente."; currentJudgeId = null; }
}
async function voteJudgment(v) {
    if (!currentJudgeId) return; playSfx('click');
    const { data: c } = await db.from('suggestions').select('*').eq('id', currentJudgeId).single();
    if (!c) { fetchJudge(); return; }
    let nv = (c.votes || 0) + v;
    if (nv >= 5) { await db.from('questions').insert([{ text: c.text, category: c.category }]); await db.from('suggestions').delete().eq('id', currentJudgeId); playSfx('success'); }
    else if (nv <= -5) await db.from('suggestions').delete().eq('id', currentJudgeId);
    else await db.from('suggestions').update({ votes: nv }).eq('id', currentJudgeId);
    fetchJudge();
}
function openModal() { document.getElementById('suggestionModal').style.display='flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display='none'; }
function openStreakModal() { document.getElementById('streakModal').style.display='flex'; playSfx('click'); }
function closeStreakModal() { document.getElementById('streakModal').style.display='none'; }
async function sendSuggestion() { const t=document.getElementById('sug-text').value; if(!t) return; await db.from('suggestions').insert([{text:t, category:'Mix', votes:0}]); alert("Enviado."); closeModal(); }
function triggerAdminUnlock() { adminTapCount++; if(adminTapCount===5 && prompt("PIN")==="2025") switchTab('admin'); if(adminTapCount===5) adminTapCount=0; }
async function adminCreateClash() { const a=document.getElementById('admin-opt-a').value; const b=document.getElementById('admin-opt-b').value; if(a&&b) { const t=new Date(); t.setDate(t.getDate()+1); await db.from('clashes').delete().eq('publish_date', t.toISOString().split('T')[0]); await db.from('clashes').insert({option_a:a, option_b:b, publish_date:t.toISOString().split('T')[0]}); alert("OK"); } }
async function shareScreenshot(t) { alert("Captura guardada."); }
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) { if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{}); try{ const o=audioCtx.createOscillator();const g=audioCtx.createGain();o.connect(g);g.connect(audioCtx.destination);const t=audioCtx.currentTime;if(type==='click'){o.frequency.setValueAtTime(600,t);g.gain.exponentialRampToValueAtTime(0.01,t+0.1);o.start(t);o.stop(t+0.1);}else{o.type='triangle';g.gain.setValueAtTime(0.05,t);g.gain.linearRampToValueAtTime(0,t+0.15);o.start(t);o.stop(t+0.15);}}catch(e){} }