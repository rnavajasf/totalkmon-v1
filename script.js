// ==========================================
// 1. CONFIGURACIÓN (TUS CLAVES REALES)
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. DICCIONARIOS DE DATOS
// ==========================================
const imposterWords = ["Hospital", "Escuela", "Playa", "Cine", "Gimnasio", "Aeropuerto", "Supermercado", "Restaurante", "Zoológico", "Hotel", "Teléfono", "Cuchara", "Inodoro", "Cama", "Reloj", "Pizza", "Sushi", "Hamburguesa", "Chocolate", "Plátano", "Perro", "Gato", "León", "Policía", "Médico", "Bombero"];
const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No la da" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "V.O." }
];

// ==========================================
// 3. ESTADO GLOBAL
// ==========================================
let currentUser = {
    id: localStorage.getItem('user_uuid'),
    name: localStorage.getItem('profile_name') || 'Anónimo',
    avatar: localStorage.getItem('profile_avatar') || '🦊',
    streak: parseInt(localStorage.getItem('streak') || 0),
    votes: parseInt(localStorage.getItem('profile_votes') || 0)
};

let allQuestions = [];
let currentCategory = 'aleatorio';
let currentClashId = null;
let currentJudgeId = null;
let clashData = { a: '', b: '', va: 0, vb: 0 };

// PARTY STATE
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';
let adminTapCount = 0;

// ==========================================
// 4. ARRANQUE (DELEGACIÓN DE EVENTOS)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log("Iniciando App V33...");
    
    // 1. CARGA DE DATOS
    updateProfileUI(); 
    await initUser();
    await fetchQuestions(); 

    // 2. DELEGACIÓN DE EVENTOS (ROBUSTO)
    // Esto asegura que los clics funcionen incluso si el DOM cambia
    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('button, .interactive-card, .topic-chip, .mode-option');
        if (!target) return;

        // ORÁCULO
        if (target.id === 'oracle-card-trigger') { nextQuestion(); playSfx('swoosh'); }
        if (target.classList.contains('topic-chip')) { setCategory(target.dataset.cat, target); }
        
        // DILEMA
        if (target.id === 'btn-vote-a') voteClash('a');
        if (target.id === 'btn-vote-b') voteClash('b');
        if (target.id === 'btn-share-clash') shareScreenshot('clash');

        // PARTY (LOBBY)
        if (target.id === 'btn-create-room') createRoom();
        if (target.id === 'btn-join-room') joinRoom();
        if (target.classList.contains('mode-option')) selectGameMode(target.dataset.mode);

        // PARTY (JUEGO)
        if (target.id === 'btn-next-round') partyNextRound(); // <--- AQUÍ ESTABA EL PROBLEMA
        if (target.id === 'btn-exit-room') exitRoom();

        // OTROS
        if (target.id === 'btn-open-suggestion') openModal();
        if (target.id === 'btn-close-sug') closeModal();
        if (target.id === 'btn-send-sug') sendSuggestion();
        if (target.classList.contains('dock-item')) switchTab(target.dataset.tab, target);
        if (target.id === 'profile-avatar-wrapper') toggleAvatarEdit();
    });
});

// SONIDO (Protected)
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
// 5. MODO FIESTA (LÓGICA V33)
// ==========================================
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Cargando perfil...");
    playSfx('click');
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // Crear Sala
    await db.from('rooms').insert({ 
        id: code, host_id: currentUser.id, 
        current_card_text: "Sala Creada", current_card_category: "Esperando...", 
        gamemode: selectedGameMode, game_state: 'waiting' 
    });
    
    // Join Host
    await db.from('room_participants').upsert({ room_id: code, user_id: currentUser.id, role: 'spectator' }, { onConflict: 'room_id, user_id' });
    currentRoomId = code; isHost = true; enterPartyMode(code, selectedGameMode);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código incorrecto");
    playSfx('click');
    
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no encontrada");
    
    await db.from('room_participants').upsert({ room_id: code, user_id: currentUser.id, role: 'spectator' }, { onConflict: 'room_id, user_id' });
    currentRoomId = code; isHost = false; 
    enterPartyMode(code, data.gamemode);
}

