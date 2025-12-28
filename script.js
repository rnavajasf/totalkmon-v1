// ==========================================
// TOTALKMON V40 - GOLDEN MASTER
// ==========================================

const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ESTADO GLOBAL ---
const App = {
    user: { id: null, name: 'Anónimo', avatar: '🦊', streak: 0, votes: 0 },
    room: { id: null, isHost: false, sub: null, mode: 'classic' },
    questions: [],
    category: 'Mix',
    clash: { id: null, a: '', b: '', va: 0, vb: 0 },
    
    // --- INICIALIZACIÓN (CRÍTICO) ---
    init: async () => {
        console.log("Iniciando...");
        await App.ensureUser(); // PASO 1: Asegurar Identidad
        await App.fetchQuestions(); // PASO 2: Cargar Contenido
        await App.loadClash(); // PASO 3: Cargar Dilema
        
        App.renderProfile();
        // Quitar pantalla de carga
        document.getElementById('loading-screen').style.opacity = '0';
        setTimeout(() => document.getElementById('loading-screen').style.display = 'none', 500);
    },

    // --- SISTEMA DE IDENTIDAD (ANTI-FANTASMA) ---
    ensureUser: async () => {
        let localId = localStorage.getItem('v40_uid'); // Nueva clave para evitar conflictos viejos
        let existsInDb = false;

        if (localId) {
            // Verificar si existe realmente en Supabase
            const { data } = await db.from('profiles').select('id, streak, votes_cast').eq('id', localId).single();
            if (data) {
                existsInDb = true;
                App.user.streak = data.streak;
                App.user.votes = data.votes_cast;
            }
        }

        if (!localId || !existsInDb) {
            // Crear usuario nuevo
            const newId = crypto.randomUUID();
            const { error } = await db.from('profiles').insert([{ 
                id: newId, 
                username: 'Anónimo', 
                avatar: '🦊' 
            }]);
            
            if (error) {
                console.error("Error creando usuario:", error);
                alert("Error de conexión. Recarga.");
                return;
            }
            
            localId = newId;
            localStorage.setItem('v40_uid', newId);
        }

        App.user.id = localId;
        App.user.name = localStorage.getItem('v40_name') || 'Anónimo';
        App.user.avatar = localStorage.getItem('v40_avatar') || '🦊';
    },

    // --- ORÁCULO ---
    fetchQuestions: async () => {
        const { data } = await db.from('questions').select('*').limit(2000);
        if(data && data.length > 0) App.questions = data;
        else App.questions = [{text: "Cargando...", category: "Mix"}];
        App.nextQuestion();
    },

    nextQuestion: () => {
        let pool = App.questions;
        // Filtro estricto pero seguro
        if (App.category.toLowerCase() !== 'mix' && App.category.toLowerCase() !== 'aleatorio') {
            pool = App.questions.filter(q => q.category.toLowerCase() === App.category.toLowerCase());
        }
        // Fallback si la categoría está vacía
        if (pool.length === 0) pool = App.questions;

        const r = pool[Math.floor(Math.random() * pool.length)];
        document.getElementById('q-text').innerText = r.text;
        document.getElementById('oracle-cat').innerText = r.category;
    },

    setCategory: (cat, btn) => {
        App.playSfx('click');
        App.category = cat;
        document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        App.nextQuestion();
    },

    // --- MODO FIESTA (LÓGICA BLINDADA) ---
    setGameMode: (mode) => {
        App.playSfx('click');
        App.room.mode = mode;
        document.querySelectorAll('.mode-option').forEach(el => el.classList.remove('selected'));
        document.getElementById('mode-' + mode).classList.add('selected');
    },

    createRoom: async () => {
        App.playSfx('click');
        const code = Math.random().toString(36).substring(2, 6).toUpperCase();
        
        // 1. Crear Sala
        await db.from('rooms').insert({
            id: code,
            host_id: App.user.id,
            current_card_text: "Sala Lista",
            current_card_category: "...",
            gamemode: App.room.mode,
            game_state: 'waiting'
        });

        // 2. Unirme como Host
        App.joinRoomProcess(code, true);
    },

    joinRoom: async () => {
        App.playSfx('click');
        const code = document.getElementById('join-code').value.toUpperCase().trim();
        if (code.length !== 4) return alert("Código inválido");

        const { data } = await db.from('rooms').select('*').eq('id', code).single();
        if (!data) return alert("Sala no existe");

        App.room.mode = data.gamemode;
        // Determinar si soy host (recuperación de sesión)
        const isHost = (data.host_id === App.user.id);
        
        App.joinRoomProcess(code, isHost);
    },

    joinRoomProcess: async (code, isHost) => {
        App.room.id = code;
        App.room.isHost = isHost;

        // Upsert para asegurar participación
        await db.from('room_participants').upsert({
            room_id: code,
            user_id: App.user.id,
            role: 'spectator'
        });

        // UI Update
        document.getElementById('party-lobby').style.display = 'none';
        document.getElementById('party-active').style.display = 'block';
        document.getElementById('room-display-code').innerText = code;
        document.getElementById('host-controls').style.display = isHost ? 'block' : 'none';
        document.getElementById('guest-controls').style.display = isHost ? 'none' : 'block';
        App.updatePartyView();

        // Suscripción Realtime
        if (App.room.sub) db.removeChannel(App.room.sub);
        App.room.sub = db.channel('room-' + code)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${code}` }, payload => {
                App.handleRoomUpdate(payload.new);
            })
            .subscribe();
            
        // Fetch inicial
        const { data } = await db.from('rooms').select('*').eq('id', code).single();
        if(data) App.handleRoomUpdate(data);
    },

    handleRoomUpdate: async (room) => {
        if (room.gamemode !== App.room.mode) {
            App.room.mode = room.gamemode;
            App.updatePartyView();
        }
        
        // Animación Flash
        const container = document.querySelector('.card-container');
        container.classList.remove('flash-animation');
        void container.offsetWidth; 
        container.classList.add('flash-animation');
        App.playSfx('swoosh');

        if (App.room.mode === 'classic') {
            document.getElementById('party-classic-text').innerText = room.current_card_text;
            document.getElementById('party-classic-cat').innerText = room.current_card_category;
        } 
        else if (App.room.mode === 'imposter') {
            const el = document.getElementById('imposter-role-text');
            el.style.filter = 'blur(15px)';
            if (App.user.id === room.imposter_id) el.innerText = "🤫 ERES EL IMPOSTOR";
            else el.innerText = room.current_card_text;
        } 
        else if (App.room.mode === 'versus') {
            document.getElementById('party-versus-title').innerText = room.current_card_text;
            // Fetch mi rol específico
            const { data } = await db.from('room_participants').select('role').match({ room_id: App.room.id, user_id: App.user.id }).single();
            const opts = room.current_card_category.split('|');
            const box = document.getElementById('party-versus-box');
            const txt = document.getElementById('party-versus-role');
            
            box.classList.remove('team-a-style', 'team-b-style');
            if (data && data.role === 'team_a') {
                box.classList.add('team-a-style');
                txt.innerText = "DEFENDER: " + (opts[0] || 'A');
            } else if (data && data.role === 'team_b') {
                box.classList.add('team-b-style');
                txt.innerText = "DEFENDER: " + (opts[1] || 'B');
            } else {
                txt.innerText = "ESPERANDO...";
            }
        }
    },

    updatePartyView: () => {
        ['classic', 'imposter', 'versus'].forEach(m => document.getElementById('view-' + m).style.display = 'none');
        document.getElementById('view-' + App.room.mode).style.display = 'flex';
    },

    partyNextRound: async () => {
        if (!App.room.isHost) return;
        App.playSfx('click');

        if (App.room.mode === 'classic') {
            const r = App.questions[Math.floor(Math.random() * App.questions.length)];
            await db.from('rooms').update({ current_card_text: r.text, current_card_category: r.category }).eq('id', App.room.id);
        }
        else if (App.room.mode === 'imposter') {
            const words = ["Hospital", "Playa", "Cine", "Cárcel", "Banco", "Avión"];
            const w = words[Math.floor(Math.random() * words.length)];
            const { data: players } = await db.from('room_participants').select('user_id').eq('room_id', App.room.id);
            const imposter = players[Math.floor(Math.random() * players.length)].user_id;
            await db.from('rooms').update({ current_card_text: w, imposter_id: imposter }).eq('id', App.room.id);
        }
        else if (App.room.mode === 'versus') {
            const topics = [
                {t:"Tortilla", a:"Con Cebolla", b:"Sin Cebolla"},
                {t:"Pizza", a:"Con Piña", b:"Sin Piña"},
                {t:"Dinero", a:"Felicidad", b:"Tristeza"}
            ];
            const t = topics[Math.floor(Math.random() * topics.length)];
            
            // Repartir equipos
            const { data: players } = await db.from('room_participants').select('user_id').eq('room_id', App.room.id);
            for (let i = 0; i < players.length; i++) {
                const team = i % 2 === 0 ? 'team_a' : 'team_b';
                await db.from('room_participants').update({ role: team }).match({ room_id: App.room.id, user_id: players[i].user_id });
            }
            
            // Enviar carta (Trigger update)
            await db.from('rooms').update({ current_card_text: t.t, current_card_category: t.a + "|" + t.b }).eq('id', App.room.id);
        }
    },

    exitRoom: () => {
        if (App.room.sub) db.removeChannel(App.room.sub);
        App.room.id = null;
        document.getElementById('party-lobby').style.display = 'block';
        document.getElementById('party-active').style.display = 'none';
        document.getElementById('join-code').value = "";
    },

    // --- DILEMA ---
    loadClash: async () => {
        const t = new Date().toISOString().split('T')[0];
        let { data } = await db.from('clashes').select('*').eq('publish_date', t);
        if (!data || !data.length) { const { data: r } = await db.from('clashes').select('*').limit(1); data = r; }
        
        if (data && data.length) {
            const c = data[0];
            App.clash.id = c.id;
            App.clash.a = c.option_a;
            App.clash.b = c.option_b;
            App.clash.va = c.votes_a;
            App.clash.vb = c.votes_b;
            
            document.getElementById('text-a').innerText = c.option_a;
            document.getElementById('text-b').innerText = c.option_b;
            if (localStorage.getItem('voted_' + c.id)) App.showClashResults();
        }
    },

    voteClash: async (opt) => {
        if (document.getElementById('clash-section').classList.contains('voted')) return;
        App.playSfx('click');
        if (opt === 'a') App.clash.va++; else App.clash.vb++;
        App.showClashResults();
        localStorage.setItem('voted_' + App.clash.id, 'true');
        await db.from('user_votes').insert({ user_id: App.user.id, clash_id: App.clash.id, vote_option: opt });
        await db.from('clashes').update({ votes_a: App.clash.va, votes_b: App.clash.vb }).eq('id', App.clash.id);
    },

    showClashResults: () => {
        const t = App.clash.va + App.clash.vb;
        const pa = t === 0 ? 0 : Math.round((App.clash.va / t) * 100);
        const pb = t === 0 ? 0 : Math.round((App.clash.vb / t) * 100);
        document.getElementById('bar-a').style.width = pa + '%';
        document.getElementById('bar-b').style.width = pb + '%';
        document.getElementById('perc-a').innerText = pa + '%';
        document.getElementById('perc-b').innerText = pb + '%';
        document.getElementById('clash-section').classList.add('voted');
    },

    // --- UTILIDADES ---
    switchTab: (tab, btn) => {
        App.playSfx('click');
        document.querySelectorAll('.dock-item').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        ['oracle', 'clash', 'party', 'section-profile', 'judgment', 'admin'].forEach(s => {
            const el = document.getElementById('section-' + s) || document.getElementById(s + '-section');
            if(el) el.classList.remove('active-section');
        });
        const target = document.getElementById('section-' + tab) || document.getElementById(tab + '-section');
        if(target) target.classList.add('active-section');
    },

    toggleAvatarSelector: () => {
        const el = document.getElementById('avatar-selector');
        el.style.display = el.style.display === 'none' ? 'grid' : 'none';
    },

    setAvatar: (av) => {
        App.user.avatar = av;
        localStorage.setItem('v40_avatar', av);
        App.renderProfile();
        App.toggleAvatarSelector();
        db.from('profiles').update({ avatar: av }).eq('id', App.user.id).then();
    },

    saveProfile: () => {
        const name = document.getElementById('profile-name').value;
        App.user.name = name;
        localStorage.setItem('v40_name', name);
        db.from('profiles').update({ username: name }).eq('id', App.user.id).then();
    },

    renderProfile: () => {
        document.getElementById('profile-name').value = App.user.name;
        document.getElementById('profile-avatar').innerText = App.user.avatar;
        document.getElementById('stat-streak').innerText = App.user.streak;
        document.getElementById('stat-votes').innerText = App.user.votes;
    },

    playSfx: (type) => {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.start(); g.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.1);
        o.stop(ctx.currentTime + 0.1);
    },

    share: (t) => alert("Captura guardada.")
};

// AUTO-INICIO
window.onload = App.init;