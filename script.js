// ==========================================
// 1. CONFIGURACIÓN Y SEGURIDAD
// ==========================================
window.onerror = function(msg, url, line) {
    console.error("Error Detectado: " + msg + "\nLínea: " + line);
};

const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

// Check Supabase
if (typeof supabase === 'undefined') {
    alert("Error Crítico: No se pudo cargar la librería Supabase. Recarga la página.");
    throw new Error("Supabase undefined");
}

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. DICCIONARIOS
// ==========================================
const imposterWords = [
    "Hospital", "Cementerio", "Escuela", "Cárcel", "Playa", "Cine", "Discoteca", "Gimnasio", "Biblioteca", "Aeropuerto",
    "Supermercado", "Restaurante", "Iglesia", "Zoológico", "Circo", "Museo", "Piscina", "Banco", "Hotel", "Farmacia",
    "Teléfono", "Cuchara", "Inodoro", "Cama", "Espejo", "Reloj", "Llave", "Gafas", "Zapato", "Calcetín",
    "Pizza", "Sushi", "Hamburguesa", "Huevo", "Pan", "Queso", "Chocolate", "Helado", "Plátano", "Manzana",
    "Perro", "Gato", "Ratón", "León", "Tigre", "Elefante", "Jirafa", "Mono", "Gorila", "Oso",
    "Policía", "Ladrón", "Médico", "Enfermero", "Bombero", "Profesor", "Alumno", "Cocinero", "Camarero", "Piloto"
];

const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No da la felicidad" },
    { title: "Redes Sociales", a: "Beneficiosas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "Versión Original" },
    { title: "Vacaciones", a: "Playa", b: "Montaña" },
    { title: "Mentiras", a: "Piadosas son útiles", b: "Siempre la verdad" },
    { title: "Futuro", a: "Optimista", b: "Pesimista" },
    { title: "Trabajo", a: "Remoto", b: "Presencial" },
    { title: "Amor", a: "A primera vista", b: "Se construye" },
    { title: "Videojuegos", a: "Arte", b: "Pérdida de tiempo" },
    { title: "Aliens", a: "Existen", b: "Estamos solos" },
    { title: "Música", a: "Antigua era mejor", b: "Actual es mejor" },
    { title: "Moda", a: "Seguir tendencias", b: "Tener estilo propio" },
    { title: "Inteligencia Artificial", a: "Peligro", b: "Oportunidad" }
];

// ==========================================
// 3. ESTADO GLOBAL
// ==========================================
let currentUser = {
    id: localStorage.getItem('user_uuid') || null,
    name: localStorage.getItem('profile_name') || 'Anónimo',
    avatar: localStorage.getItem('profile_avatar') || '🦊',
    streak: parseInt(localStorage.getItem('streak') || 0),
    votes: parseInt(localStorage.getItem('profile_votes') || 0)
};

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
let selectedGameMode = 'classic';

// ==========================================
// 4. SONIDO
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    const now = audioCtx.currentTime;

    if (type === 'click') {
        osc.frequency.setValueAtTime(600, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
        if(navigator.vibrate) navigator.vibrate(5);
    } 
    else if (type === 'swoosh') {
        osc.type = 'triangle'; 
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    }
    else if (type === 'success') { 
        [440, 554, 659].forEach((f, i) => {
            const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
            o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f;
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.5 + (i*0.1));
            o.start(now); o.stop(now + 0.5);
        });
    }
}

// ==========================================
// 5. MODO FIESTA (CORE)
// ==========================================
function selectGameMode(mode) {
    playSfx('click');
    selectedGameMode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    const btn = document.getElementById('mode-' + mode);
    if(btn) btn.classList.add('selected');
}