function enterPartyMode(code, mode) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    selectedGameMode = mode || 'classic';
    updateGameUI(selectedGameMode);

    if(isHost) { document.getElementById('host-controls').style.display = 'block'; document.getElementById('guest-controls').style.display = 'none'; } 
    else { document.getElementById('host-controls').style.display = 'none'; document.getElementById('guest-controls').style.display = 'block'; }

    // Suscripción Realtime
    if(roomSubscription) db.removeChannel(roomSubscription);
    roomSubscription = db.channel('room-'+code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, (payload) => {
        handleRoomUpdate(payload.new);
    })
    .subscribe();

    // FETCH INICIAL
    db.from('rooms').select('*').eq('id', code).single().then(({data}) => { 
        if(data) handleRoomUpdate(data);
    });
}

function updateGameUI(mode) {
    ['classic', 'imposter', 'versus'].forEach(m => {
        const el = document.getElementById('party-card-' + m);
        if(el) el.style.display = 'none';
    });
    const currentEl = document.getElementById('party-card-' + mode);
    if(currentEl) currentEl.style.display = 'flex';
}

async function handleRoomUpdate(roomData) {
    if(roomData.gamemode !== selectedGameMode) {
        selectedGameMode = roomData.gamemode;
        updateGameUI(selectedGameMode);
    }

    triggerFlash(document.querySelector('.card-container'));

    if(selectedGameMode === 'classic') {
        document.getElementById('party-text').innerText = roomData.current_card_text;
        document.getElementById('party-cat').innerText = roomData.current_card_category;
    } 
    else if(selectedGameMode === 'imposter') {
        if(currentUser.id === roomData.imposter_id) updateImposterCard("🤫 ERES EL IMPOSTOR", "Disimula.");
        else updateImposterCard(roomData.current_card_text, "Palabra Secreta");
    }
    else if(selectedGameMode === 'versus') {
        updateVersusCard(roomData.current_card_text, roomData.current_card_category);
    }
}

function updateImposterCard(mainText, subText) {
    const textEl = document.getElementById('imposter-role-text');
    textEl.innerText = mainText;
    textEl.style.filter = 'blur(15px)';
    document.querySelector('#party-card-imposter .hint').innerText = subText;
}

async function updateVersusCard(title, optionsStr) {
    if(!currentUser.id) return;
    const parts = optionsStr ? optionsStr.split('|') : ["A", "B"];
    document.getElementById('versus-main-text').innerText = title;
    
    // FETCH ROL DE LA BASE DE DATOS
    const { data } = await db.from('room_participants').select('role').match({ room_id: currentRoomId, user_id: currentUser.id }).single();
    
    const box = document.getElementById('versus-role-box');
    const roleText = document.getElementById('versus-role-text');
    box.classList.remove('team-a-style', 'team-b-style');
    
    if(data && data.role === 'team_a') {
        box.classList.add('team-a-style');
        roleText.innerText = "DEFENDER: " + (parts[0] || "A");
    } else if(data && data.role === 'team_b') {
        box.classList.add('team-b-style');
        roleText.innerText = "DEFENDER: " + (parts[1] || "B");
    } else {
        roleText.innerText = "ESPERANDO...";
    }
}

function triggerFlash(el) {
    if(!el) return;
    el.classList.remove('flash-animation');
    void el.offsetWidth;
    el.classList.add('flash-animation');
    playSfx('swoosh');
}

