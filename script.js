// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. ESTADO
// ==========================================
let user = { id: null, name: 'Anónimo' };
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';
let allQuestions = [];
let currentCategory = 'Mix';
let clashData = { id: null, a: '', b: '', va: 0, vb: 0 };

const imposterWords = ["Hospital", "Escuela", "Playa", "Cine", "Gimnasio", "Aeropuerto", "Cárcel"];

// ==========================================
// 3. INICIO INMEDIATO (OPTIMISTIC UI)
// ==========================================
window.onload = async () => {
    // 1. Cargar UI Local inmediatamente
    const localName = localStorage.getItem('profile_name');
    if (localName) {
        user.name = localName;
        document.getElementById('profile-name').value = localName;
        document.getElementById('profile-name-display').innerText = localName;
    }

    // 2. Gestión de ID en segundo plano (Silent Login)
    let uid = localStorage.getItem('user_uuid');
    if (!uid) {
        uid = crypto.randomUUID();
        localStorage.setItem('user_uuid', uid);
    }
    user.id = uid;

    // 3. Asegurar usuario en DB (Upsert sin esperar)
    db.from('profiles').upsert({ id: uid, username: user.name }).then(() => console.log("User sync OK"));

    // 4. Cargar contenido
    await fetchQuestions();
    await loadClash();
};

// ==========================================
// 4. ORACULO (SIMPLIFICADO)
// ==========================================
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*').limit(2000);
    if (data && data.length > 0) allQuestions = data;
    else allQuestions = [{text:"Cargando...", category:"Mix"}];
    nextQuestion();
}

function nextQuestion() {
    let pool = allQuestions;
    if (currentCategory.toLowerCase() !== 'mix') {
        pool = allQuestions.filter(q => q.category && q.category.toLowerCase() === currentCategory.toLowerCase());
    }
    if (pool.length === 0) pool = allQuestions;
    
    const r = pool[Math.floor(Math.random() * pool.length)];
    if(r) {
        document.getElementById('q-text').innerText = r.text;
        document.getElementById('q-cat').innerText = r.category;
        triggerFlash();
    }
}

function setCategory(cat, btn) {
    currentCategory = cat;
    document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    nextQuestion();
}

// ==========================================
// 5. MODO FIESTA (CLÁSICO + IMPOSTOR)
// ==========================================
function selectGameMode(mode) {
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('mode-' + mode).classList.add('selected');
}

async function createRoom() {
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    await db.from('rooms').insert({ 
        id: code, 
        host_id: user.id, 
        current_card_text: "Sala Lista", 
        current_card_category: "...", 
        gamemode: selectedGameMode, 
        game_state: 'waiting' 
    });
    
    joinRoomProcess(code, true);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if (code.length !== 4) return alert("Código incorrecto");
    
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if (!data) return alert("Sala no existe");
    
    selectedGameMode = data.gamemode;
    joinRoomProcess(code, data.host_id === user.id);
}

async function joinRoomProcess(code, hostStatus) {
    currentRoomId = code;
    isHost = hostStatus;
    
    // Unirse sin bloquear
    db.from('room_participants').upsert({ room_id: code, user_id: user.id, role: 'spectator' }).then();

    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    
    updateGameUI();
    document.getElementById('host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('guest-controls').style.display = isHost ? 'none' : 'block';

    if (roomSubscription) db.removeChannel(roomSubscription);
    roomSubscription = db.channel('room-' + code)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, payload => {
            handleRoomUpdate(payload.new);
        })
        .subscribe();
        
    // Carga inicial
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(data) handleRoomUpdate(data);
}

function handleRoomUpdate(room) {
    if (room.gamemode !== selectedGameMode) {
        selectedGameMode = room.gamemode;
        updateGameUI();
    }
    
    triggerFlash();

    if (selectedGameMode === 'classic') {
        document.getElementById('party-text').innerText = room.current_card_text;
        document.getElementById('party-cat').innerText = room.current_card_category;
    } else if (selectedGameMode === 'imposter') {
        const el = document.getElementById('imposter-role-text');
        el.style.filter = 'blur(15px)';
        if (user.id === room.imposter_id) el.innerText = "🤫 ERES EL IMPOSTOR";
        else el.innerText = room.current_card_text;
    }
}

function updateGameUI() {
    document.getElementById('party-card-classic').style.display = 'none';
    document.getElementById('party-card-imposter').style.display = 'none';
    document.getElementById('party-card-' + selectedGameMode).style.display = 'flex';
}

async function partyNextRound() {
    if (!isHost) return;
    
    if (selectedGameMode === 'classic') {
        const r = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', currentRoomId);
    } else if (selectedGameMode === 'imposter') {
        const w = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        let imp = user.id;
        if (ps && ps.length > 0) imp = ps[Math.floor(Math.random() * ps.length)].user_id;
        await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', currentRoomId);
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
// 6. DILEMA & UTILS
// ==========================================
async function loadClash() {
    const t = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', t);
    if (!data || !data.length) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
    
    if (data && data.length) {
        const c = data[0];
        clashData = { id: c.id, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        if (localStorage.getItem('voted_' + c.id)) showResults();
    }
}

async function voteClash(opt) {
    if (document.getElementById('clash-section').classList.contains('voted')) return;
    if (opt === 'a') clashData.va++; else clashData.vb++;
    showResults();
    localStorage.setItem('voted_' + clashData.id, 'true');
    await db.from('user_votes').insert({ user_id: user.id, clash_id: clashData.id, vote_option: opt });
    await db.from('clashes').update({ votes_a: clashData.va, votes_b: clashData.vb }).eq('id', clashData.id);
}

function showResults() {
    const t = clashData.va + clashData.vb;
    const pa = t === 0 ? 0 : Math.round((clashData.va / t) * 100);
    const pb = t === 0 ? 0 : Math.round((clashData.vb / t) * 100);
    document.getElementById('bar-a').style.width = pa + '%';
    document.getElementById('bar-b').style.width = pb + '%';
    document.getElementById('perc-a').innerText = pa + '%';
    document.getElementById('perc-b').innerText = pb + '%';
}

function switchTab(tab, btn) {
    document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    ['oracle', 'clash', 'party', 'profile'].forEach(s => document.getElementById('section-' + s).classList.remove('active-section'));
    document.getElementById('section-' + tab).classList.add('active-section');
    if (tab === 'clash') loadClash();
}

function saveProfile() {
    user.name = document.getElementById('profile-name').value;
    localStorage.setItem('profile_name', user.name);
    db.from('profiles').update({ username: user.name }).eq('id', user.id).then();
}

function triggerFlash() {
    const el = document.querySelector('.card-container');
    el.classList.remove('flash-animation');
    void el.offsetWidth;
    el.classList.add('flash-animation');
}