async function createRoom() {
    if(!currentUser.id) return alert("Espera a que cargue tu perfil (o refresca).");
    playSfx('click');
    
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    const { error } = await db.from('rooms').insert({ 
        id: code, 
        host_id: currentUser.id, 
        current_card_text: "¡Sala Creada!", 
        current_card_category: "Esperando...",
        gamemode: selectedGameMode
    });
    
    if(error) {
        console.error(error);
        return alert("Error creando sala. Comprueba tu conexión.");
    }
    
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'civilian' });
    currentRoomId = code; isHost = true; enterPartyMode(code, selectedGameMode);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código incorrecto (4 letras).");
    playSfx('click');
    
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no encontrada.");
    
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'civilian' });
    currentRoomId = code; isHost = false; 
    enterPartyMode(code, data.gamemode);
}

function enterPartyMode(code, mode) {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = code;
    
    selectedGameMode = mode;
    updateGameUI(mode);

    if(isHost) { 
        document.getElementById('host-controls').style.display = 'block'; 
        document.getElementById('guest-controls').style.display = 'none'; 
    } else { 
        document.getElementById('host-controls').style.display = 'none'; 
        document.getElementById('guest-controls').style.display = 'block'; 
    }

    if(roomSubscription) db.removeChannel(roomSubscription);
    roomSubscription = db.channel('room-'+code)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, (payload) => {
        handleRoomUpdate(payload.new);
    })
    .subscribe();

    if(!isHost) { 
        db.from('rooms').select('*').eq('id', code).single().then(({data}) => { 
            if(data) handleRoomUpdate(data);
        });
    }
}

function updateGameUI(mode) {
    // Ocultar todos
    ['classic', 'imposter', 'versus'].forEach(m => {
        const el = document.getElementById('party-card-' + m);
        if(el) el.style.display = 'none';
    });
    // Mostrar actual
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
        if(currentUser.id === roomData.imposter_id) updateImposterCard("🤫 ERES EL IMPOSTOR", "Nadie lo sabe. Disimula.");
        else updateImposterCard(roomData.current_card_text, "Palabra Secreta");
    }
    else if(selectedGameMode === 'versus') {
        updateVersusCard(roomData.current_card_text, roomData.current_card_category);
    }
}

function updateClassicCard(text, category) {
    const card = document.getElementById('party-card-classic');
    triggerFlash(card);
    const inner = card.querySelector('.card-inner');
    inner.style.opacity = '0';
    setTimeout(() => {
        document.getElementById('party-text').innerText = text;
        document.getElementById('party-cat').innerText = category;
        inner.style.opacity = '1';
    }, 200);
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
    // Si no tengo ID, no puedo calcular mi equipo.
    if(!currentUser.id) return;

    const card = document.getElementById('party-card-versus');
    triggerFlash(card);
    
    const parts = optionsStr ? optionsStr.split('|') : ["A", "B"];
    const optA = parts[0] || "A";
    const optB = parts[1] || "B";

    document.getElementById('versus-main-text').innerText = title;
    
    // Asignación de equipo determinista
    let sum = 0;
    for(let i=0; i<currentUser.id.length; i++) {
        sum += currentUser.id.charCodeAt(i);
    }
    const isTeamA = (sum % 2 === 0);

    const box = document.getElementById('versus-role-box');
    const roleText = document.getElementById('versus-role-text');

    box.classList.remove('team-a-style', 'team-b-style');
    if(isTeamA) {
        box.classList.add('team-a-style');
        roleText.innerText = "DEFENDER: " + optA;
    } else {
        box.classList.add('team-b-style');
        roleText.innerText = "DEFENDER: " + optB;
    }
}

function triggerFlash(element) {
    if(!element) return;
    element.classList.remove('flash-animation');
    void element.offsetWidth; // Trigger reflow
    element.classList.add('flash-animation');
    playSfx('swoosh');
    if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
}

