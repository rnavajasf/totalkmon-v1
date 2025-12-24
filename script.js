// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. ESTADO GLOBAL
// ==========================================
let user = { id: null, name: 'Anónimo', avatar: '🦊' };
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';
let allQuestions = [];
let currentCategory = 'Mix';
let clashData = { id: null, a: '', b: '', va: 0, vb: 0 };

const imposterWords = ["Hospital", "Escuela", "Playa", "Cine", "Gimnasio", "Aeropuerto", "Zoológico", "Hotel", "Cárcel", "Banco", "Museo", "Restaurante", "Circo"];
const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da Felicidad", b: "No da Felicidad" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" }
];

// ==========================================
// 3. INICIO (BOOTSTRAP)
// ==========================================
window.onload = async () => {
    setupButtons();
    await ensureUser(); // CLAVE: Asegura usuario ANTES de nada
    await fetchQuestions();
    await loadClash();
    renderProfile();
};

function setupButtons() {
    // Dock
    document.querySelectorAll('.dock-item').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab, b)));
    
    // Oracle
    document.getElementById('oracle-card').addEventListener('click', () => { nextQuestion(); playSfx('swoosh'); });
    document.querySelectorAll('.topic-chip').forEach(b => b.addEventListener('click', () => setCategory(b.dataset.cat, b)));
    document.getElementById('btn-share-oracle').addEventListener('click', () => share('oracle'));

    // Clash
    document.getElementById('btn-vote-a').addEventListener('click', () => voteClash('a'));
    document.getElementById('btn-vote-b').addEventListener('click', () => voteClash('b'));
    document.getElementById('btn-share-clash').addEventListener('click', () => share('clash'));

    // Party
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', joinRoom);
    document.querySelectorAll('.mode-option').forEach(b => b.addEventListener('click', () => selectGameMode(b.dataset.mode)));
    document.getElementById('btn-next-round').addEventListener('click', partyNextRound);
    document.getElementById('btn-exit-room').addEventListener('click', exitRoom);

    // Profile & Utils
    document.getElementById('btn-share-profile').addEventListener('click', () => share('profile'));
    document.getElementById('profile-name').addEventListener('blur', saveProfile);
    document.getElementById('profile-avatar-wrapper').addEventListener('click', toggleAvatar);
    document.querySelectorAll('.av-option').forEach(av => av.addEventListener('click', () => setAvatar(av.innerText)));
    
    // Sugerencias
    document.getElementById('btn-open-suggestion').addEventListener('click', () => document.getElementById('suggestionModal').style.display='flex');
    document.getElementById('btn-close-sug').addEventListener('click', () => document.getElementById('suggestionModal').style.display='none');
    document.getElementById('btn-send-sug').addEventListener('click', sendSuggestion);
}

// ==========================================
// 4. IDENTIDAD (LA CLAVE DEL PROBLEMA)
// ==========================================
async function ensureUser() {
    // 1. Intenta leer localstorage
    let lid = localStorage.getItem('uuid');
    
    if (lid) {
        // Verifica si existe en DB
        const { data } = await db.from('profiles').select('id').eq('id', lid).single();
        if (!data) lid = null; // Si no existe en DB, es invalido
    }

    if (!lid) {
        // Genera nuevo UUID V4
        lid = crypto.randomUUID();
        localStorage.setItem('uuid', lid);
        
        // Guárdalo en DB (Fuerza bruta)
        const { error } = await db.from('profiles').insert([{ 
            id: lid, 
            username: 'Anónimo', 
            avatar: '🦊' 
        }]);
        
        if (error) console.error("Error creando perfil:", error);
    }

    // Carga datos finales
    const { data } = await db.from('profiles').select('*').eq('id', lid).single();
    if (data) {
        user = data;
        localStorage.setItem('profile_name', user.username);
        localStorage.setItem('profile_avatar', user.avatar);
    }
}

// ==========================================
// 5. MODO FIESTA
// ==========================================
function selectGameMode(m) {
    playSfx('click');
    selectedGameMode = m;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('mode-sel-' + m).classList.add('selected');
}

async function createRoom() {
    playSfx('click');
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // 1. Crear Sala
    await db.from('rooms').insert({
        id: code,
        host_id: user.id,
        current_card_text: "Sala Lista",
        current_card_category: "...",
        gamemode: selectedGameMode,
        game_state: 'waiting'
    });

    // 2. Unirme
    await joinRoomProcess(code);
    isHost = true;
    checkHostUI();
}

