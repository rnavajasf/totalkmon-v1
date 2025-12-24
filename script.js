// ==========================================
// CONFIGURACIÓN Y ESTADO
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

const imposterWords = ["Hospital", "Escuela", "Playa", "Cine", "Gimnasio", "Aeropuerto", "Supermercado", "Restaurante", "Zoológico", "Hotel", "Teléfono", "Cuchara", "Inodoro", "Cama", "Reloj", "Pizza", "Sushi", "Hamburguesa", "Chocolate", "Perro", "Gato", "León", "Policía", "Médico", "Bombero"];
const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No la da" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "V.O." },
    { title: "Vacaciones", a: "Playa", b: "Montaña" }
];

// Objeto GLOBAL para acceso desde HTML
const app = {
    user: { id: null, name: 'Anónimo', avatar: '🦊', streak: 0, votes: 0 },
    room: { id: null, isHost: false, sub: null, mode: 'classic' },
    questions: [],
    category: 'Mix',
    clash: { id: null, data: {} }
};

// ==========================================
// 1. ARRANQUE BLINDADO (AUTOCORRECCIÓN)
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    updateLog("Conectando...");
    
    // 1. Recuperar identidad local
    let storedId = localStorage.getItem('user_uuid');
    let storedName = localStorage.getItem('profile_name') || 'Anónimo';
    let storedAvatar = localStorage.getItem('profile_avatar') || '🦊';

    try {
        // 2. VERIFICACIÓN CRÍTICA EN DB (Evita usuarios fantasma)
        if (storedId) {
            updateLog("Verificando usuario...");
            const { data, error } = await db.from('profiles').select('*').eq('id', storedId).single();
            
            if (!data || error) {
                // EL ERROR OCURRIA AQUI: El ID local no existía en la DB nueva
                console.warn("Usuario local inválido. Regenerando...");
                storedId = null; 
                localStorage.removeItem('user_uuid');
            } else {
                app.user.id = data.id;
                app.user.streak = data.streak;
                app.user.votes = data.votes_cast;
            }
        }

        // 3. CREACIÓN SI NO EXISTE
        if (!storedId) {
            updateLog("Creando perfil...");
            const { data, error } = await db.from('profiles').insert([{ username: storedName, avatar: storedAvatar }]).select().single();
            if (error) throw error;
            app.user.id = data.id;
            localStorage.setItem('user_uuid', data.id);
        }

        app.user.name = storedName;
        app.user.avatar = storedAvatar;
        
        // 4. CARGA DE DATOS
        updateLog("Descargando contenido...");
        await fetchQuestions();
        await loadClash();
        renderProfile();

        // 5. APERTURA
        document.getElementById('loading-overlay').style.display = 'none';

    } catch (err) {
        document.getElementById('loading-status').innerText = "ERROR FATAL";
        document.getElementById('error-log').innerText = err.message;
        document.getElementById('error-log').style.display = 'block';
        document.getElementById('btn-force-reset').style.display = 'block';
    }
});

function updateLog(msg) { document.getElementById('loading-status').innerText = msg; }
function forceReset() { localStorage.clear(); location.reload(); }

// ==========================================
// 2. LÓGICA DE JUEGO (MODO FIESTA)
// ==========================================
app.selectMode = (mode) => {
    playSfx('click');
    app.room.mode = mode;
    document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
    document.getElementById('mode-' + mode).classList.add('selected');
};

app.createRoom = async () => {
    playSfx('click');
    const code = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    // IMPORTANTE: host_id asegura que tienes permiso
    const { error } = await db.from('rooms').insert({ 
        id: code, host_id: app.user.id, 
        current_card_text: "Sala Lista", current_card_category: "...", 
        gamemode: app.room.mode, game_state: 'waiting' 
    });

    if (error) return alert("Error DB: " + error.message);

    // Upsert para unirme como host
    await db.from('room_participants').upsert({ room_id: code, user_id: app.user.id, role: 'spectator' });
    
    app.room.id = code; app.room.isHost = true;
    enterPartyMode();
};

app.joinRoom = async () => {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if (code.length !== 4) return alert("Código incorrecto");
    playSfx('click');
    
    const { data, error } = await db.from('rooms').select('*').eq('id', code).single();
    if (error || !data) return alert("Sala no encontrada");
    
    await db.from('room_participants').upsert({ room_id: code, user_id: app.user.id, role: 'spectator' });
    
    app.room.id = code; app.room.isHost = false; app.room.mode = data.gamemode;
    enterPartyMode();
};