// CONTROL DEL ANFITRIÓN
async function partyNextRound() {
    if(!isHost) return;
    playSfx('click');

    if(selectedGameMode === 'classic') {
        const random = allQuestions[Math.floor(Math.random() * allQuestions.length)];
        await db.from('rooms').update({ 
            current_card_text: random.text, 
            current_card_category: random.category 
        }).eq('id', currentRoomId);
    } 
    else if(selectedGameMode === 'imposter') {
        const secretWord = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        
        const { data: participants } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        
        let imposter = null;
        if(!participants || participants.length < 2) {
             imposter = currentUser.id; 
        } else {
            imposter = participants[Math.floor(Math.random() * participants.length)].user_id;
        }
        
        await db.from('rooms').update({
            current_card_text: secretWord, 
            imposter_id: imposter,
            game_state: 'playing'
        }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'versus') {
        const debate = debateTopics[Math.floor(Math.random() * debateTopics.length)];
        await db.from('rooms').update({ 
            current_card_text: debate.title, 
            current_card_category: `${debate.a}|${debate.b}` 
        }).eq('id', currentRoomId);
    }
}

function exitRoom() {
    if(roomSubscription) db.removeChannel(roomSubscription);
    if(currentRoomId && currentUser.id) {
        db.from('room_participants').delete().match({ room_id: currentRoomId, user_id: currentUser.id });
    }
    currentRoomId = null; isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
    document.getElementById('join-code').value = "";
}

// ==========================================
// CORE & UTILS (ADMIN, SHARE, INIT)
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
    const a = document.getElementById('admin-opt-a').value;
    const b = document.getElementById('admin-opt-b').value;
    if(!a || !b) return alert("Rellena todo.");
    const tom = new Date(); tom.setDate(tom.getDate() + 1); const d = tom.toISOString().split('T')[0];
    await db.from('clashes').delete().eq('publish_date', d);
    await db.from('clashes').insert({ option_a: a, option_b: b, publish_date: d, votes_a: 0, votes_b: 0 });
    alert("Programado.");
}
let adminJudgeId = null;
async function fetchAdminModeration() {
    const { data } = await db.from('suggestions').select('*').limit(1);
    if(data && data.length > 0) {
        adminJudgeId = data[0].id;
        document.getElementById('admin-sug-text').innerText = `(${data[0].category}) ${data[0].text}`;
    } else {
        document.getElementById('admin-sug-text').innerText = "Nada pendiente.";
        adminJudgeId = null;
    }
}
async function adminModerate(val) {
    if(!adminJudgeId) return;
    const { data: c } = await db.from('suggestions').select('*').eq('id', adminJudgeId).single();
    if(val===1) { await db.from('questions').insert([{ text: c.text, category: c.category }]); playSfx('success'); }
    await db.from('suggestions').delete().eq('id', adminJudgeId);
    fetchAdminModeration();
}
async function shareScreenshot(t) {
    playSfx('click');
    const captureDiv = document.getElementById('capture-stage');
    const textDiv = document.getElementById('capture-text');
    
    if(t==='oracle') textDiv.innerHTML = `"${document.getElementById('q-text').innerText}"`;
    else if(t==='clash') { 
        const w = clashData.va > clashData.vb ? clashData.a : clashData.b; 
        const p = (clashData.va+clashData.vb)===0?0:Math.round((Math.max(clashData.va,clashData.vb)/(clashData.va+clashData.vb))*100);
        textDiv.innerHTML = `Prefieren:<br><br><span style="color:#FFD700">${w}</span> (${p}%)`;
    }
    else if(t==='profile') textDiv.innerHTML = `Soy ${currentUser.name} ${currentUser.avatar}<br><br>Racha: ${currentUser.streak}`;

    try {
        const canvas = await html2canvas(captureDiv, { scale: 2, useCORS: true });
        canvas.toBlob(async blob => {
            const file = new File([blob], "totalkmon.png", { type: "image/png" });
            if (navigator.share) await navigator.share({ files: [file], title: 'Totalkmon' });
            else alert("Tu dispositivo no soporta compartir imágenes.");
        });
    } catch (err) { console.error(err); alert("Error generando imagen."); }
}

