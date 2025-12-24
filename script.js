// ==========================================
// 1. CLASE AUDIO MANAGER (EXCELENCIA V29)
// ==========================================
class AudioManager {
    constructor() {
        this.ctx = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
            this.ctx = new AudioContext();
            this.initialized = true;
            // Desbloqueo silencioso para iOS
            this.playTone(0, 0, 0); 
        }
    }

    playTone(freq, type, duration) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            const now = this.ctx.currentTime;
            osc.frequency.setValueAtTime(freq, now);
            
            // Envelope simple
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
            
            osc.start(now);
            osc.stop(now + duration);
        } catch (e) { console.warn("Audio Error", e); }
    }

    // Efectos de Sonido
    click() {
        if (!this.initialized) this.init();
        this.playTone(600, 'sine', 0.1);
        if (navigator.vibrate) navigator.vibrate(5); // Haptic
    }

    swoosh() {
        if (!this.initialized) this.init();
        // Simulación de swoosh con tono descendente
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        const now = this.ctx.currentTime;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(50, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
        if (navigator.vibrate) navigator.vibrate([10, 30]); // Haptic doble
    }

    success() {
        if (!this.initialized) this.init();
        // Acorde Mayor
        this.playTone(440, 'sine', 0.3); // A4
        setTimeout(() => this.playTone(554, 'sine', 0.3), 100); // C#5
        setTimeout(() => this.playTone(659, 'sine', 0.4), 200); // E5
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]); // Haptic triple
    }
}

const audioManager = new AudioManager();

// Wrapper global para compatibilidad
function playSfx(type) {
    if (type === 'click') audioManager.click();
    else if (type === 'swoosh') audioManager.swoosh();
    else if (type === 'success') audioManager.success();
}

// ==========================================
// 2. CONFIGURACIÓN SUPABASE (TUS CLAVES)
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 3. ESTADO & DATOS
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

let currentUser = { id: localStorage.getItem('u_id'), name: localStorage.getItem('u_name')||'Anónimo', avatar: localStorage.getItem('u_av')||'🦊', streak: 0, votes: 0 };
let currentRoomId = null;
let isHost = false;
let roomSubscription = null;
let selectedGameMode = 'classic';
let allQuestions = [];
let currentCategory = 'aleatorio';
let currentClashId = null;
let currentJudgeId = null;
let clashData = { a: '', b: '', va: 0, vb: 0 };
let adminTapCount = 0;

// ==========================================
// 4. INIT & EVENTS
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
    // Interacción inicial para desbloquear Audio
    document.body.addEventListener('click', () => audioManager.init(), { once: true });
    document.body.addEventListener('touchstart', () => audioManager.init(), { once: true });

    updateProfileUI(); // Carga rápida
    await initUser();
    await fetchQuestions();
    
    // Listeners UI Globales
    setupEventListeners();
});

function setupEventListeners() {
    // Dock
    document.querySelectorAll('.dock-item').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab, btn));
    });
    // Oracle
    document.querySelector('.interactive-card').addEventListener('click', () => { nextQuestion(); playSfx('swoosh'); });
    document.querySelectorAll('.topic-chip').forEach(chip => {
        chip.addEventListener('click', () => setCategory(chip.dataset.cat, chip));
    });
    // Dilema
    document.getElementById('btn-vote-a').addEventListener('click', () => voteClash('a'));
    document.getElementById('btn-vote-b').addEventListener('click', () => voteClash('b'));
    // Party
    document.getElementById('btn-create-room').addEventListener('click', createRoom);
    document.getElementById('btn-join-room').addEventListener('click', joinRoom);
    document.getElementById('btn-exit-room').addEventListener('click', exitRoom);
    document.querySelectorAll('.mode-option').forEach(opt => {
        opt.addEventListener('click', () => selectGameMode(opt.dataset.mode));
    });
}

// ==========================================
// 5. USUARIO
// ==========================================
async function initUser() {
    if (!currentUser.id) {
        const { data } = await db.from('profiles').insert([{ username: currentUser.name, avatar: currentUser.avatar, last_visit: new Date().toISOString() }]).select().single();
        if(data) { currentUser.id = data.id; localStorage.setItem('u_id', data.id); }
    } else {
        const { data } = await db.from('profiles').select('*').eq('id', currentUser.id).single();
        if(data) { currentUser.streak = data.streak || 0; currentUser.votes = data.votes_cast || 0; updateProfileUI(); }
        else { localStorage.removeItem('u_id'); currentUser.id = null; await initUser(); }
    }
}
function updateProfileUI() {
    if(!document.getElementById('profile-name')) return;
    document.getElementById('profile-name').value = currentUser.name;
    document.getElementById('profile-avatar').innerText = currentUser.avatar;
    document.getElementById('stat-streak').innerText = currentUser.streak;
    document.getElementById('streak-count').innerText = currentUser.streak;
    document.getElementById('stat-votes').innerText = currentUser.votes;
    document.getElementById('profile-level').innerText = "Nivel " + (Math.floor(currentUser.votes/10)+1);
    localStorage.setItem('u_name', currentUser.name);
    localStorage.setItem('u_av', currentUser.avatar);
}

