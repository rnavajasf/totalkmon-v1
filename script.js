// ==========================================
// 1. CONFIGURACIÓN (GLOBAL)
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. DATOS
// ==========================================
const imposterWords = ["Hospital", "Cementerio", "Escuela", "Cárcel", "Playa", "Cine", "Discoteca", "Gimnasio", "Aeropuerto", "Supermercado", "Restaurante", "Zoológico", "Hotel", "Teléfono", "Cuchara", "Inodoro", "Cama", "Reloj", "Pizza", "Sushi", "Hamburguesa", "Chocolate", "Perro", "Gato", "León", "Policía", "Médico", "Bombero"];
const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No la da" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "V.O." },
    { title: "Vacaciones", a: "Playa", b: "Montaña" }
];

// ==========================================
// 3. ESTADO
// ==========================================
let currentUser = {
    id: localStorage.getItem('user_uuid'),
    name: localStorage.getItem('profile_name') || 'Anónimo',
    avatar: localStorage.getItem('profile_avatar') || '🦊',
    streak: parseInt(localStorage.getItem('streak') || 0),
    votes: parseInt(localStorage.getItem('profile_votes') || 0)
};

let allQuestions = [];
let currentCategory = 'Mix'; // Default a Mix
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';
let currentClashId = null;
let clashData = { a: '', b: '', va: 0, vb: 0 };

// ==========================================
// 4. ARRANQUE
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    updateProfileUI(); 
    await initUser();
    await fetchQuestions(); 
});

// SONIDO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    try {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        const now = audioCtx.currentTime;
        if (type === 'click') { osc.frequency.setValueAtTime(600, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); } 
        else if (type === 'swoosh') { osc.type = 'triangle'; gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
    } catch(e){}
}

// ==========================================
// 5. ORÁCULO Y TEMÁTICAS (CORREGIDO)
// ==========================================
async function fetchQuestions() { 
    // Pedimos 2000 para asegurar que trae TODO
    const { data } = await db.from('questions').select('*').limit(2000); 
    if(data && data.length > 0) allQuestions = data; 
    else allQuestions = [{text:"Cargando...", category:"Mix"}]; 
    nextQuestion(); 
}

function nextQuestion() { 
    let pool = [];
    // Filtro insensible a mayúsculas
    if(currentCategory.toLowerCase() === 'mix' || currentCategory.toLowerCase() === 'aleatorio') {
        pool = allQuestions;
    } else {
        pool = allQuestions.filter(q => q.category && q.category.toLowerCase() === currentCategory.toLowerCase());
    }
    
    // Si no hay preguntas de esa categoría, no falla, usa todo
    if (pool.length === 0) pool = allQuestions;
    
    const r = pool[Math.floor(Math.random() * pool.length)]; 
    if (r) {
        document.getElementById('q-text').innerText = r.text;
        document.getElementById('q-cat').innerText = r.category;
    }
}

function setCategory(cat, btn) {
    playSfx('click');
    currentCategory = cat;
    document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    nextQuestion();
}

// ==========================================
// 6. MODO FIESTA (GLOBAL & ROBUSTO)
// ==========================================
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('mode-' + mode).classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Cargando usuario...");
    playSfx('click');
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Crear Sala
    await db.from('rooms').insert({ 
        id: code, host_id: currentUser.id, 
        current_card_text: "Sala Lista", current_card_category: "Esperando...", 
        gamemode: selectedGameMode, game_state: 'waiting' 
    });
    
    // Unirme
    await db.from('room_participants').upsert({ room_id: code, user_id: currentUser.id, role: 'spectator' }, { onConflict: 'room_id, user_id' });
    
    currentRoomId = code; isHost = true; enterPartyMode(code);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código incorrecto");
    playSfx('click');
    
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no existe");
    
    await db.from('room_participants').upsert({ room_id: code, user_id: currentUser.id, role: 'spectator' }, { onConflict: 'room_id, user_id' });
    currentRoomId = code; isHost = false; selectedGameMode = data.gamemode;
    enterPartyMode(code);
}

function enterPartyMode(code) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    updateGameUI();

    if(isHost) { document.getElementById('host-controls').style.display = 'block'; document.getElementById('guest-controls').style.display = 'none'; }
    else { document.getElementById('host-controls').style.display = 'none'; document.getElementById('guest-controls').style.display = 'block'; }

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
    
    triggerFlash(document.querySelector('.card-container'));

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
        // Reintentar si el rol tarda en llegar
        fetchVersusRole(room.current_card_category, 3);
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
}

// ==========================================
// 7. UTILS
// ==========================================
async function initUser() {
    // Check de seguridad: Si hay ID en local pero no en DB (por reset), borrar local.
    if (currentUser.id) {
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if (!data) { localStorage.removeItem('user_uuid'); currentUser.id = null; }
    }

    if (!currentUser.id) {
        const { data } = await db.from('profiles').insert([{ username: currentUser.name, avatar: currentUser.avatar }]).select().single();
        if(data) { currentUser.id = data.id; localStorage.setItem('user_uuid', data.id); }
    }
    updateProfileUI();
}

function updateProfileUI() {
    if(!document.getElementById('profile-name')) return;
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('stat-votes').innerText = currentUser.votes;
}
function saveProfile() { currentUser.name = document.getElementById('profile-name').value; updateProfileUI(); if(currentUser.id) db.from('profiles').update({username:currentUser.name}).eq('id', currentUser.id); }
function toggleAvatarEdit() { const s=document.getElementById('avatar-selector'); s.style.display = s.style.display==='none'?'grid':'none'; }
function setAvatar(e) { currentUser.avatar=e; document.getElementById('avatar-selector').style.display = 'none'; saveProfile(); }
function switchTab(t, el) { 
    playSfx('click'); document.querySelectorAll('.dock-item').forEach(d=>d.classList.remove('active')); if(el) el.classList.add('active');
    ['oracle','clash','party','judgment','profile','admin'].forEach(s => document.getElementById(s+'-section').classList.remove('active-section'));
    document.getElementById(t+'-section').classList.add('active-section');
    if(t==='clash') loadClash();
}

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
        db.from('user_votes').insert({user_id:currentUser.id, clash_id:currentClashId, vote_option:o}).then(()=>{});
        db.from('clashes').update({votes_a:a, votes_b:b}).eq('id',currentClashId).then(()=>{});
    }
}
function showResults(a,b) {
    const t=a+b; let pa=t===0?0:Math.round((a/t)*100), pb=t===0?0:Math.round((b/t)*100);
    document.getElementById('bar-a').style.width=pa+'%'; document.getElementById('bar-b').style.width=pb+'%';
    document.getElementById('perc-a').innerText=pa+'%'; document.getElementById('perc-b').innerText=pb+'%';
    document.getElementById('clash-section').classList.add('voted');
}

function triggerFlash(el) { if(!el) return; el.classList.remove('flash-animation'); void el.offsetWidth; el.classList.add('flash-animation'); playSfx('swoosh'); }
function openModal() { document.getElementById('suggestionModal').style.display='flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display='none'; }
async function sendSuggestion() { const t=document.getElementById('sug-text').value; if(!t) return; await db.from('suggestions').insert([{text:t, category:'Mix', votes:0}]); alert("Enviado."); closeModal(); }
function shareScreenshot(t) { alert("Captura guardada."); }