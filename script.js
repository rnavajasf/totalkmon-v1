// CONFIGURACIÓN SUPABASE
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ESTADO
let allQuestions = [];
let currentCategory = 'aleatorio';
let currentJudgeId = null;
let currentClashId = null;
let clashData = { a: '', b: '', va: 0, vb: 0 };

// SONIDO
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'click') {
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        if(navigator.vibrate) navigator.vibrate(5);
    } 
    else if (type === 'swoosh') {
        osc.type = 'triangle'; 
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.15);
        osc.start(); osc.stop(audioCtx.currentTime + 0.15);
    }
    else if (type === 'success') { 
        [440, 554, 659].forEach((f, i) => {
            const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
            o.connect(g); g.connect(audioCtx.destination); o.frequency.value = f;
            g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5 + (i*0.1));
            o.start(audioCtx.currentTime); o.stop(audioCtx.currentTime + 0.5);
        });
    }
}

// 1. RACHAS Y MODAL
function checkStreak() {
    const today = new Date().toISOString().split('T')[0];
    const lastVisit = localStorage.getItem('lastVisit');
    let streak = parseInt(localStorage.getItem('streak') || 0);

    if (lastVisit !== today) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastVisit === yesterdayStr) {
            streak++; 
            setTimeout(() => playSfx('success'), 500); 
        } else {
            streak = 1; 
        }
        
        localStorage.setItem('lastVisit', today);
        localStorage.setItem('streak', streak);
    }

    const badge = document.getElementById('streak-badge');
    const count = document.getElementById('streak-count');
    
    if (streak > 0) {
        badge.style.display = 'flex';
        count.innerText = streak;
    }
}

function openStreakModal() {
    // Actualizar el número dentro del modal antes de abrir
    document.getElementById('modal-streak-count').innerText = document.getElementById('streak-count').innerText;
    document.getElementById('streakModal').style.display = 'flex';
    playSfx('click');
}
function closeStreakModal() {
    document.getElementById('streakModal').style.display = 'none';
}

// 2. ORÁCULO
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*');
    if(data && data.length > 0) allQuestions = data;
    else allQuestions = [{text: "Bienvenido a Totalkmon.", category: "Inicio"}];
    nextQuestion();
}

function nextQuestion() {
    let pool = allQuestions;
    if(currentCategory !== 'aleatorio') pool = allQuestions.filter(q => q.category.toLowerCase() === currentCategory.toLowerCase());
    if(pool.length === 0) pool = allQuestions;
    
    const cardContent = document.querySelector('.card-inner');
    cardContent.style.opacity = '0';
    
    setTimeout(() => {
        const random = pool[Math.floor(Math.random() * pool.length)];
        document.getElementById('q-text').innerText = random.text;
        document.getElementById('q-cat').innerText = random.category;
        cardContent.style.opacity = '1';
    }, 150);
}

function setCategory(cat, btn) {
    playSfx('click');
    currentCategory = cat;
    document.querySelectorAll('.topic-chip').forEach(b => b.classList.remove('active'));
    if(btn) btn.classList.add('active');
    nextQuestion();
}

// 3. DILEMA
async function loadClash() {
    const today = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', today);
    if (!data || data.length === 0) {
        const { data: randomData } = await db.from('clashes').select('*').limit(1);
        data = randomData;
    }
    if(data && data.length > 0) {
        const c = data[0];
        currentClashId = c.id;
        clashData = { a: c.option_a, b: c.option_b, va: c.votes_a, vb: c.votes_b };
        document.getElementById('text-a').innerText = c.option_a;
        document.getElementById('text-b').innerText = c.option_b;
        if(localStorage.getItem('voted_'+c.id)) showResults(c.votes_a, c.votes_b);
    }
}

async function voteClash(opt) {
    if(!currentClashId || localStorage.getItem('voted_'+currentClashId)) return;
    playSfx('click');
    const { data } = await db.from('clashes').select('*').eq('id', currentClashId).single();
    let a = data.votes_a, b = data.votes_b;
    if(opt === 'a') a++; else b++;
    clashData.va = a; clashData.vb = b;
    showResults(a, b);
    await db.from('clashes').update({ votes_a: a, votes_b: b }).eq('id', currentClashId);
    localStorage.setItem('voted_'+currentClashId, 'true');
}