// ==========================================
// 6. MODO FIESTA
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
    
    await db.from('rooms').insert({ id: code, host_id: currentUser.id, current_card_text: "Sala Lista", current_card_category: "Esperando...", gamemode: selectedGameMode, game_state: 'waiting' });
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'spectator' });
    
    currentRoomId = code; isHost = true; enterPartyMode(code);
}

async function joinRoom() {
    const code = document.getElementById('join-code').value.toUpperCase().trim();
    if(code.length !== 4) return alert("Código incorrecto");
    playSfx('click');
    
    const { data } = await db.from('rooms').select('*').eq('id', code).single();
    if(!data) return alert("Sala no existe");
    
    await db.from('room_participants').insert({ room_id: code, user_id: currentUser.id, role: 'spectator' });
    
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
        
    if(!isHost) db.from('rooms').select('*').eq('id', code).single().then(({data}) => { if(data) handleRoomUpdate(data); });
}

function updateGameUI() {
    ['classic', 'imposter', 'versus'].forEach(m => document.getElementById('party-card-' + m).style.display = 'none');
    document.getElementById('party-card-' + selectedGameMode).style.display = 'flex';
}

async function handleRoomUpdate(room) {
    if(room.gamemode !== selectedGameMode) { selectedGameMode = room.gamemode; updateGameUI(); }
    
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
        const { data } = await db.from('room_participants').select('role').match({room_id: currentRoomId, user_id: currentUser.id}).single();
        const roleText = document.getElementById('versus-role-text');
        const box = document.getElementById('versus-role-box');
        const opts = room.current_card_category.split('|');
        
        box.classList.remove('team-a-style', 'team-b-style');
        if(data && data.role === 'team_a') { box.classList.add('team-a-style'); roleText.innerText = "DEFENDER: " + opts[0]; }
        else if(data && data.role === 'team_b') { box.classList.add('team-b-style'); roleText.innerText = "DEFENDER: " + opts[1]; }
        else roleText.innerText = "ESPERANDO...";
    }
}