async function joinRoom() {
    playSfx('click');
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if (code.length !== 4) return alert("Código incorrecto");

    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if (!data) return alert("Sala no existe");

    selectedGameMode = data.gamemode;
    isHost = (data.host_id === user.id);
    await joinRoomProcess(code);
    checkHostUI();
}

async function joinRoomProcess(code) {
    currentRoomId = code;
    // UPSERT para evitar error de duplicado si reentras
    await db.from('room_participants').upsert({
        room_id: code,
        user_id: user.id,
        role: 'spectator'
    });

    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    
    subscribeRoom();
    updateGameUI();
}

function checkHostUI() {
    document.getElementById('host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('guest-controls').style.display = isHost ? 'none' : 'block';
}

function subscribeRoom() {
    if (roomSubscription) db.removeChannel(roomSubscription);
    roomSubscription = db.channel('room-' + currentRoomId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${currentRoomId}` }, payload => {
        handleRoomUpdate(payload.new);
    })
    .subscribe();
}

async function handleRoomUpdate(room) {
    if (room.gamemode !== selectedGameMode) {
        selectedGameMode = room.gamemode;
        updateGameUI();
    }
    
    const card = document.querySelector('.card-container');
    card.classList.remove('flash-animation');
    void card.offsetWidth;
    card.classList.add('flash-animation');
    playSfx('swoosh');

    if (selectedGameMode === 'classic') {
        document.getElementById('party-text').innerText = room.current_card_text;
        document.getElementById('party-cat').innerText = room.current_card_category;
    } else if (selectedGameMode === 'imposter') {
        const el = document.getElementById('imposter-role-text');
        el.style.filter = 'blur(15px)';
        if (user.id === room.imposter_id) el.innerText = "🤫 ERES EL IMPOSTOR";
        else el.innerText = room.current_card_text;
    } else if (selectedGameMode === 'versus') {
        document.getElementById('versus-main-text').innerText = room.current_card_text;
        // Fetch role
        const { data } = await db.from('room_participants').select('role').match({ room_id: currentRoomId, user_id: user.id }).single();
        const roleTxt = document.getElementById('versus-role-text');
        const box = document.getElementById('versus-role-box');
        const opts = room.current_card_category.split('|');
        
        box.classList.remove('team-a-style', 'team-b-style');
        if (data && data.role === 'team_a') {
            box.classList.add('team-a-style');
            roleTxt.innerText = "DEFENDER: " + (opts[0] || 'A');
        } else if (data && data.role === 'team_b') {
            box.classList.add('team-b-style');
            roleTxt.innerText = "DEFENDER: " + (opts[1] || 'B');
        } else {
            roleTxt.innerText = "ESPERANDO...";
        }
    }
}

function updateGameUI() {
    ['classic', 'imposter', 'versus'].forEach(m => document.getElementById('party-card-' + m).style.display = 'none');
    document.getElementById('party-card-' + selectedGameMode).style.display = 'flex';
}

async function partyNextRound() {
    if (!isHost) return;
    playSfx('click');

    if (selectedGameMode === 'classic') {
        const r = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', currentRoomId);
    } 
    else if (selectedGameMode === 'imposter') {
        const w = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        let imp = user.id;
        if (ps.length > 0) imp = ps[Math.floor(Math.random() * ps.length)].user_id;
        await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', currentRoomId);
    }
    else if (selectedGameMode === 'versus') {
        const t = debateTopics[Math.floor(Math.random() * debateTopics.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        if (ps.length > 0) {
            for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
            const updates = ps.map((p, i) => db.from('room_participants').update({ role: i % 2 === 0 ? 'team_a' : 'team_b' }).match({ room_id: currentRoomId, user_id: p.user_id }));
            await Promise.all(updates);
        }
        setTimeout(async () => {
            await db.from('rooms').update({ current_card_text: t.title, current_card_category: t.a + "|" + t.b }).eq('id', currentRoomId);
        }, 200);
    }
}

function exitRoom() {
    if (roomSubscription) db.removeChannel(roomSubscription);
    currentRoomId = null; isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
    document.getElementById('join-code').value = "";
}

// ==========================================
// 6. ORACULO & CLASH
// ==========================================
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*').limit(2000);
    if (data && data.length) allQuestions = data;
    else allQuestions = [{text: "Cargando...", category: "Mix"}];
    nextQuestion();
}

function nextQuestion() {
    let pool = allQuestions;
    if (currentCategory.toLowerCase() !== 'mix' && currentCategory.toLowerCase() !== 'aleatorio') {
        pool = allQuestions.filter(q => q.category && q.category.toLowerCase() === currentCategory.toLowerCase());
    }
    if (pool.length === 0) pool = allQuestions;
    
    const r = pool[Math.floor(Math.random() * pool.length)];
    document.getElementById('q-text').innerText = r.text;
    document.getElementById('q-cat').innerText = r.category;
}

function setCategory(cat, btn) {
    playSfx('click');
    currentCategory = cat;
    document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    nextQuestion();
}

async function loadClash() {
    const today = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', today);
    if (!data || !data.length) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
    
    if (data && data.length) {
        const c = data[0];
        currentClashId = c.id;
        clashData = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        if (localStorage.getItem('voted_' + c.id)) showResults();
    }
}

async function voteClash(opt) {
    if (document.getElementById('clash-section').classList.contains('voted')) return;
    playSfx('click');
    if (opt === 'a') clashData.va++; else clashData.vb++;
    showResults();
    localStorage.setItem('voted_' + currentClashId, 'true');
    await db.from('user_votes').insert({ user_id: user.id, clash_id: currentClashId, vote_option: opt });
    await db.from('clashes').update({ votes_a: clashData.va, votes_b: clashData.vb }).eq('id', currentClashId);
}

function showResults() {
    const t = clashData.va + clashData.vb;
    const pa = t === 0 ? 0 : Math.round((clashData.va / t) * 100);
    const pb = t === 0 ? 0 : Math.round((clashData.vb / t) * 100);
    document.getElementById('bar-a').style.width = pa + '%';
    document.getElementById('bar-b').style.width = pb + '%';
    document.getElementById('perc-a').innerText = pa + '%';
    document.getElementById('perc-b').innerText = pb + '%';
    document.getElementById('clash-section').classList.add('voted');
}

// ==========================================
// 7. UTILS & UI
// ==========================================
function switchTab(tab, btn) {
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    ['oracle', 'clash', 'party', 'judgment', 'profile', 'admin'].forEach(s => {
        const el = document.getElementById(s + '-section');
        if (el) el.classList.remove('active-section');
    });
    document.getElementById(tab + '-section').classList.add('active-section');
    if (tab === 'clash') loadClash();
}

function renderProfile() {
    document.getElementById('profile-name').value = user.username;
    document.getElementById('profile-avatar').innerText = user.avatar;
    document.getElementById('stat-streak').innerText = user.streak;
    document.getElementById('stat-votes').innerText = user.votes_cast;
}

function saveProfile() {
    user.username = document.getElementById('profile-name').value;
    localStorage.setItem('profile_name', user.username);
    db.from('profiles').update({ username: user.username }).eq('id', user.id).then();
}

function toggleAvatar() { 
    const s = document.getElementById('avatar-selector'); 
    s.style.display = s.style.display === 'none' ? 'grid' : 'none'; 
}

function setAvatar(av) {
    user.avatar = av;
    localStorage.setItem('profile_avatar', av);
    renderProfile();
    toggleAvatar();
    db.from('profiles').update({ avatar: av }).eq('id', user.id).then();
}

async function sendSuggestion() {
    const t = document.getElementById('sug-text').value;
    if (t) { await db.from('suggestions').insert([{ text: t, category: 'Mix' }]); alert("Enviado"); document.getElementById('suggestionModal').style.display='none'; }
}

function share(t) { alert("Captura guardada."); }

// AUDIO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
    try {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        if (type === 'click') { o.frequency.setValueAtTime(600, t); g.gain.exponentialRampToValueAtTime(0.01, t + 0.1); o.start(t); o.stop(t + 0.1); }
        else { o.type = 'triangle'; g.gain.setValueAtTime(0.05, t); g.gain.linearRampToValueAtTime(0, t + 0.15); o.start(t); o.stop(t + 0.15); }
    } catch(e) {}
}