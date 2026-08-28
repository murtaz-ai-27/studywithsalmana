import { useState, useEffect, useRef, useCallback } from "react";
import { useCards } from "./hooks/useCards";
import { generateFromTopic, generateFromText, modelShortName } from "./services/openrouter";
import { extractText, fmtSize } from "./services/fileParser";

// ── LANGUAGES ──
const LANGS = [
  { code:"English",flag:"🇬🇧",label:"English" },
  { code:"German",flag:"🇩🇪",label:"Deutsch" },
  { code:"Spanish",flag:"🇪🇸",label:"Español" },
  { code:"French",flag:"🇫🇷",label:"Français" },
  { code:"Italian",flag:"🇮🇹",label:"Italiano" },
  { code:"Portuguese",flag:"🇧🇷",label:"Português" },
  { code:"Turkish",flag:"🇹🇷",label:"Türkçe" },
  { code:"Arabic",flag:"🇸🇦",label:"العربية" },
  { code:"Urdu",flag:"🇵🇰",label:"اردو" },
  { code:"Chinese",flag:"🇨🇳",label:"中文" },
  { code:"Japanese",flag:"🇯🇵",label:"日本語" },
  { code:"Korean",flag:"🇰🇷",label:"한국어" },
];
const COUNTS = [10,20,30,40,50,60,70,100];
const QA = [
  {q:"What is the powerhouse of the cell?",a:"The Mitochondria 🔋"},
  {q:"Who wrote Romeo and Juliet?",a:"William Shakespeare ✍️"},
  {q:"What is Newton's 2nd Law?",a:"F = ma (Force = mass × acceleration)"},
  {q:"Capital of France?",a:"Paris 🗼"},
  {q:"What is photosynthesis?",a:"Plants converting sunlight + CO₂ into glucose 🌿"},
];