// HOST LOGIC (VERSUS LOCAL CALCULATION)
async function partyNextRound() {
    if(!isHost) return;
    playSfx('click');
    
    if(selectedGameMode === 'classic') {
        const r = allQuestions[Math.floor(Math.random()*allQuestions.length)];
        await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'imposter') {
        const word = imposterWords[Math.floor(Math.random()*imposterWords.length)];
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        const imp = ps && ps.length > 0 ? ps[Math.floor(Math.random()*ps.length)].user_id : currentUser.id;
        await db.from('rooms').update({ current_card_text: word, imposter_id: imp }).eq('id', currentRoomId);
    }
    else if(selectedGameMode === 'versus') {
        const topic = debateTopics[Math.floor(Math.random()*debateTopics.length)];
        // REPARTO DE EQUIPOS (JUSTO)
        const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', currentRoomId);
        if(ps && ps.length > 0) {
            for(let i=ps.length-1; i>0; i--) { const j=Math.floor(Math.random()*(i+1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
            const updates = ps.map((p, idx) => {
                const team = idx % 2 === 0 ? 'team_a' : 'team_b';
                return db.from('room_participants').update({ role: team }).match({room_id: currentRoomId, user_id: p.user_id});
            });
            await Promise.all(updates);
        }
        await db.from('rooms').update({ current_card_text: topic.title, current_card_category: topic.a + "|" + topic.b }).eq('id', currentRoomId);
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

// ==========================================
// 7. CORE UI
// ==========================================
async function fetchQuestions() { const { data } = await db.from('questions').select('*').limit(50); if(data) allQuestions = data; else allQuestions=[{text:"Hola",category:"Inicio"}]; nextQuestion(); }
function nextQuestion() { 
    let pool=allQuestions; if(currentCategory!=='aleatorio') pool=allQuestions.filter(q=>q.category.toLowerCase()===currentCategory.toLowerCase()); if(pool.length===0) pool=allQuestions;
    const r=pool[Math.floor(Math.random()*pool.length)]; document.getElementById('q-text').innerText=r.text; document.getElementById('q-cat').innerText=r.category;
}
function setCategory(c, b) { playSfx('click'); currentCategory=c; document.querySelectorAll('.topic-chip').forEach(x=>x.classList.remove('active')); if(b) b.classList.add('active'); nextQuestion(); }
function switchTab(t, el) { 
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(d=>d.classList.remove('active')); if(el) el.classList.add('active');
    ['oracle','clash','party','judgment','profile','admin'].forEach(s => document.getElementById(s+'-section').classList.remove('active-section'));
    document.getElementById(t+'-section').classList.add('active-section');
    if(t==='clash') loadClash();
    if(t==='profile') updateProfileUI();
}

// DILEMA
async function loadClash() {
    const t=new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', t);
    if (!data || data.length === 0) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
    if(data && data.length > 0) {
        const c=data[0]; currentClashId=c.id; clashData={a:c.option_a, b:c.option_b, va:c.votes_a, vb:c.votes_b};
        document.getElementById('text-a').innerText=c.option_a; document.getElementById('text-b').innerText=c.option_b;
        if(localStorage.getItem('voted_'+c.id)) showResults(c.votes_a, c.votes_b);
        else if(currentUser.id) {
            const { data: v } = await db.from('user_votes').select('*').eq('user_id', currentUser.id).eq('clash_id', currentClashId).single();
            if(v) { localStorage.setItem('voted_'+c.id, 'true'); showResults(c.votes_a, c.votes_b); }
        }
    }
}
async function voteClash(o) {
    if(!currentClashId || document.getElementById('clash-section').classList.contains('voted')) return;
    playSfx('click');
    let a=clashData.va, b=clashData.vb; if(o==='a') a++; else b++;
    showResults(a, b); // UI Update Instantáneo
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

// EXTRAS
function openModal() { document.getElementById('suggestionModal').style.display='flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display='none'; }
function openStreakModal() { document.getElementById('streakModal').style.display='flex'; playSfx('click'); }
function closeStreakModal() { document.getElementById('streakModal').style.display='none'; }
async function sendSuggestion() { const t=document.getElementById('sug-text').value; if(!t) return; await db.from('suggestions').insert([{text:t, category:'Mix', votes:0}]); alert("Enviado."); closeModal(); }
function triggerAdminUnlock() { adminTapCount++; if(adminTapCount===5 && prompt("PIN")==="2025") switchTab('admin'); if(adminTapCount===5) adminTapCount=0; }
async function adminCreateClash() { const a=document.getElementById('admin-opt-a').value; const b=document.getElementById('admin-opt-b').value; if(a&&b) { const t=new Date(); t.setDate(t.getDate()+1); await db.from('clashes').delete().eq('publish_date', t.toISOString().split('T')[0]); await db.from('clashes').insert({option_a:a, option_b:b, publish_date:t.toISOString().split('T')[0]}); alert("OK"); } }
async function shareScreenshot(t) { 
    playSfx('click');
    const cd = document.getElementById('capture-stage'); const td = document.getElementById('capture-text');
    if(t==='clash') { 
        const w = clashData.va > clashData.vb ? clashData.a : clashData.b; 
        const p = (clashData.va+clashData.vb)===0?0:Math.round((Math.max(clashData.va,clashData.vb)/(clashData.va+clashData.vb))*100);
        td.innerHTML = `Prefieren:<br><span style="color:#FFD700">${w}</span> (${p}%)`;
    } else { td.innerHTML = "Totalkmon"; }
    try { const c = await html2canvas(cd, {scale:2, useCORS:true}); c.toBlob(async b => { const f=new File([b],"s.png",{type:"image/png"}); if(navigator.share) await navigator.share({files:[f]}); else alert("Captura guardada."); }); } catch(e){}
}
// Listeners para botones extra
document.getElementById('btn-close-suggestion').addEventListener('click', closeModal);
document.getElementById('btn-send-suggestion').addEventListener('click', sendSuggestion);
document.getElementById('btn-open-suggestion').addEventListener('click', openModal);
document.getElementById('btn-close-streak').addEventListener('click', closeStreakModal);
document.getElementById('btn-ack-streak').addEventListener('click', closeStreakModal);
document.getElementById('btn-share-oracle').addEventListener('click', () => shareScreenshot('oracle'));
document.getElementById('btn-share-clash').addEventListener('click', () => shareScreenshot('clash'));
document.getElementById('btn-share-profile').addEventListener('click', () => shareScreenshot('profile'));
document.getElementById('btn-admin-create').addEventListener('click', adminCreateClash);
document.getElementById('btn-admin-exit').addEventListener('click', () => switchTab('profile'));
document.getElementById('btn-judge-reject').addEventListener('click', () => voteJudgment(-1));
document.getElementById('btn-judge-approve').addEventListener('click', () => voteJudgment(1));
async function voteJudgment(v) { /* Impl */ }