// CONTROL DEL HOST
async function partyNextRound() {
    if(!isHost) return;
    playSfx('click');
    console.log("Avanzando ronda...");

    if(selectedGameMode === 'classic') {
        const r = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ 
            current_card_text: r.text, 
            current_card_category: r.category 
        }).eq('id', currentRoomId);
    } 
    else if(selectedGameMode === 'imposter') {
        const w = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        let imp = currentUser.id;
        if(ps && ps.length > 0) imp = ps[Math.floor(Math.random() * ps.length)].user_id;
        await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'versus') {
        const d = debateTopics[Math.floor(Math.random() * debateTopics.length)];
        // REPARTIR
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        if(ps && ps.length > 0) {
            for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
            const updates = ps.map((p, idx) => {
                const team = idx % 2 === 0 ? 'team_a' : 'team_b';
                return db.from('room_participants').update({ role: team }).match({ room_id: currentRoomId, user_id: p.user_id });
            });
            await Promise.all(updates);
        }
        // LANZAR
        await db.from('rooms').update({ 
            current_card_text: d.title, 
            current_card_category: `${d.a}|${d.b}` 
        }).eq('id', currentRoomId);
    }
}

function exitRoom() {
    if(roomSubscription) db.removeChannel(roomSubscription);
    currentRoomId = null; isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
    document.getElementById('join-code').value = "";
}

// ==========================================
// 7. UTILS
// ==========================================
async function initUser() {
    if (!currentUser.id) {
        const { data } = await db.from('profiles').insert([{ username: currentUser.name, avatar: currentUser.avatar, last_visit: new Date().toISOString() }]).select().single();
        if(data) { currentUser.id = data.id; localStorage.setItem('user_uuid', data.id); }
    } else {
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if(data) { currentUser.streak = data.streak; currentUser.votes = data.votes_cast; updateProfileUI(); }
        else { localStorage.removeItem('user_uuid'); currentUser.id = null; await initUser(); }
    }
}
function updateProfileUI() {
    if(!document.getElementById('profile-name')) return;
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('stat-votes').innerText = currentUser.votes;
}
function saveProfile() { currentUser.name = document.getElementById('profile-name').value; updateProfileUI(); if(currentUser.id) db.from('profiles').update({ username: currentUser.name }).eq('id', currentUser.id); }
function toggleAvatarEdit() { const s=document.getElementById('avatar-selector'); s.style.display = s.style.display==='none'?'grid':'none'; }
function setAvatar(e) { currentUser.avatar=e; document.getElementById('avatar-selector').style.display = 'none'; saveProfile(); }
function switchTab(t, el) { 
    playSfx('click'); document.querySelectorAll('.dock-item').forEach(d=>d.classList.remove('active')); if(el) el.classList.add('active');
    ['oracle','clash','party','judgment','profile','admin'].forEach(s => document.getElementById(s+'-section').classList.remove('active-section'));
    document.getElementById(t+'-section').classList.add('active-section');
    if(t==='clash') loadClash();
    if(t==='profile') updateProfileUI();
}

// DILEMA & ORACULO
async function fetchQuestions() { const { data } = await db.from('questions').select('*').limit(1000); if(data) allQuestions = data; else allQuestions=[{text:"Hola",category:"Inicio"}]; nextQuestion(); }
function nextQuestion() { 
    let pool=allQuestions; 
    if(currentCategory.toLowerCase()!=='aleatorio') pool=allQuestions.filter(q=>q.category && q.category.toLowerCase()===currentCategory.toLowerCase()); 
    if(pool.length===0) pool=allQuestions;
    const r=pool[Math.floor(Math.random()*pool.length)]; 
    document.getElementById('q-text').innerText=r.text; document.getElementById('q-cat').innerText=r.category;
}
function setCategory(c, btn) { playSfx('click'); currentCategory=c; document.querySelectorAll('.topic-chip').forEach(x=>x.classList.remove('active')); btn.classList.add('active'); nextQuestion(); }

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

// MODALS
function openModal() { document.getElementById('suggestionModal').style.display='flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display='none'; }
function openStreakModal() { document.getElementById('streakModal').style.display='flex'; playSfx('click'); }
function closeStreakModal() { document.getElementById('streakModal').style.display='none'; }
async function sendSuggestion() { const t=document.getElementById('sug-text').value; if(!t) return; await db.from('suggestions').insert([{text:t, category:'Mix', votes:0}]); alert("Enviado."); closeModal(); }
function shareScreenshot(t) { alert("Captura guardada."); }