async function initUser() {
    if (!currentUser.id) {
        const { data } = await db.from('profiles').insert([{
            username: currentUser.name, avatar: currentUser.avatar, streak: 1, last_visit: new Date().toISOString()
        }]).select().single();
        if (data) { currentUser.id = data.id; localStorage.setItem('user_uuid', data.id); }
    } else {
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if (data) { currentUser.streak = data.streak; currentUser.votes = data.votes_cast; checkStreakCloud(data); }
    }
    updateProfileUI();
}
async function syncProfileToCloud() {
    if(currentUser.id) await db.from('profiles').update({
        username: currentUser.name, avatar: currentUser.avatar, streak: currentUser.streak, votes_cast: currentUser.votes
    }).eq('id', currentUser.id);
}
function checkStreakCloud(d) {
    const t = new Date().toISOString().split('T')[0];
    const l = d.last_visit ? d.last_visit.split('T')[0] : null;
    if (l !== t) {
        const y = new Date(); y.setDate(y.getDate() - 1);
        if (l === y.toISOString().split('T')[0]) currentUser.streak++;
        else currentUser.streak = 1;
        db.from('profiles').update({ last_visit: new Date().toISOString(), streak: currentUser.streak }).eq('id', currentUser.id);
        updateProfileUI();
    }
}

