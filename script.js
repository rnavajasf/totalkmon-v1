// =================================================================
// TOTALKMON GOLDEN MASTER V34 - GLOBAL APP CONTROLLER
// =================================================================

const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// DICCIONARIOS
const imposterWords = ["Hospital", "Escuela", "Playa", "Cine", "Gimnasio", "Aeropuerto", "Supermercado", "Restaurante", "Zoológico", "Hotel", "Teléfono", "Cuchara", "Inodoro", "Cama", "Reloj", "Pizza", "Sushi", "Hamburguesa", "Chocolate", "Plátano", "Perro", "Gato", "León", "Policía", "Médico", "Bombero"];
const debateTopics = [
    { title: "Tortilla de Patatas", a: "CON Cebolla", b: "SIN Cebolla" },
    { title: "Pizza", a: "Con Piña", b: "Sin Piña" },
    { title: "Dinero", a: "Da la felicidad", b: "No la da" },
    { title: "Redes Sociales", a: "Buenas", b: "Tóxicas" },
    { title: "Cine", a: "Doblado", b: "V.O." },
    { title: "Vacaciones", a: "Playa", b: "Montaña" }
];

// ESTADO GLOBAL
const state = {
    user: { id: null, name: 'Anónimo', avatar: '🦊', streak: 0, votes: 0 },
    questions: [],
    category: 'Mix',
    clash: { id: null, data: {} },
    room: { id: null, isHost: false, sub: null, mode: 'classic' }
};

