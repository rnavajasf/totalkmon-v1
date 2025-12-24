// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. DICCIONARIOS
// ==========================================
const imposterWords = ["Hospital", "Escuela", "Playa", "Cine", "Gimnasio", "Aeropuerto", "Supermercado", "Restaurante", "Zoológico", "Hotel", "Teléfono", "Cuchara", "Inodoro", "Cama", "Reloj", "Pizza", "Sushi", "Hamburguesa", "Chocolate", "Plátano", "Perro", "Gato", "León", "Policía", "Médico", "Bombero"];

const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "V.O." },
    { title: "Vacaciones", a: "Playa", b: "Montaña" },
    { title: "Trabajo", a: "Remoto", b: "Presencial" }
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
// 4. ARRANQUE INMEDIATO (SIN BLOQUEOS)
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Cargar interfaz inmediatamente con datos locales
    updateProfileUI();
    // 2. Iniciar procesos de fondo
    initUser(); 
    fetchQuestions();
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
        else if (type === 'success') { [440, 554, 659].forEach((f, i) => { const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f; g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i*0.1)); o.start(now); o.stop(now + 0.5); }); }
    } catch(e){}
}

// ==========================================
// 5. MODO FIESTA (LÓGICA SEGURA)
// ==========================================
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    const btn = document.getElementById('mode-' + mode);
    if(btn) btn.classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Cargando perfil...");
    playSfx('click');
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    await db.from('rooms').insert({ 
        id: code, host_id: currentUser.id, 
        current_card_text: "Sala Creada", current_card_category: "Esperando...", 
        gamemode: selectedGameMode 
    });
    
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'civilian' });
    currentRoomId = code; isHost = true; enterPartyMode(code, selectedGameMode);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código de 4 letras.");
    playSfx('click');
    
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no encontrada.");
    
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'civilian' });
    currentRoomId = code; isHost = false; enterPartyMode(code, data.gamemode);
}

function enterPartyMode(code, mode) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    selectedGameMode = mode || 'classic';
    updateGameUI(selectedGameMode);

    if(isHost) { document.getElementById('host-controls').style.display = 'block'; document.getElementById('guest-controls').style.display = 'none'; } 
    else { document.getElementById('host-controls').style.display = 'none'; document.getElementById('guest-controls').style.display = 'block'; }

    if(roomSubscription) db.removeChannel(roomSubscription);
    roomSubscription = db.channel('room-'+code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, (payload) => {
        handleRoomUpdate(payload.new);
    })
    .subscribe();

    if(!isHost) { db.from('rooms').select('*').eq('id', code).single().then(({data}) => { if(data) handleRoomUpdate(data); }); }
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

    if(selectedGameMode === 'classic') {
        updateClassicCard(roomData.current_card_text, roomData.current_card_category);
    } 
    else if(selectedGameMode === 'imposter') {
        if(currentUser.id === roomData.imposter_id) updateImposterCard("🤫 ERES EL IMPOSTOR", "Disimula.");
        else updateImposterCard(roomData.current_card_text, "Palabra Secreta");
    }
    else if(selectedGameMode === 'versus') {
        // Lógica simplificada para Versus (sin DB blocking)
        // Usamos el ID local para calcular el equipo instantáneamente
        updateVersusCard(roomData.current_card_text, roomData.current_card_category);
    }
}

function updateClassicCard(text, category) {
    const card = document.getElementById('party-card-classic');
    triggerFlash(card);
    document.getElementById('party-text').innerText = text;
    document.getElementById('party-cat').innerText = category;
}

function updateImposterCard(mainText, subText) {
    const card = document.getElementById('party-card-imposter');
    triggerFlash(card);
    const textEl = document.getElementById('imposter-role-text');
    textEl.innerText = mainText;
    textEl.style.filter = 'blur(15px)';
    card.querySelector('.hint').innerText = subText;
}

function updateVersusCard(title, optionsStr) {
    if(!currentUser.id) return;
    const card = document.getElementById('party-card-versus');
    triggerFlash(card);
    
    const parts = optionsStr ? optionsStr.split('|') : ["A", "B"];
    document.getElementById('versus-main-text').innerText = title;
    
    // Cálculo LOCAL del equipo (Más rápido, no bloquea)
    let sum = 0;
    for(let i=0; i<currentUser.id.length; i++) sum += currentUser.id.charCodeAt(i);
    const isTeamA = (sum % 2 === 0);

    const box = document.getElementById('versus-role-box');
    const roleText = document.getElementById('versus-role-text');
    box.classList.remove('team-a-style', 'team-b-style');
    
    if(isTeamA) {
        box.classList.add('team-a-style');
        roleText.innerText = "DEFENDER: " + (parts[0] || "A");
    } else {
        box.classList.add('team-b-style');
        roleText.innerText = "DEFENDER: " + (parts[1] || "B");
    }
}

function triggerFlash(el) {
    if(!el) return;
    el.classList.remove('flash-animation');
    void el.offsetWidth;
    el.classList.add('flash-animation');
    playSfx('swoosh');
    if(navigator.vibrate) navigator.vibrate(50);
}