async function fetchQuestions() {
    const { data } = await db.from('questions').select('*').limit(50);
    if (data && data.length > 0) allQuestions = data;
    else allQuestions = [{text: "Bienvenido.", category: "Inicio"}];
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
            const random = pool[Math.floor(Math.random() * pool.length)];
            document.getElementById('q-text').innerText = random.text;
            document.getElementById('q-cat').innerText = random.category;
            el.style.opacity = '1';
        }, 200);
    }
}
function setCategory(c, b) {
    playSfx('click');
    currentCategory = c;
    document.querySelectorAll('.topic-chip').forEach(btn => btn.classList.remove('active'));
    if(b) b.classList.add('active');
    nextQuestion();
}
async function loadClash() {
    const t = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', t);
    if (!data || data.length === 0) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
    if (data && data.length > 0) {
        const c = data[0]; currentClashId = c.id;
        clashData = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        if (currentUser.id) {
            const { data: v } = await db.from('user_votes').select('*').eq('user_id', currentUser.id).eq('clash_id', currentClashId).single();
            if (v || localStorage.getItem('voted_' + c.id)) showResults(c.votes_a, c.votes_b);
        }
    }
}
async function voteClash(o) {
    if (!currentClashId || !currentUser.id || document.getElementById('clash-section').classList.contains('voted')) return;
    playSfx('click');
    let a = clashData.va, b = clashData.vb;
    if (o === 'a') a++; else b++;
    showResults(a, b);
    await db.from('user_votes').insert({ user_id: currentUser.id, clash_id: currentClashId, vote_option: o });
    await db.from('clashes').update({ votes_a: a, votes_b: b }).eq('id', currentClashId);
    localStorage.setItem('voted_' + currentClashId, 'true');
    currentUser.votes++;
    updateProfileUI();
    syncProfileToCloud();
}
function showResults(a, b) {
    const t = a + b;
    let pa = t === 0 ? 0 : Math.round((a / t) * 100);
    let pb = t === 0 ? 0 : Math.round((b / t) * 100);
    document.getElementById('bar-a').style.width = pa + '%';
    document.getElementById('bar-b').style.width = pb + '%';
    document.getElementById('perc-a').innerText = pa + '%';
    document.getElementById('perc-b').innerText = pb + '%';
    document.getElementById('clash-section').classList.add('voted');
}
async function fetchJudge() {
    const { data } = await db.from('suggestions').select('*').limit(5);
    if (data && data.length > 0) {
        const r = data[Math.floor(Math.random() * data.length)];
        currentJudgeId = r.id;
        document.getElementById('judge-text').innerText = r.text;
        document.getElementById('judge-cat').innerText = r.category;
    } else {
        document.getElementById('judge-text').innerText = "Nada pendiente.";
        currentJudgeId = null;
    }
}
async function voteJudgment(v) {
    if (!currentJudgeId) return;
    playSfx('click');
    const { data: c } = await db.from('suggestions').select('*').eq('id', currentJudgeId).single();
    if (!c) { fetchJudge(); return; }
    let nv = (c.votes || 0) + v;
    if (nv >= 5) {
        await db.from('questions').insert([{ text: c.text, category: c.category }]);
        await db.from('suggestions').delete().eq('id', currentJudgeId);
        playSfx('success');
    } else if (nv <= -5) {
        await db.from('suggestions').delete().eq('id', currentJudgeId);
    } else {
        await db.from('suggestions').update({ votes: nv }).eq('id', currentJudgeId);
    }
    currentUser.votes++;
    updateProfileUI();
    syncProfileToCloud();
    fetchJudge();
}
function updateProfileUI() {
    if (!document.getElementById('profile-name')) return;
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('streak-count').innerText = currentUser.streak;
    document.getElementById('stat-votes').innerText = currentUser.votes;
    localStorage.setItem('profile_name', currentUser.name);
    localStorage.setItem('profile_avatar', currentUser.avatar);
    localStorage.setItem('streak', currentUser.streak);
    localStorage.setItem('profile_votes', currentUser.votes);
    const l = Math.floor(currentUser.votes / 10) + 1;
    let t = "Novato";
    if (l > 5) t = "Juez";
    if (l > 20) t = "Oráculo";
    if (l > 50) t = "Dios";
    document.getElementById('profile-level').innerText = `Nivel ${l}: ${t}`;
}
function saveProfile() {
    const n = document.getElementById('profile-name').value;
    if (n.trim() === "") return;
    currentUser.name = n;
    updateProfileUI();
    syncProfileToCloud();
}
function toggleAvatarEdit() {
    const s = document.getElementById('avatar-selector');
    s.style.display = s.style.display === 'none' ? 'grid' : 'none';
    playSfx('click');
}
function setAvatar(e) {
    currentUser.avatar = e;
    document.getElementById('avatar-selector').style.display = 'none';
    playSfx('success');
    updateProfileUI();
    syncProfileToCloud();
}
async function sendSuggestion() {
    const t = document.getElementById('sug-text').value;
    const c = document.getElementById('sug-cat').value;
    if (!t) return;
    await db.from('suggestions').insert([{ text: t, category: c, votes: 0 }]);
    alert("Enviado.");
    closeModal();
    document.getElementById('sug-text').value = "";
}
function switchTab(t, el) {
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
    if (el) el.classList.add('active');
    ['oracle', 'clash', 'party', 'judgment', 'profile', 'admin'].forEach(s => {
        const sec = document.getElementById(s + '-section');
        if (sec) sec.classList.remove('active-section');
    });
    const target = document.getElementById(t + '-section');
    if (target) target.classList.add('active-section');
    if (t === 'clash') loadClash();
    if (t === 'judgment') fetchJudge();
    if (t === 'profile') updateProfileUI();
}
function openModal() { document.getElementById('suggestionModal').style.display = 'flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display = 'none'; }
function openStreakModal() {
    document.getElementById('modal-streak-count').innerText = currentUser.streak;
    document.getElementById('streakModal').style.display = 'flex';
    playSfx('click');
}
function closeStreakModal() { document.getElementById('streakModal').style.display = 'none'; }

const pc = document.getElementById('particles');
for (let i = 0; i < 20; i++) {
    let p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + '%';
    p.style.width = p.style.height = (Math.random() * 5 + 2) + 'px';
    p.style.animationDelay = Math.random() * 5 + 's';
    p.style.animationDuration = (Math.random() * 10 + 15) + 's';
    pc.appendChild(p);
}

document.addEventListener('DOMContentLoaded', () => { initUser(); fetchQuestions(); });