// AUDIO SYSTEM
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
const sfx = {
    play: (type) => {
        if (audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{});
        try {
            const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            const now = audioCtx.currentTime;
            if (type === 'click') { osc.frequency.setValueAtTime(600, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); } 
            else if (type === 'swoosh') { osc.type = 'triangle'; gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
        } catch(e){}
    }
};

// =================================================================
// APP CORE (EXPOSED TO HTML)
// =================================================================
const app = {
    // --- USUARIO & INIT ---
    init: async () => {
        console.log("Iniciando App V34...");
        state.user.id = localStorage.getItem('uid');
        state.user.name = localStorage.getItem('uname') || 'Anónimo';
        state.user.avatar = localStorage.getItem('uavatar') || '🦊';
        app.renderProfile();
        
        if (!state.user.id) {
            const { data } = await db.from('profiles').insert([{ username: state.user.name, avatar: state.user.avatar }]).select().single();
            if (data) { state.user.id = data.id; localStorage.setItem('uid', data.id); }
        } else {
            const { data } = await db.from('profiles').select('*').eq('id', state.user.id).single();
            if (data) { state.user.streak = data.streak; state.user.votes = data.votes_cast; app.renderProfile(); }
        }
        
        await app.fetchQuestions();
        await app.loadClash();
    },

    // --- ORÁCULO ---
    fetchQuestions: async () => {
        const { data } = await db.from('questions').select('*').limit(2000);
        if (data) state.questions = data;
        app.nextQuestion();
    },
    
    setCategory: (cat, btn) => {
        sfx.play('click');
        state.category = cat;
        document.querySelectorAll('.topic-chip').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        app.nextQuestion();
    },

    nextQuestion: () => {
        let pool = state.questions;
        if (state.category.toLowerCase() !== 'aleatorio' && state.category.toLowerCase() !== 'mix') {
            pool = state.questions.filter(q => q.category.toLowerCase() === state.category.toLowerCase());
        }
        if (pool.length === 0) pool = state.questions; // Fallback
        
        const r = pool[Math.floor(Math.random() * pool.length)];
        if (r) {
            document.getElementById('q-text').innerText = r.text;
            document.getElementById('q-cat').innerText = r.category;
        }
    },

    // --- DILEMA ---
    loadClash: async () => {
        const today = new Date().toISOString().split('T')[0];
        let { data } = await db.from('clashes').select('*').eq('publish_date', today);
        if (!data || data.length === 0) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
        
        if (data && data.length > 0) {
            const c = data[0];
            state.clash.id = c.id;
            state.clash.data = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
            document.getElementById('text-a').innerText = c.option_a;
            document.getElementById('text-b').innerText = c.option_b;
            if (localStorage.getItem('voted_' + c.id)) app.showClashResults();
        }
    },

    voteClash: async (opt) => {
        if (document.getElementById('clash-section').classList.contains('voted')) return;
        sfx.play('click');
        if (opt === 'a') state.clash.data.va++; else state.clash.data.vb++;
        
        app.showClashResults();
        localStorage.setItem('voted_' + state.clash.id, 'true');
        
        if (state.user.id) {
            await db.from('user_votes').insert({ user_id: state.user.id, clash_id: state.clash.id, vote_option: opt });
            await db.from('clashes').update({ votes_a: state.clash.data.va, votes_b: state.clash.data.vb }).eq('id', state.clash.id);
        }
    },

    showClashResults: () => {
        const total = state.clash.data.va + state.clash.data.vb;
        const pa = total === 0 ? 0 : Math.round((state.clash.data.va / total) * 100);
        const pb = total === 0 ? 0 : Math.round((state.clash.data.vb / total) * 100);
        
        document.getElementById('bar-a').style.width = pa + '%';
        document.getElementById('bar-b').style.width = pb + '%';
        document.getElementById('perc-a').innerText = pa + '%';
        document.getElementById('perc-b').innerText = pb + '%';
        document.getElementById('clash-section').classList.add('voted');
    },

    // --- MODO FIESTA ---
    selectMode: (mode) => {
        sfx.play('click');
        state.room.mode = mode;
        document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
        document.querySelector(`[data-mode="${mode}"]`).classList.add('selected');
    },

    createRoom: async () => {
        if (!state.user.id) return alert("Cargando...");
        sfx.play('click');
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        await db.from('rooms').insert({ 
            id: code, host_id: state.user.id, current_card_text: "Sala Lista", current_card_category: "...", gamemode: state.room.mode 
        });
        
        state.room.id = code; state.room.isHost = true;
        app.enterRoomUI();
        app.subscribeRoom();
    },

    joinRoom: async () => {
        const code = document.getElementById('join-code').value.toUpperCase().trim();
        if (code.length !== 4) return alert("Código incorrecto");
        sfx.play('click');
        
        const { data } = await db.from('rooms').select('*').eq('id', code).single();
        if (!data) return alert("Sala no existe");
        
        state.room.id = code; state.room.isHost = false; state.room.mode = data.gamemode;
        app.enterRoomUI();
        app.subscribeRoom();
    },

    enterRoomUI: () => {
        document.getElementById('party-lobby').style.display = 'none';
        document.getElementById('party-active').style.display = 'block';
        document.getElementById('display-room-code').innerText = state.room.id;
        document.getElementById('host-controls').style.display = state.room.isHost ? 'block' : 'none';
        document.getElementById('guest-controls').style.display = state.room.isHost ? 'none' : 'block';
        app.updatePartyCardDisplay();
        
        // UPSERT SEGURO AL ENTRAR
        if (state.user.id) {
            db.from('room_participants').upsert({ room_id: state.room.id, user_id: state.user.id, role: 'spectator' }, { onConflict: 'room_id, user_id' }).then(()=>{});
        }
    },

    subscribeRoom: () => {
        if (state.room.sub) db.removeChannel(state.room.sub);
        state.room.sub = db.channel('room-' + state.room.id)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${state.room.id}` }, payload => {
                app.handleRoomUpdate(payload.new);
            })
            .subscribe();
            
        // Initial Fetch
        db.from('rooms').select('*').eq('id', state.room.id).single().then(({data}) => { if (data) app.handleRoomUpdate(data); });
    },

    handleRoomUpdate: async (room) => {
        if (room.gamemode !== state.room.mode) {
            state.room.mode = room.gamemode;
            app.updatePartyCardDisplay();
        }
        
        sfx.play('swoosh');
        const card = document.getElementById('party-card-' + state.room.mode);
        card.classList.remove('flash-animation'); void card.offsetWidth; card.classList.add('flash-animation');

        if (state.room.mode === 'classic') {
            document.getElementById('party-text').innerText = room.current_card_text;
            document.getElementById('party-cat').innerText = room.current_card_category;
        } else if (state.room.mode === 'imposter') {
            const el = document.getElementById('imposter-role-text');
            el.style.filter = 'blur(15px)';
            if (state.user.id === room.imposter_id) el.innerText = "🤫 ERES EL IMPOSTOR";
            else el.innerText = room.current_card_text;
        } else if (state.room.mode === 'versus') {
            document.getElementById('versus-main-text').innerText = room.current_card_text;
            // Fetch Role
            const { data } = await db.from('room_participants').select('role').match({room_id: state.room.id, user_id: state.user.id}).single();
            const opts = room.current_card_category.split('|');
            const box = document.getElementById('versus-role-box');
            const txt = document.getElementById('versus-role-text');
            
            box.classList.remove('team-a-style', 'team-b-style');
            if (data && data.role === 'team_a') { box.classList.add('team-a-style'); txt.innerText = "DEFENDER: " + (opts[0]||'A'); }
            else if (data && data.role === 'team_b') { box.classList.add('team-b-style'); txt.innerText = "DEFENDER: " + (opts[1]||'B'); }
            else txt.innerText = "ESPERANDO...";
        }
    },

    partyNextRound: async () => {
        if (!state.room.isHost) return;
        sfx.play('click');
        
        if (state.room.mode === 'classic') {
            const r = state.questions[Math.floor(Math.random() * state.questions.length)];
            await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', state.room.id);
        } else if (state.room.mode === 'imposter') {
            const w = imposterWords[Math.floor(Math.random() * imposterWords.length)];
            const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', state.room.id);
            let imp = state.user.id;
            if (ps.length) imp = ps[Math.floor(Math.random() * ps.length)].user_id;
            await db.from('rooms').update({ current_card_text: w, imposter_id: imp }).eq('id', state.room.id);
        } else if (state.room.mode === 'versus') {
            const t = debateTopics[Math.floor(Math.random() * debateTopics.length)];
            const { data: ps } = await db.from('room_participants').select('user_id').eq('room_id', state.room.id);
            // Repartir equipos
            if (ps.length) {
                for (let i = ps.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ps[i], ps[j]] = [ps[j], ps[i]]; }
                const updates = ps.map((p, i) => db.from('room_participants').update({ role: i % 2 === 0 ? 'team_a' : 'team_b' }).match({room_id: state.room.id, user_id: p.user_id}));
                await Promise.all(updates);
            }
            await db.from('rooms').update({ current_card_text: t.title, current_card_category: t.a + "|" + t.b }).eq('id', state.room.id);
        }
    },

    exitRoom: () => {
        if (state.room.sub) db.removeChannel(state.room.sub);
        state.room.id = null; state.room.isHost = false;
        document.getElementById('party-lobby').style.display = 'block';
        document.getElementById('party-active').style.display = 'none';
        document.getElementById('join-code').value = "";
    },

    updatePartyCardDisplay: () => {
        ['classic', 'imposter', 'versus'].forEach(m => document.getElementById('party-card-' + m).style.display = 'none');
        document.getElementById('party-card-' + state.room.mode).style.display = 'flex';
    },

    // --- UI HELPERS ---
    switchTab: (tab, btn) => {
        sfx.play('click');
        document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
        if(btn) btn.classList.add('active');
        ['oracle', 'clash', 'party', 'judgment', 'profile', 'admin'].forEach(s => document.getElementById(s + '-section').classList.remove('active-section'));
        document.getElementById(tab + '-section').classList.add('active-section');
    },

    renderProfile: () => {
        document.getElementById('profile-name').value = state.user.name;
        document.getElementById('profile-avatar').innerText = state.user.avatar;
        document.getElementById('stat-streak').innerText = state.user.streak;
        document.getElementById('stat-votes').innerText = state.user.votes;
    },

    saveProfile: () => {
        state.user.name = document.getElementById('profile-name').value;
        localStorage.setItem('uname', state.user.name);
        if (state.user.id) db.from('profiles').update({ username: state.user.name }).eq('id', state.user.id);
    },

    toggleAvatarEdit: () => { const s = document.getElementById('avatar-selector'); s.style.display = s.style.display === 'none' ? 'grid' : 'none'; },
    setAvatar: (av) => { state.user.avatar = av; localStorage.setItem('uavatar', av); app.renderProfile(); app.toggleAvatarEdit(); if(state.user.id) db.from('profiles').update({ avatar: av }).eq('id', state.user.id); },
    
    // EXTRAS
    openModal: () => document.getElementById('suggestionModal').style.display = 'flex',
    closeModal: () => document.getElementById('suggestionModal').style.display = 'none',
    sendSuggestion: async () => { 
        const t = document.getElementById('sug-text').value; 
        if(t) { await db.from('suggestions').insert([{text:t, category:'Mix'}]); alert('Enviado'); app.closeModal(); } 
    },
    share: (t) => alert("Captura guardada.")
};

// AUTO-START
document.addEventListener('DOMContentLoaded', app.init);