function enterPartyMode() {
    document.getElementById('party-lobby').style.display = 'none';
    document.getElementById('party-active').style.display = 'block';
    document.getElementById('display-room-code').innerText = app.room.id;
    updateGameUI();

    document.getElementById('host-controls').style.display = app.room.isHost ? 'block' : 'none';
    document.getElementById('guest-controls').style.display = app.room.isHost ? 'none' : 'block';

    if (app.room.sub) db.removeChannel(app.room.sub);
    app.room.sub = db.channel('room-' + app.room.id)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${app.room.id}` }, payload => {
            handleRoomUpdate(payload.new);
        })
        .subscribe();
        
    // Fetch inicial
    db.from('rooms').select('*').eq('id', app.room.id).single().then(({data}) => { if(data) handleRoomUpdate(data); });
}

function updateGameUI() {
    ['classic', 'imposter', 'versus'].forEach(m => document.getElementById('party-card-' + m).style.display = 'none');
    document.getElementById('party-card-' + app.room.mode).style.display = 'flex';
}

async function handleRoomUpdate(room) {
    if (room.gamemode !== app.room.mode) {
        app.room.mode = room.gamemode;
        updateGameUI();
    }
    
    triggerFlash();

    if (app.room.mode === 'classic') {
        document.getElementById('party-text').innerText = room.current_card_text;
        document.getElementById('party-cat').innerText = room.current_card_category;
    } else if (app.room.mode === 'imposter') {
        const el = document.getElementById('imposter-role-text');
        el.style.filter = 'blur(15px)';
        if (app.user.id === room.imposter_id) el.innerText = "🤫 ERES EL IMPOSTOR";
        else el.innerText = room.current_card_text;
    } else if (app.room.mode === 'versus') {
        document.getElementById('versus-main-text').innerText = room.current_card_text;
        fetchVersusRole(room.current_card_category, 3); // Reintentos
    }
}

async function fetchVersusRole(catStr, retries) {
    const { data } = await db.from('room_participants').select('role').match({room_id: app.room.id, user_id: app.user.id}).single();
    const box = document.getElementById('versus-role-box');
    const txt = document.getElementById('versus-role-text');
    const opts = catStr.split('|');
    
    box.classList.remove('team-a-style', 'team-b-style');
    if (data && data.role === 'team_a') { box.classList.add('team-a-style'); txt.innerText = "DEFENDER: " + (opts[0]||'A'); }
    else if (data && data.role === 'team_b') { box.classList.add('team-b-style'); txt.innerText = "DEFENDER: " + (opts[1]||'B'); }
    else {
        if (retries > 0) setTimeout(() => fetchVersusRole(catStr, retries - 1), 500);
        else txt.innerText = "ESPERANDO...";
    }
}

app.partyNextRound = async () => {
    if (!app.room.isHost) return;
    playSfx('click');
    
    if (app.room.mode === 'classic') {
        const r = app.questions[Math.floor(Math.random() * app.questions.length)];
        await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', app.room.id);
    } else if (app.room.mode === 'imposter') {
        const w = imposterWords[Math.floor(Math.random() * imposterWords.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', app.room.id);
        let imp = app.user.id;
        if (ps.length) imp = ps[Math.floor(Math.random() * ps.length)].user_id;
        await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', app.room.id);
    } else if (app.room.mode === 'versus') {
        const t = debateTopics[Math.floor(Math.random() * debateTopics.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', app.room.id);
        if (ps.length) {
            for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
            const updates = ps.map((p, i) => db.from('room_participants').update({ role: i % 2 === 0 ? 'team_a' : 'team_b' }).match({room_id: app.room.id, user_id: p.user_id}));
            await Promise.all(updates);
        }
        setTimeout(async () => {
            await db.from('rooms').update({ current_card_text: t.title, current_card_category: t.a+"|"+t.b }).eq('id', app.room.id);
        }, 200);
    }
};

app.exitRoom = () => {
    if (app.room.sub) db.removeChannel(app.room.sub);
    app.room.id = null; app.room.isHost = false;
    document.getElementById('party-lobby').style.display = 'block';
    document.getElementById('party-active').style.display = 'none';
};

// ==========================================
// 3. CORE (ORACULO & UTILS)
// ==========================================
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*').limit(2000);
    if (data && data.length) app.questions = data;
    else app.questions = [{text: "Hola", category: "Mix"}];
    app.nextQuestion();
}

app.nextQuestion = () => {
    let pool = app.questions;
    if (app.category.toLowerCase() !== 'mix' && app.category.toLowerCase() !== 'aleatorio') {
        pool = app.questions.filter(q => q.category && q.category.toLowerCase() === app.category.toLowerCase());
    }
    if (pool.length === 0) pool = app.questions;
    
    const r = pool[Math.floor(Math.random() * pool.length)];
    document.getElementById('q-text').innerText = r.text;
    document.getElementById('q-cat').innerText = r.category;
};

app.setCategory = (cat, btn) => {
    playSfx('click');
    app.category = cat;
    document.querySelectorAll('.topic-chip').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    app.nextQuestion();
};

app.switchTab = (tab, btn) => {
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
    ['oracle', 'clash', 'party', 'judgment', 'profile', 'admin'].forEach(s => document.getElementById(s + '-section').classList.remove('active-section'));
    document.getElementById(tab + '-section').classList.add('active-section');
    if (tab === 'clash') loadClash();
};

// ==========================================
// 4. DILEMA & PERFIL
// ==========================================
async function loadClash() {
    const t = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', t);
    if (!data || !data.length) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
    
    if (data && data.length) {
        const c = data[0];
        app.clash.id = c.id;
        app.clash.data = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        if (localStorage.getItem('voted_' + c.id)) showResults();
    }
}

app.voteClash = async (opt) => {
    if (document.getElementById('clash-section').classList.contains('voted')) return;
    playSfx('click');
    if (opt === 'a') app.clash.data.va++; else app.clash.data.vb++;
    showResults();
    localStorage.setItem('voted_' + app.clash.id, 'true');
    await db.from('user_votes').insert({ user_id: app.user.id, clash_id: app.clash.id, vote_option: opt });
    await db.from('clashes').update({ votes_a: app.clash.data.va, votes_b: app.clash.data.vb }).eq('id', app.clash.id);
};

function showResults() {
    const t = app.clash.data.va + app.clash.data.vb;
    const pa = t === 0 ? 0 : Math.round((app.clash.data.va / t) * 100);
    const pb = t === 0 ? 0 : Math.round((app.clash.data.vb / t) * 100);
    document.getElementById('bar-a').style.width = pa + '%'; document.getElementById('bar-b').style.width = pb + '%';
    document.getElementById('perc-a').innerText = pa + '%'; document.getElementById('perc-b').innerText = pb + '%';
    document.getElementById('clash-section').classList.add('voted');
}

function renderProfile() {
    document.getElementById('profile-name').value = app.user.name;
    document.getElementById('profile-avatar').innerText = app.user.avatar;
    document.getElementById('stat-streak').innerText = app.user.streak;
    document.getElementById('stat-votes').innerText = app.user.votes;
}

app.saveProfile = () => {
    app.user.name = document.getElementById('profile-name').value;
    localStorage.setItem('profile_name', app.user.name);
    db.from('profiles').update({ username: app.user.name }).eq('id', app.user.id).then();
};

app.toggleAvatarEdit = () => { const s = document.getElementById('avatar-selector'); s.style.display = s.style.display === 'none' ? 'grid' : 'none'; };
app.setAvatar = (av) => { 
    app.user.avatar = av; localStorage.setItem('profile_avatar', av);
    renderProfile(); app.toggleAvatarEdit(); 
    db.from('profiles').update({ avatar: av }).eq('id', app.user.id).then();
};

// EXTRAS
app.openModal = () => document.getElementById('suggestionModal').style.display='flex';
app.closeModal = () => document.getElementById('suggestionModal').style.display='none';
app.sendSuggestion = async () => { 
    const t = document.getElementById('sug-text').value; 
    if(t) { await db.from('suggestions').insert([{text:t, category:'Mix'}]); alert("Enviado"); app.closeModal(); }
};
app.share = (t) => alert("Captura guardada.");

// AUDIO & FX
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    if(audioCtx.state==='suspended') audioCtx.resume().catch(()=>{});
    try {
        const o=audioCtx.createOscillator(); const g=audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        const t=audioCtx.currentTime;
        if(type==='click'){o.frequency.setValueAtTime(600,t);g.gain.exponentialRampToValueAtTime(0.01,t+0.1);o.start(t);o.stop(t+0.1);}
        else{o.type='triangle';g.gain.setValueAtTime(0.05,t);g.gain.linearRampToValueAtTime(0,t+0.15);o.start(t);o.stop(t+0.15);}
    }catch(e){}
}
function triggerFlash() { 
    const el = document.querySelector('.card-container');
    el.classList.remove('flash-animation'); void el.offsetWidth; el.classList.add('flash-animation'); playSfx('swoosh');
}

// EXPOSE TO WINDOW
window.app = app;