export default function App() {
  // ── STATE ──
  const [view, setView] = useState("splash"); // splash | landing | tool
  const [splashPhase, setSplashPhase] = useState("name"); // name | envelope | kiss | out
  const [cardFlipped, setCardFlipped] = useState(false);
  const [qaIdx, setQaIdx] = useState(0);

  const { cards, addCards, addCard, deleteCard, shuffle, clearAll } = useCards();
  const [currentIdx, setCurrentIdx] = useState(0);
  const [studyFlipped, setStudyFlipped] = useState(false);

  // Generator state
  const [topic, setTopic] = useState("");
  const [genCount, setGenCount] = useState(30);
  const [lang, setLang] = useState("English");
  const [genLoading, setGenLoading] = useState(false);
  const [genPhase, setGenPhase] = useState("");
  const [modelStatus, setModelStatus] = useState(null);

  // File state
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [fileCount, setFileCount] = useState(30);
  const fileRef = useRef();

  // Manual
  const [mFront, setMFront] = useState("");
  const [mBack, setMBack] = useState("");

  // Toast
  const [toast, setToast] = useState(null);
  const toastTimer = useRef();

  // Nav scroll
  const [scrolled, setScrolled] = useState(false);

  // ── EFFECTS ──
  useEffect(() => {
    // Splash: name phase → envelope after 2.8s
    if (view === "splash" && splashPhase === "name") {
      const t = setTimeout(() => setSplashPhase("envelope"), 2800);
      return () => clearTimeout(t);
    }
  }, [view, splashPhase]);

  useEffect(() => {
    if (view !== "landing") return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [view]);

  useEffect(() => {
    if (view !== "tool") return;
    setStudyFlipped(false);
  }, [currentIdx]);

  useEffect(() => {
    if (view !== "landing" && view !== "tool") return;
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); }),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal,.reveal-l,.reveal-r").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, [view]);

  useEffect(() => {
    if (!toast) return;
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, [toast]);

  // Keyboard shortcuts in tool
  useEffect(() => {
    if (view !== "tool") return;
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "ArrowLeft") setCurrentIdx(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setCurrentIdx(i => Math.min(cards.length - 1, i + 1));
      if (e.key === " ") { e.preventDefault(); setStudyFlipped(f => !f); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, cards.length]);

  // ── HELPERS ──
  const showToast = useCallback((type, msg) => setToast({ type, msg }), []);

  function openEnvelope() {
    if (splashPhase !== "envelope") return;
    setSplashPhase("kiss");
    setTimeout(() => {
      setSplashPhase("out");
      setTimeout(() => setView("landing"), 1200);
    }, 2200);
  }

  function goToTool() {
    setView("tool");
    window.scrollTo(0, 0);
  }

  async function handleGenTopic() {
    if (!topic.trim()) { showToast("info", "💭 Topic likhو!"); return; }
    setGenLoading(true); setGenPhase("generating"); setModelStatus(null);
    try {
      const nc = await generateFromTopic(topic.trim(), genCount, lang, s => setModelStatus(s));
      addCards(nc);
      setCurrentIdx(cards.length);
      showToast("ok", `✨ ${nc.length} cards added!`);
      setTopic("");
    } catch (e) {
      if (e.message === "NO_KEY") showToast("err", "🔑 API key nahi hai — .env check karo");
      else if (e.message === "INVALID_KEY") showToast("err", "🔑 API key galat hai");
      else showToast("err", "😵 Sab models busy hain — thodi der baad try karo");
      setModelStatus({ status: "fail", model: "" });
    } finally { setGenLoading(false); setGenPhase(""); }
  }

  async function handleGenFile() {
    if (!file) { showToast("info", "📂 File upload karo pehle!"); return; }
    setGenLoading(true); setGenPhase("reading"); setModelStatus(null);
    let text;
    try { text = await extractText(file); }
    catch (e) { showToast("err", `❌ ${e.message}`); setGenLoading(false); setGenPhase(""); return; }
    if (!text || text.trim().length < 30) {
      showToast("err", "❌ File mein koi readable text nahi"); setGenLoading(false); setGenPhase(""); return;
    }
    setGenPhase("generating");
    try {
      const nc = await generateFromText(text, fileCount, lang, s => setModelStatus(s));
      addCards(nc);
      setCurrentIdx(cards.length);
      showToast("ok", `✨ ${nc.length} cards generated from "${file.name}"!`);
      setFile(null);
    } catch (e) {
      if (e.message === "NO_KEY") showToast("err", "🔑 API key nahi hai");
      else if (e.message === "INVALID_KEY") showToast("err", "🔑 API key galat hai");
      else showToast("err", "😵 Sab models busy — thodi der baad try karo");
      setModelStatus({ status: "fail", model: "" });
    } finally { setGenLoading(false); setGenPhase(""); }
  }

  function handleManualAdd() {
    if (!mFront.trim() || !mBack.trim()) { showToast("err", "✕ Dono fields bharo!"); return; }
    addCard(mFront.trim(), mBack.trim());
    setMFront(""); setMBack("");
    showToast("ok", "✓ Card add ho gaya!");
  }

  function handleFile(f) {
    if (!f) return;
    const ext = f.name.split(".").pop().toLowerCase();
    if (!["pdf","txt","docx"].includes(ext)) { showToast("err", `❌ Sirf PDF, TXT, DOCX — .${ext} nahi`); return; }
    if (f.size > 20 * 1024 * 1024) { showToast("err", "❌ Max 20MB"); return; }
    setFile(f);
  }

  const modelLabel = () => {
    if (genPhase === "reading") return "📖 File parh raha hai...";
    if (!modelStatus) return "";
    if (modelStatus.status === "trying") return `🤖 ${modelShortName(modelStatus.model)} try kar raha...`;
    if (modelStatus.status === "fail") return "❌ Sab models busy — dobara try karo";
    return `✓ ${modelShortName(modelStatus.model)} se generate hua`;
  };

  // ── RENDER ──
  return (
    <>
      {/* ══ SPLASH ══ */}
      {view === "splash" && (
        <div className={`splash${splashPhase === "out" ? " splash-out" : ""}`}>
          <SplashStars />
          <div className="splash-flowers">
            {["🌸","🌺","🌷","🪷","🌼","✿"].map((f,i) => (
              <div key={i} className="sf" style={{left:`${8+i*16}%`,animationDuration:`${18+i*3}s`,animationDelay:`${i*2}s`}}>{f}</div>
            ))}
          </div>

          {/* Phase: Name */}
          {splashPhase === "name" && (
            <div className="sp-name">
              <span className="sp-for">A special tool for</span>
              <div className="sp-title">Salmana</div>
              <div className="sp-heart">💜</div>
              <span className="sp-sub">Made with all the love in the world 🌸</span>
            </div>
          )}

          {/* Phase: Envelope */}
          {splashPhase === "envelope" && (
            <div className="sp-env" onClick={openEnvelope}>
              <div className="env-wrap">
                <div className="env-body">
                  <div className="env-letter">
                    <div className="env-line" /><div className="env-line" />
                    <div className="env-line" /><div className="env-line" />
                    <div style={{fontSize:"1.8rem",marginTop:8}}>💜</div>
                  </div>
                </div>
                <div className="env-flap" />
                <div className="env-seal">💜</div>
              </div>
              <div className="env-tap">Tap to open 💌</div>
            </div>
          )}

          {/* Phase: Kiss */}
          {splashPhase === "kiss" && (
            <div className="sp-kiss">
              <div className="kiss-emoji">😘</div>
              <div className="kiss-text">I Love You, Salmana</div>
              <div className="kiss-hearts">
                {["💜","🌸","💕","✨","💜","🌷","💗","⭐","💜"].map((h,i) => (
                  <div key={i} className="kh" style={{
                    left:`${10+i*10}%`,
                    animationDuration:`${0.8+Math.random()*0.8}s`,
                    animationDelay:`${i*0.1}s`,
                    fontSize:`${1+Math.random()}rem`
                  }}>{h}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ LANDING ══ */}
      {view === "landing" && (
        <div className="landing">
          <BgOrbs /><BgFlowers /><BgStars />

          <nav className={scrolled ? "scrolled" : ""}>
            <div className="nav-logo">✦ StudyWithSalmana</div>
            <button className="nav-btn" onClick={goToTool}>✨ Open Tool</button>
          </nav>

          {/* Hero */}
          <section className="hero">
            <div className="hero-inner">
              <div className="hero-badge reveal">
                <span className="badge-dot" />Made with love · Powered by AI
              </div>
              <h1 className="hero-title reveal" style={{transitionDelay:"0.15s"}}>
                Study Smarter,<br /><em>Salmana.</em>
              </h1>
              <p className="hero-sub reveal" style={{transitionDelay:"0.25s"}}>
                A flashcard tool made just for her — because she deserves the best.
              </p>
              <p className="hero-desc reveal" style={{transitionDelay:"0.35s"}}>
                Upload your notes, generate beautiful flashcards with AI, study with 3D flip cards, and actually remember what you learn.
              </p>
              <div className="hero-btns reveal" style={{transitionDelay:"0.45s"}}>
                <button className="btn-p" onClick={goToTool}>✨ Start Studying</button>
                <a className="btn-s" href="#love">Read the letter ↓</a>
              </div>

              {/* 3D Card */}
              <HeroCard cardFlipped={cardFlipped} setCardFlipped={setCardFlipped} qaIdx={qaIdx} setQaIdx={setQaIdx} />
            </div>
            <div className="scroll-ind">
              <div className="s-dot" /><div className="s-line" /><span>Scroll</span>
            </div>
          </section>

          {/* Love Letter */}
          <div className="divider" /><LoveLetter goToTool={goToTool} />

          {/* How it works */}
          <div className="divider" />
          <section className="how-sec" id="how">
            <div className="sec-header">
              <span className="eyebrow-p reveal">✦ How It Works</span>
              <h2 className="sec-title reveal">Simple. Beautiful. Effective.</h2>
              <p className="sec-sub reveal">Three steps between you and actually remembering things.</p>
            </div>
            <div className="steps">
              {[
                {ic:"📂",cls:"ip",g:"gp",t:"Upload Your File",d:"Drop in a PDF, DOCX, or TXT — your lecture notes, textbooks, anything. AI reads every word.",delay:"0.1s"},
                {ic:"🤖",cls:"ipk",g:"gpk",t:"AI Does the Work",d:"Flashcards generated instantly. Perfect questions, concise answers — 10 to 100 cards from one file.",delay:"0.2s"},
                {ic:"🧠",cls:"ig",g:"gg",t:"Study & Remember",d:"Flip through cards, shuffle them, use keyboard shortcuts. Watch your confidence grow. 🌸",delay:"0.3s"},
              ].map((s,i) => (
                <div key={i} className={`step ${i===0?"reveal-l":i===2?"reveal-r":"reveal"}`} style={{transitionDelay:s.delay}}>
                  <div className={`step-glow ${s.g}`} />
                  <div className={`step-ic ${s.cls}`}>{s.ic}</div>
                  <h3 className="step-t">{s.t}</h3>
                  <p className="step-d">{s.d}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Features */}
          <div className="divider" />
          <section className="feat-sec">
            <div className="sec-header">
              <span className="eyebrow-p reveal">✦ Features</span>
              <h2 className="sec-title reveal">Everything you need.<br/>Nothing you don't.</h2>
            </div>
            <div className="feat-grid">
              <div className="fc featured reveal">
                <div className="fi">📂</div>
                <div><div className="ft">File Upload — The Star Feature</div>
                <div className="fd">Upload PDF, DOCX, or TXT up to 20MB. AI analyzes content and generates 10–100 exam-ready flashcards automatically.</div></div>
              </div>
              {[
                {i:"🤖",t:"AI Auto-Fallback",d:"If one model is busy, it tries the next — generation always works."},
                {i:"🌍",t:"12 Languages",d:"English, German, Spanish, Urdu, Arabic, Japanese and more."},
                {i:"🃏",t:"Smooth 3D Flip",d:"Cards flip beautifully. Question front, answer back."},
                {i:"⌨️",t:"Keyboard Shortcuts",d:"← → navigate. Space flips. Study at full speed."},
              ].map((f,i) => (
                <div key={i} className={`fc ${i%2===0?"reveal-l":"reveal-r"}`} style={{transitionDelay:`${0.1*(i+1)}s`}}>
                  <div className="fi">{f.i}</div>
                  <div><div className="ft">{f.t}</div><div className="fd">{f.d}</div></div>
                </div>
              ))}
            </div>
          </section>

          {/* Lang strip */}
          <div className="divider" />
          <LangStrip />

          {/* CTA */}
          <div className="divider" />
          <section className="cta-sec">
            <div className="cta-box reveal">
              <div className="cta-glow" />
              <span className="cta-emoji">👑</span>
              <h2 className="cta-t">Ready to ace your<br/><span>next exam, Salmana?</span></h2>
              <p className="cta-s">Your study companion is waiting. Upload a file and get flashcards in 30 seconds.</p>
              <button className="btn-p" onClick={goToTool}>✨ Open Flashcards Now</button>
            </div>
          </section>

          <footer>
            <span className="flogo">✦ StudyWithSalmana</span>
            <span className="flove">Made with <span>♥</span> just for her 🌸</span>
          </footer>
        </div>
      )}

      {/* ══ TOOL ══ */}
      {view === "tool" && (
        <div className="tool">
          <BgOrbs /><BgFlowers /><BgStars />

          <div className="tool-app">
            <header className="tool-header">
              <div className="header-crowns">
                <span className="crown">👑</span>
                <h1>Flashcards for Salmana</h1>
                <span className="crown">👑</span>
              </div>
              <p className="header-sub">because her brain deserves the best study tool 💜</p>
              <button className="back-btn" onClick={() => setView("landing")}>← Back to Home</button>
            </header>

            {/* File Upload */}
            <div className="section-card">
              <div className="section-title">📂 Upload File — AI Generates Flashcards</div>
              <div
                className={`drop-zone${dragging?" dragging":""}${file?" has-file":""}`}
                onDragOver={e=>{e.preventDefault();setDragging(true)}}
                onDragLeave={()=>setDragging(false)}
                onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files?.[0])}}
                onClick={()=>!file&&fileRef.current?.click()}
              >
                <input ref={fileRef} type="file" accept=".pdf,.txt,.docx" onChange={e=>handleFile(e.target.files?.[0])} style={{display:"none"}}/>
                {file ? (
                  <div className="file-preview">
                    <span className="file-icon">{file.name.endsWith(".pdf")?"📄":file.name.endsWith(".docx")?"📝":"📃"}</span>
                    <div className="file-info">
                      <span className="file-name">{file.name}</span>
                      <span className="file-size">{fmtSize(file.size)}</span>
                    </div>
                    <button className="file-clear" onClick={e=>{e.stopPropagation();setFile(null)}}>✕</button>
                  </div>
                ) : (
                  <div className="drop-content">
                    <div className="drop-icon">☁️</div>
                    <p className="drop-main">Drag & drop your file here</p>
                    <p className="drop-sub">or <span className="drop-browse">browse</span> to upload</p>
                    <div className="drop-types">
                      <span>📄 PDF</span><span>📝 DOCX</span><span>📃 TXT</span><span className="drop-sz">Max 20MB</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="gen-opts" style={{marginTop:14}}>
                <label className="gen-label">Cards:</label>
                <select className="sel" value={fileCount} onChange={e=>setFileCount(Number(e.target.value))} disabled={genLoading}>
                  {COUNTS.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <label className="gen-label" style={{marginLeft:8}}>Language:</label>
                <select className="sel" value={lang} onChange={e=>setLang(e.target.value)} disabled={genLoading}>
                  {LANGS.map(l=><option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
              </div>
              <button className="btn-p full" onClick={handleGenFile} disabled={genLoading||!file} style={{marginTop:12}}>
                {genLoading?<span className="spinner"/>:"🧠"}
                {genLoading?(genPhase==="reading"?"Reading file...":"Generating..."):`Generate ${fileCount} Cards from File`}
              </button>
              {(genLoading||modelStatus)&&<div className="model-bar"><div className={`mdot${modelStatus?.status==="trying"?" trying":modelStatus?.status==="fail"?" fail":""}`}/><span>{modelLabel()}</span></div>}
              {!file&&!genLoading&&<p className="upload-tip">💡 Upload lecture notes, textbook chapters, or any study material — AI extracts the most important concepts automatically.</p>}
            </div>

            {/* Topic Generate */}
            <div className="section-card">
              <div className="section-title">✨ AI — Generate from Topic</div>
              <input className="text-input" type="text" placeholder="e.g. French Revolution, Python basics, Human anatomy..." value={topic} onChange={e=>setTopic(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!genLoading&&handleGenTopic()} disabled={genLoading}/>
              <div className="gen-opts">
                <label className="gen-label">Cards:</label>
                <select className="sel" value={genCount} onChange={e=>setGenCount(Number(e.target.value))} disabled={genLoading}>
                  {COUNTS.map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <label className="gen-label" style={{marginLeft:8}}>Language:</label>
                <select className="sel" value={lang} onChange={e=>setLang(e.target.value)} disabled={genLoading}>
                  {LANGS.map(l=><option key={l.code} value={l.code}>{l.flag} {l.label}</option>)}
                </select>
              </div>
              <button className="btn-p full" onClick={handleGenTopic} disabled={genLoading} style={{marginTop:4}}>
                {genLoading?<span className="spinner"/>:"✨"}
                {genLoading?"Generating...":"Generate Flashcards"}
              </button>
              {(genLoading||modelStatus)&&<div className="model-bar"><div className={`mdot${modelStatus?.status==="trying"?" trying":modelStatus?.status==="fail"?" fail":""}`}/><span>{modelLabel()}</span></div>}
            </div>

            {/* Manual */}
            <div className="section-card">
              <div className="section-title">✍️ Add Manually</div>
              <div className="creator-grid">
                <div>
                  <div className="field-label"><span className="lchip">Q</span> Question</div>
                  <textarea className="textarea" placeholder="What is mitosis?" value={mFront} onChange={e=>setMFront(e.target.value)}/>
                </div>
                <div>
                  <div className="field-label"><span className="lchip">A</span> Answer</div>
                  <textarea className="textarea" placeholder="Cell division producing two identical daughter cells..." value={mBack} onChange={e=>setMBack(e.target.value)}/>
                </div>
              </div>
              <button className="btn-s full" onClick={handleManualAdd}>＋ Add Card</button>
            </div>

            {/* Controls */}
            {cards.length > 0 && (
              <div className="controls">
                <span className="count-pill">{cards.length} card{cards.length!==1?"s":""}</span>
                <button className="ctrl-btn" onClick={()=>{shuffle();setCurrentIdx(0);showToast("info","🔀 Shuffled!")}}>⇄ Shuffle</button>
                <button className="ctrl-btn" onClick={()=>{setCurrentIdx(0);setStudyFlipped(false);}}>↺ Restart</button>
                <button className="ctrl-btn clear-btn" onClick={()=>{if(confirm(`Delete all ${cards.length} cards?`)){clearAll();setCurrentIdx(0);}}}>✕ Clear All</button>
              </div>
            )}

            {/* Study Card */}
            {cards.length > 0 ? (
              <div className="study-sec">
                <div className="card-wrap" onClick={()=>setStudyFlipped(f=>!f)}>
                  <div className={`flashcard${studyFlipped?" flipped":""}`}>
                    <div className="card-face card-front">
                      <span className="card-badge badge-q">Question</span>
                      <p className="card-text">{cards[currentIdx]?.front}</p>
                    </div>
                    <div className="card-face card-back">
                      <span className="card-badge badge-a">Answer</span>
                      <p className="card-text">{cards[currentIdx]?.back}</p>
                    </div>
                  </div>
                </div>
                <p className="tap-hint">Tap to flip · ← → keys · Space flips</p>
                <div className="progress-wrap">
                  <div className="progress-track">
                    <div className="progress-fill" style={{width:`${cards.length>1?(currentIdx/(cards.length-1))*100:100}%`}}/>
                  </div>
                  <p className="progress-text">{currentIdx+1} of {cards.length}</p>
                </div>
                <div className="nav-row">
                  <button className="nav-btn" onClick={()=>{setCurrentIdx(i=>Math.max(0,i-1));setStudyFlipped(false);}} disabled={currentIdx===0}>←</button>
                  <button className="nav-btn" onClick={()=>{setCurrentIdx(i=>Math.min(cards.length-1,i+1));setStudyFlipped(false);}} disabled={currentIdx===cards.length-1}>→</button>
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <span className="empty-emoji">🌸</span>
                <p>No cards yet!<br/><strong>Upload a file</strong> or generate with AI above.<br/><small>Your brain is ready. Let's go! 🧠✨</small></p>
              </div>
            )}

            {/* Card List */}
            {cards.length > 0 && (
              <div className="list-sec">
                <div className="list-header"><span className="list-title">All Cards</span><div className="list-line"/></div>
                <div className="card-list">
                  {cards.map((c,i)=>(
                    <div key={i} className="card-item">
                      <div className="card-item-num">{i+1}</div>
                      <div className="card-item-text">
                        <div className="card-item-front">{c.front}</div>
                        <div className="card-item-back">{c.back}</div>
                      </div>
                      <button className="delete-btn" onClick={()=>{deleteCard(i);if(currentIdx>=cards.length-1)setCurrentIdx(Math.max(0,cards.length-2));}}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </>
  );
}

// ── SUB COMPONENTS ──
function SplashStars() {
  const stars = Array.from({length:80},(_,i)=>({
    id:i, size:Math.random()*3+1, left:Math.random()*100, top:Math.random()*100,
    dur:Math.random()*3+2, delay:Math.random()*4
  }));
  return (
    <div className="splash-stars">
      {stars.map(s=>(
        <div key={s.id} style={{
          position:"absolute",borderRadius:"50%",background:"#fff",
          width:s.size,height:s.size,left:`${s.left}%`,top:`${s.top}%`,
          animation:`twinkle ${s.dur}s ${s.delay}s ease-in-out infinite`
        }}/>
      ))}
    </div>
  );
}

function BgStars() {
  const stars = Array.from({length:60},(_,i)=>({
    id:i, size:Math.random()*2+0.5, left:Math.random()*100, top:Math.random()*100,
    dur:Math.random()*3+2, delay:Math.random()*5
  }));
  return (
    <div className="bg-stars">
      {stars.map(s=>(
        <div key={s.id} style={{
          position:"absolute",borderRadius:"50%",background:"#fff",
          width:s.size,height:s.size,left:`${s.left}%`,top:`${s.top}%`,
          animation:`twinkle ${s.dur}s ${s.delay}s ease-in-out infinite`
        }}/>
      ))}
    </div>
  );
}

function BgOrbs() {
  return (
    <div className="bg-orbs">
      <div className="orb o1"/><div className="orb o2"/><div className="orb o3"/>
    </div>
  );
}

function BgFlowers() {
  const flowers = ["🌸","🌺","🌷","🪷","🌼","🌸","✿","🌺"];
  return (
    <div className="bg-flowers">
      {flowers.map((f,i)=>(
        <div key={i} className="bf" style={{
          left:`${4+i*13}%`,fontSize:`${0.85+Math.random()*0.6}rem`,
          animationDuration:`${18+i*2}s`,animationDelay:`${i*2.5}s`
        }}>{f}</div>
      ))}
    </div>
  );
}

function HeroCard({cardFlipped,setCardFlipped,qaIdx,setQaIdx}) {
  const stageRef = useRef();
  const cardRef = useRef();

  const handleMouseMove = (e) => {
    if (!stageRef.current || !cardRef.current) return;
    const r = stageRef.current.getBoundingClientRect();
    const dx = (e.clientX - r.left - r.width/2) / (r.width/2);
    const dy = (e.clientY - r.top - r.height/2) / (r.height/2);
    cardRef.current.style.transition = "none";
    cardRef.current.style.transform = `rotateY(${dx*13}deg) rotateX(${-dy*9}deg) translateZ(12px)`;
  };
  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transition = "transform 0.5s cubic-bezier(.23,1,.32,1)";
    cardRef.current.style.transform = "rotateY(0) rotateX(0) translateZ(0)";
  };
  const handleClick = () => {
    if (!cardFlipped) {
      setCardFlipped(true);
    } else {
      setCardFlipped(false);
      setQaIdx(i=>(i+1)%QA.length);
    }
  };

  return (
    <div className="stage reveal" style={{transitionDelay:"0.6s"}} ref={stageRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      <div className="c3d c-b2"/><div className="c3d c-b1"/>
      <div className="c3d c-main" ref={cardRef} onClick={handleClick}>
        <div className="c-label">{cardFlipped?"Answer":"Question"}</div>
        <div className="c-q">{cardFlipped?QA[qaIdx].a:QA[qaIdx].q}</div>
        <div className="c-hint">{cardFlipped?"Tap to flip back 🔄":"Tap to flip 💜"}</div>
        <div className="c-flower">🌸</div>
      </div>
      <div className="fbadge fb1">🧠 AI Generated</div>
      <div className="fbadge fb2">🌍 12 Languages</div>
      <div className="fbadge fb3">📂 File Upload</div>
    </div>
  );
}

function LoveLetter({goToTool}) {
  return (
    <section className="love-sec" id="love">
      <div className="love-inner">
        <span className="eyebrow reveal">💌 A Letter Just For You</span>
        <h2 className="sec-title reveal">From the heart,<br/><span>with all the love.</span></h2>
        <div className="heart-widget reveal"><div className="heart-main">💜</div></div>
        <div className="letter-card reveal">
          <div className="letter-stars-wrap">
            {Array.from({length:20},(_,i)=>(
              <div key={i} style={{
                position:"absolute",borderRadius:"50%",background:"#fff",
                width:Math.random()*2+1,height:Math.random()*2+1,
                left:`${Math.random()*100}%`,top:`${Math.random()*100}%`,
                animation:`twinkle ${Math.random()*3+2}s ${Math.random()*4}s ease-in-out infinite`
              }}/>
            ))}
          </div>
          <div className="letter-seal-wrap">💜</div>
          {["💜","🌸","💕","✨","🌷"].map((h,i)=>(
            <div key={i} className="fheart" style={{left:`${10+i*20}%`,animationDuration:`${3+i*0.5}s`,animationDelay:`${i*0.8}s`}}>{h}</div>
          ))}
          <div className="letter-header">
            <div className="letter-to">To my favourite person,<br/><strong>Salmana 🌸</strong></div>
          </div>
          <div className="letter-body">
            <p>I don't know where to start — so I'll start with the truth. <span className="hl">You are one of the most special people I've ever known.</span> The way you laugh, the way you care, the way you work so hard for everything you want — it genuinely makes the world a better place. 🌷</p>
            <p>I made this tool for you. Not just as a project, but as a little piece of <span className="lw">I love you</span> wrapped in code. Every button, every animation, every floating flower — all of it was made thinking of you.</p>
            <p>You stress too much about exams. You stay up too late. You worry you won't remember everything. But Salmana — <span className="hl">you are so much smarter and stronger than you think.</span> And now you have a tool that works as hard as you do. 💪</p>
            <p>Upload your notes. Let AI do the boring part. Flip through cards. And while you're studying, just know that somewhere, someone is incredibly proud of you — not for your grades, but for <span className="lw">who you are.</span></p>
            <p>You deserve every good thing coming your way. <span className="hl">I love you, Salmana. More than all the flashcards in the world. 🌸</span></p>
          </div>
          <div className="letter-footer">
            <div className="letter-from">Yours truly,<br/><strong>Your Weirdo 💜</strong></div>
            <div style={{fontSize:"1.8rem",animation:"heartBeat 1.5s ease-in-out infinite"}}>💜🌸💜</div>
          </div>
        </div>
        <div className="quote-card reveal">
          <span className="qmark">"</span>
          <p className="qtext">The secret to getting ahead is getting started. And the secret to getting started is breaking your complex, overwhelming tasks into small, manageable steps.</p>
          <div className="qflower">🌺</div>
        </div>
      </div>
    </section>
  );
}

function LangStrip() {
  return (
    <section className="lang-sec">
      <p className="lang-t">12 Languages supported</p>
      <div className="lang-track">
        {[...LANGS,...LANGS].map((l,i)=>(
          <div key={i} className="chip">{l.flag} {l.label}</div>
        ))}
      </div>
    </section>
  );
}