// CONTROL DEL HOST
async function partyNextRound() {
    if(!isHost) return;
    playSfx('click');

    if(selectedGameMode === 'classic') {
        const r = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', currentRoomId);
    } 
    else if(selectedGameMode === 'imposter') {
        const w = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        // Seleccionar impostor al azar de la lista de participantes
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        let imp = currentUser.id;
        if(ps && ps.length > 0) imp = ps[Math.floor(Math.random() * ps.length)].user_id;
        
        await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'versus') {
        const d = debateTopics[Math.floor(Math.random() * debateTopics.length)];
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
}

// ==========================================
// FUNCIONES UI (ORÁCULO, PERFIL, ETC)
// ==========================================
async function initUser() {
    // Intentar recuperar o crear usuario en segundo plano
    if (!currentUser.id) {
        const { data } = await db.from('profiles').insert([{
            username: currentUser.name, avatar: currentUser.avatar, streak: 1, last_visit: new Date().toISOString()
        }]).select().single();
        if (data) { currentUser.id = data.id; localStorage.setItem('user_uuid', data.id); }
    } else {
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if (data) { 
            currentUser.streak = data.streak; currentUser.votes = data.votes_cast; 
            updateProfileUI(); // Actualizar UI cuando lleguen los datos
        }
    }
}

function updateProfileUI() {
    if(!document.getElementById('profile-name')) return;
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('streak-count').innerText = currentUser.streak;
    document.getElementById('stat-votes').innerText = currentUser.votes;
    localStorage.setItem('profile_name', currentUser.name);
    localStorage.setItem('profile_avatar', currentUser.avatar);
}

function saveProfile() {
    const n = document.getElementById('profile-name').value;
    if(n) {
        currentUser.name = n;
        localStorage.setItem('profile_name', n);
        if(currentUser.id) db.from('profiles').update({ username: n }).eq('id', currentUser.id);
    }
}

function toggleAvatarEdit() { 
    const s = document.getElementById('avatar-selector'); 
    s.style.display = s.style.display === 'none' ? 'grid' : 'none'; 
}
function setAvatar(e) {
    currentUser.avatar = e;
    document.getElementById('avatar-selector').style.display = 'none';
    localStorage.setItem('profile_avatar', e);
    updateProfileUI();
    if(currentUser.id) db.from('profiles').update({ avatar: e }).eq('id', currentUser.id);
}

// ORÁCULO
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*').limit(50);
    if(data && data.length > 0) allQuestions = data;
    else allQuestions = [{text:"Bienvenido.", category:"Inicio"}];
    nextQuestion();
}
function nextQuestion() {
    let pool = allQuestions;
    if(currentCategory !== 'aleatorio') pool = allQuestions.filter(q => q.category.toLowerCase() === currentCategory.toLowerCase());
    if(pool.length === 0) pool = allQuestions;
    const el = document.querySelector('.card-inner');
    if(el) {
        el.style.opacity = '0';
        setTimeout(() => {
            const r = pool[Math.floor(Math.random() * pool.length)];
            document.getElementById('q-text').innerText = r.text;
            document.getElementById('q-cat').innerText = r.category;
            el.style.opacity = '1';
        }, 200);
    }
}
function setCategory(c, b) { playSfx('click'); currentCategory = c; document.querySelectorAll('.topic-chip').forEach(btn => btn.classList.remove('active')); if(b) b.classList.add('active'); nextQuestion(); }

// DILEMA
async function loadClash() {
    const t = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', t);
    if (!data || data.length === 0) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
    if (data && data.length > 0) {
        const c = data[0]; currentClashId = c.id;
        clashData = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        if (localStorage.getItem('voted_' + c.id)) showResults(c.votes_a, c.votes_b);
    }
}
async function voteClash(o) {
    if (!currentClashId || document.getElementById('clash-section').classList.contains('voted')) return;
    playSfx('click');
    let a = clashData.va, b = clashData.vb; if (o === 'a') a++; else b++;
    showResults(a, b);
    localStorage.setItem('voted_' + currentClashId, 'true');
    if(currentUser.id) {
        db.from('user_votes').insert({ user_id: currentUser.id, clash_id: currentClashId, vote_option: o });
        db.from('clashes').update({ votes_a: a, votes_b: b }).eq('id', currentClashId);
    }
}
function showResults(a, b) {
    const t = a + b;
    let pa = t === 0 ? 0 : Math.round((a / t) * 100);
    let pb = t === 0 ? 0 : Math.round((b / t) * 100);
    document.getElementById('bar-a').style.width = pa + '%'; document.getElementById('bar-b').style.width = pb + '%';
    document.getElementById('perc-a').innerText = pa + '%'; document.getElementById('perc-b').innerText = pb + '%';
    document.getElementById('clash-section').classList.add('voted');
}

// GENERAL
function switchTab(t, el) {
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
    if (el) el.classList.add('active');
    ['oracle', 'clash', 'party', 'judgment', 'profile', 'admin'].forEach(s => {
        const sec = document.getElementById(s + '-section');
        if (sec) sec.classList.remove('active-section');
    });
    document.getElementById(t + '-section').classList.add('active-section');
    if (t === 'clash') loadClash();
}

// ADMIN (Simplificado)
function triggerAdminUnlock() {
    adminTapCount++;
    if (adminTapCount === 5) {
        if(prompt("PIN:") === "2025") { switchTab('admin'); }
        adminTapCount = 0;
    }
}
async function adminCreateClash() {
    const a = document.getElementById('admin-opt-a').value; const b = document.getElementById('admin-opt-b').value;
    if(!a || !b) return alert("Rellena todo.");
    const tom = new Date(); tom.setDate(tom.getDate() + 1); const d = tom.toISOString().split('T')[0];
    await db.from('clashes').delete().eq('publish_date', d);
    await db.from('clashes').insert({ option_a: a, option_b: b, publish_date: d, votes_a: 0, votes_b: 0 });
    alert("OK");
}

function openModal() { document.getElementById('suggestionModal').style.display='flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display='none'; }
function openStreakModal() { document.getElementById('streakModal').style.display='flex'; }
function closeStreakModal() { document.getElementById('streakModal').style.display='none'; }