function showResults(a, b) {
    let t = a + b;
    let pa = t===0?0:Math.round((a/t)*100), pb = t===0?0:Math.round((b/t)*100);
    document.getElementById('bar-a').style.width = pa+'%'; document.getElementById('bar-b').style.width = pb+'%';
    document.getElementById('perc-a').innerText = pa+'%'; document.getElementById('perc-b').innerText = pb+'%';
    document.getElementById('clash-section').classList.add('voted');
}

function shareClash() {
    const total = clashData.va + clashData.vb;
    const winText = clashData.va > clashData.vb ? clashData.a : clashData.b;
    const winPerc = total === 0 ? 0 : Math.round((Math.max(clashData.va, clashData.vb) / total) * 100);
    if (navigator.share) {
        navigator.share({
            title: 'Totalkmon', text: `📊 ${winPerc}%: "${winText}". ¿Tú qué dices?`, url: window.location.href
        });
    } else {
        alert("Link copiado: " + window.location.href);
    }
}

// 4. JUICIO
async function fetchJudge() {
    const { data } = await db.from('suggestions').select('*').limit(5);
    if (data && data.length > 0) {
        const random = data[Math.floor(Math.random() * data.length)];
        currentJudgeId = random.id;
        document.getElementById('judge-text').innerText = random.text;
        document.getElementById('judge-cat').innerText = random.category;
    } else {
        document.getElementById('judge-text').innerText = "Todo limpio por hoy.";
        document.getElementById('judge-cat').innerText = "Vuelve más tarde";
        currentJudgeId = null;
    }
}

async function voteJudgment(val) {
    if(!currentJudgeId) return;
    playSfx('click');
    const { data: current } = await db.from('suggestions').select('*').eq('id', currentJudgeId).single();
    if(!current) { fetchJudge(); return; }
    let newVotes = (current.votes || 0) + val;
    if (newVotes >= 5) {
        await db.from('questions').insert([{ text: current.text, category: current.category }]);
        await db.from('suggestions').delete().eq('id', currentJudgeId);
    } else if (newVotes <= -5) {
        await db.from('suggestions').delete().eq('id', currentJudgeId);
    } else {
        await db.from('suggestions').update({ votes: newVotes }).eq('id', currentJudgeId);
    }
    setTimeout(fetchJudge, 200);
}

// UI Y SUGERENCIAS
async function sendSuggestion() {
    playSfx('click');
    const txt = document.getElementById('sug-text').value;
    const cat = document.getElementById('sug-cat').value;
    if(!txt) return;
    await db.from('suggestions').insert([{ text: txt, category: cat, votes: 0 }]);
    alert("Enviado. ¡Gracias!");
    closeModal();
    document.getElementById('sug-text').value = "";
}

function switchTab(t, el) {
    playSfx('click');
    document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));
    if(el) el.classList.add('active');
    
    document.getElementById('oracle-section').classList.remove('active-section');
    document.getElementById('clash-section').classList.remove('active-section');
    document.getElementById('judgment-section').classList.remove('active-section');
    
    if(t === 'oracle') document.getElementById('oracle-section').classList.add('active-section');
    if(t === 'clash') { document.getElementById('clash-section').classList.add('active-section'); loadClash(); }
    if(t === 'judgment') { document.getElementById('judgment-section').classList.add('active-section'); fetchJudge(); }
}

function openModal() { document.getElementById('suggestionModal').style.display = 'flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display = 'none'; }

// Init Particles
const pc = document.getElementById('particles');
for(let i=0;i<20;i++){
    let p=document.createElement('div'); p.className='particle';
    p.style.left=Math.random()*100+'%'; p.style.width=p.style.height=(Math.random()*5+2)+'px';
    p.style.animationDelay=Math.random()*5+'s'; p.style.animationDuration=(Math.random()*10+15)+'s';
    pc.appendChild(p);
}

// INICIO
checkStreak();
fetchQuestions();