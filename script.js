// ==========================================
// 1. CONFIGURACIÓN Y CLAVES
// ==========================================
const SUPABASE_URL = 'https://zlddmiulbfjhwytfkvlw.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsZGRtaXVsYmZqaHd5dGZrdmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTU4ODEsImV4cCI6MjA4MjA3MTg4MX0.61pMT7GbYU9ZpWJjZnsBGrF_Lb9jLX0OkIYf1a6k6GY';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. ESTADO DE LA APP
// ==========================================
let allQuestions = [];
let currentCategory = 'aleatorio';
let currentJudgeId = null;
let currentClashId = null;
let clashData = { a: '', b: '', va: 0, vb: 0 }; 

// ==========================================
// 3. SISTEMA DE SONIDO PROCEDURAL
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSfx(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'click') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start(); osc.stop(audioCtx.currentTime + 0.1);
        if(navigator.vibrate) navigator.vibrate(10);
    } 
    else if (type === 'swoosh') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.2);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.start(); osc.stop(audioCtx.currentTime + 0.2);
        if(navigator.vibrate) navigator.vibrate(5);
    }
}

// ==========================================
// 4. LÓGICA DEL ORÁCULO
// ==========================================
async function fetchQuestions() {
    const { data } = await db.from('questions').select('*');
    if(data && data.length > 0) allQuestions = data;
    else allQuestions = [{text: "Bienvenido. Toca para empezar.", category: "Inicio"}];
    nextQuestion();
}

function nextQuestion() {
    let pool = allQuestions;
    if(currentCategory !== 'aleatorio') pool = allQuestions.filter(q => q.category.toLowerCase() === currentCategory.toLowerCase());
    if(pool.length === 0) pool = allQuestions;
    const random = pool[Math.floor(Math.random() * pool.length)];
    
    document.getElementById('q-text').innerText = random.text;
    document.getElementById('q-cat').innerText = random.category;
}

function setCategory(cat, e) {
    playSfx('click');
    currentCategory = cat;
    document.querySelectorAll('.btn-mode').forEach(b => b.classList.remove('active'));
    if(e) e.target.classList.add('active');
    nextQuestion();
}

// ==========================================
// 5. LÓGICA DEL DILEMA (FECHA INTELIGENTE)
// ==========================================
async function loadClash() {
    const today = new Date().toISOString().split('T')[0];
    let { data } = await db.from('clashes').select('*').eq('publish_date', today);
    
    // Fallback: Si no hay dilema hoy, coge uno random
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
    document.getElementById('clash-container').classList.add('voted');
}

function shareClash() {
    const total = clashData.va + clashData.vb;
    const winText = clashData.va > clashData.vb ? clashData.a : clashData.b;
    const winPerc = total === 0 ? 0 : Math.round((Math.max(clashData.va, clashData.vb) / total) * 100);
    
    if (navigator.share) {
        navigator.share({
            title: 'Totalkmon Dilema',
            text: `📊 El ${winPerc}% prefiere: "${winText}". ¿Tú qué eliges? ¡Vota aquí!`,
            url: window.location.href
        }).catch(console.error);
    } else {
        alert("Enlace copiado: " + window.location.href);
    }
}

// ==========================================
// 6. LÓGICA DEL JUICIO
// ==========================================
async function fetchJudge() {
    const { data } = await db.from('suggestions').select('*').limit(5);
    if (data && data.length > 0) {
        const random = data[Math.floor(Math.random() * data.length)];
        currentJudgeId = random.id;
        document.getElementById('judge-text').innerText = random.text;
        document.getElementById('judge-cat').innerText = random.category;
    } else {
        document.getElementById('judge-text').innerText = "El Purgatorio está vacío.";
        document.getElementById('judge-cat').innerText = "";
        currentJudgeId = null;
    }
}

async function voteJudgment(value) {
    if(!currentJudgeId) return;
    playSfx('click');
    document.getElementById('judge-text').innerText = "Juzgando...";
    
    const { data: current } = await db.from('suggestions').select('*').eq('id', currentJudgeId).single();
    if(!current) { fetchJudge(); return; }
    
    let newVotes = (current.votes || 0) + value;
    if (newVotes >= 5) { // Ascensión
        await db.from('questions').insert([{ text: current.text, category: current.category }]);
        await db.from('suggestions').delete().eq('id', currentJudgeId);
    } else if (newVotes <= -5) { // Eliminación
        await db.from('suggestions').delete().eq('id', currentJudgeId);
    } else {
        await db.from('suggestions').update({ votes: newVotes }).eq('id', currentJudgeId);
    }
    setTimeout(fetchJudge, 300);
}

// ==========================================
// 7. UI & NAVEGACIÓN
// ==========================================
async function sendSuggestion() {
    playSfx('click');
    const txt = document.getElementById('sug-text').value;
    const cat = document.getElementById('sug-cat').value;
    if(!txt) return;
    await db.from('suggestions').insert([{ text: txt, category: cat, votes: 0 }]);
    alert("Ofrenda enviada.");
    closeModal();
    document.getElementById('sug-text').value = "";
}

function switchTab(t, el) {
    playSfx('click');
    
    // Ocultar todas las secciones
    document.getElementById('oracle-section').classList.remove('active-section');
    document.getElementById('clash-section').classList.remove('active-section');
    document.getElementById('judgment-section').classList.remove('active-section');
    
    // Resetear tabs superiores
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    
    if (t === 'oracle') {
        document.getElementById('oracle-section').classList.add('active-section');
        document.getElementById('tab-oracle').classList.add('active');
    } else if (t === 'clash') {
        document.getElementById('clash-section').classList.add('active-section');
        document.getElementById('tab-clash').classList.add('active');
        loadClash();
    } else if (t === 'judgment') {
        document.getElementById('judgment-section').classList.add('active-section');
        fetchJudge();
    }
}

function openModal() { document.getElementById('suggestionModal').style.display = 'flex'; }
function closeModal() { document.getElementById('suggestionModal').style.display = 'none'; }

// Init Partículas
const pc = document.getElementById('particles');
for(let i=0;i<25;i++){
    let p=document.createElement('div'); p.className='particle';
    p.style.left=Math.random()*100+'%'; p.style.width=p.style.height=(Math.random()*6+2)+'px';
    p.style.animationDelay=Math.random()*5+'s'; p.style.animationDuration=(Math.random()*10+10)+'s';
    pc.appendChild(p);
}

// Arranque
fetchQuestions();