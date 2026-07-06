import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { AuthScreen } from '../components/AuthScreen.js';

interface LandingPageProps {
  onLogin: () => void;
  showAuth: boolean;
  onCloseAuth: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onLogin, showAuth, onCloseAuth }) => {
  const [scrolled, setScrolled] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'pipeline' | 'brain' | 'moodboards' | 'editor'>('today');
  const [previewSearch, setPreviewSearch] = useState('');

  const handlePreviewSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const query = e.target.value;
    setPreviewSearch(query);
    
    const normalized = query.trim().toLowerCase();
    if (normalized === 'today' || normalized === 'heute') {
      setActiveTab('today');
    } else if (normalized === 'pipeline') {
      setActiveTab('pipeline');
    } else if (normalized === 'brain' || normalized === 'graph') {
      setActiveTab('brain');
    } else if (normalized === 'moodboard' || normalized === 'moodboards' || normalized === 'canvas') {
      setActiveTab('moodboards');
    } else if (normalized === 'editor' || normalized === 'schreiben') {
      setActiveTab('editor');
    }
  };

  const handlePreviewSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const normalized = previewSearch.trim().toLowerCase();
      if (normalized.includes('today') || normalized.includes('heute')) {
        setActiveTab('today');
        setPreviewSearch('');
      } else if (normalized.includes('pipeline')) {
        setActiveTab('pipeline');
        setPreviewSearch('');
      } else if (normalized.includes('brain') || normalized.includes('graph')) {
        setActiveTab('brain');
        setPreviewSearch('');
      } else if (normalized.includes('mood') || normalized.includes('asset') || normalized.includes('canvas')) {
        setActiveTab('moodboards');
        setPreviewSearch('');
      } else if (normalized.includes('edit') || normalized.includes('write') || normalized.includes('schreiben')) {
        setActiveTab('editor');
        setPreviewSearch('');
      }
    }
  };

  // Scroll effect for navigation bar styling
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Dynamically inject Tailwind CSS CDN and Google Fonts for isolation
  useEffect(() => {
    const tailwindScript = document.createElement('script');
    tailwindScript.src = "https://cdn.tailwindcss.com?plugins=forms,container-queries";
    tailwindScript.id = "tailwind-cdn-landing";
    document.head.appendChild(tailwindScript);

    const fontLink = document.createElement('link');
    fontLink.href = "https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&display=swap";
    fontLink.rel = "stylesheet";
    fontLink.id = "font-link-landing";
    document.head.appendChild(fontLink);

    const iconsLink = document.createElement('link');
    iconsLink.href = "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200";
    iconsLink.rel = "stylesheet";
    iconsLink.id = "icons-link-landing";
    document.head.appendChild(iconsLink);

    return () => {
      document.getElementById('tailwind-cdn-landing')?.remove();
      document.getElementById('font-link-landing')?.remove();
      document.getElementById('icons-link-landing')?.remove();
    };
  }, []);

  return (
    <div className="antialiased min-h-screen flex flex-col overflow-x-hidden selection:bg-emerald-800 selection:text-white bg-[#FAFAF8] text-[#111111]">
      
      {/* Dynamic Style overrides */}
      <style dangerouslySetInnerHTML={{ __html: `
        body { 
          background-color: #FAFAF8 !important; 
          color: #111111 !important; 
          font-family: 'Geist', sans-serif !important;
          letter-spacing: -0.015em !important;
        }
        .swiss-headline {
          letter-spacing: -0.03em !important;
          line-height: 1.1 !important;
          font-weight: 700 !important;
        }
        .spring-transition {
          transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        @keyframes pulse-connection {
          0% { stroke-dashoffset: 24; }
          100% { stroke-dashoffset: 0; }
        }
        .animate-connection {
          stroke-dasharray: 6 6;
          animation: pulse-connection 2s linear infinite;
        }
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .material-symbols-outlined {
          font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
          vertical-align: middle;
        }
      `}} />

      {/* NAVIGATION */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrolled ? 'bg-[#FAFAF8]/95 border-b border-neutral-200' : 'bg-[#FAFAF8]/80 backdrop-blur-md border-b border-transparent'}`}>
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 flex justify-between items-center h-[64px]">
          <div className="flex items-center gap-10">
            <a className="flex items-center gap-2.5 text-base font-bold tracking-tight text-neutral-900" href="#">
              <img src="/logo-mark.png" alt="Creator OS" className="w-5 h-5 object-contain rounded" onError={(e) => e.currentTarget.style.display = 'none'} />
              <span>Creator OS</span>
              <span className="text-[9px] font-medium tracking-[0.1em] text-neutral-400 uppercase -ml-1">by Pronoia</span>
            </a>
            <div className="hidden md:flex items-center gap-6 text-[13px] font-medium text-neutral-500">
              <a href="#features" className="hover:text-neutral-900 transition-colors">Features</a>
              <a href="#workspace" className="hover:text-neutral-900 transition-colors">Workspace</a>
              <a href="#ai-philosophy" className="hover:text-neutral-900 transition-colors">Vision</a>
            </div>
          </div>
          <div className="flex items-center gap-4 text-[13px] font-medium">
            <button onClick={onLogin} className="hover:text-neutral-950 text-neutral-500 transition-colors">Sign In</button>
            <button onClick={onLogin} className="bg-black text-[#FAFAF8] px-4 py-2 rounded-lg font-semibold hover:bg-neutral-800 transition-all shadow-sm">
              Join Beta
            </button>
          </div>
        </div>
      </nav>

      {/* MAIN CONTAINER */}
      <main className="flex-grow pt-[130px] pb-24">

        {/* HERO SECTION */}
        <section className="max-w-[1200px] mx-auto px-6 sm:px-10 mb-24 text-center">
          
          
          <div className="inline-flex items-center gap-2 bg-white border border-neutral-200 px-3 py-1 rounded-full shadow-sm mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A53] animate-pulse"></span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Private Beta</span>
            <span className="text-[9px] text-neutral-200 font-bold">|</span>
            <span className="text-[10px] text-[#1F7A53] font-semibold">Cognitive operating system</span>
          </div>
          
          <h1 className="swiss-headline text-5xl sm:text-7xl lg:text-[80px] max-w-4xl mx-auto mb-6 text-neutral-900 font-extrabold leading-[1.05]">
            Turn your knowledge into an operating system.
          </h1>
          
          <p className="text-base sm:text-lg text-neutral-500 max-w-2xl mx-auto leading-relaxed mb-8">
            Creator OS connects notes, research, videos and ideas into one evolving, distraction-free cognitive workspace.
          </p>
          
          <div className="flex justify-center items-center gap-4 mb-20">
            <button onClick={onLogin} className="bg-[#1F7A53] text-[#FAFAF8] px-6 py-3 rounded-lg font-semibold hover:bg-emerald-800 transition-all shadow-sm text-sm">
              Request Access
            </button>
            <button onClick={onLogin} className="bg-white border border-neutral-200 text-neutral-900 px-6 py-3 rounded-lg font-semibold hover:bg-neutral-50 transition-all text-sm">
              Watch Demo
            </button>
          </div>

          
          <div className="w-full max-w-[1000px] mx-auto bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden flex flex-col h-[520px]">
            
            
            <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-200"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-200"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-neutral-200"></span>
              </div>
              <div className="bg-white border border-neutral-200 px-3 py-1.5 rounded-lg flex items-center gap-2 shadow-sm text-[11px] text-neutral-500 font-medium">
                <span className="material-symbols-outlined text-[14px]">search</span>
                <input 
                  type="text" 
                  placeholder="Search workspace (e.g. today, brain)..." 
                  value={previewSearch}
                  onChange={handlePreviewSearchChange}
                  onKeyDown={handlePreviewSearchKeyDown}
                  className="w-52 bg-transparent border-none text-left focus:outline-none text-[11px] text-neutral-800 placeholder-neutral-400 p-0 font-medium h-4"
                />
                <span className="font-mono text-[9px] text-neutral-400 bg-neutral-100 px-1 rounded">⌘K</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#1F7A53]"></span>
                <span className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider">Sync: Active</span>
              </div>
            </div>

            
            <div className="flex-grow flex overflow-hidden">
              
              
              <aside className="w-[200px] border-r border-neutral-200 bg-neutral-50 p-4 flex flex-col justify-between text-left shrink-0">
                <div className="space-y-6">
                  <div>
                    <span className="text-[9px] font-bold text-neutral-400 uppercase tracking-widest block mb-2 font-sans">Workspace</span>
                    <nav className="space-y-1">
                      <button onClick={() => setActiveTab('today')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-lg text-left spring-transition ${activeTab === 'today' ? 'bg-white border border-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                        <span className={`material-symbols-outlined text-[16px] ${activeTab === 'today' ? 'text-[#1F7A53]' : ''}`}>today</span>
                        Today
                      </button>
                      <button onClick={() => setActiveTab('pipeline')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-lg text-left spring-transition ${activeTab === 'pipeline' ? 'bg-white border border-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                        <span className={`material-symbols-outlined text-[16px] ${activeTab === 'pipeline' ? 'text-[#1F7A53]' : ''}`}>view_kanban</span>
                        Pipeline
                      </button>
                      <button onClick={() => setActiveTab('brain')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-lg text-left spring-transition ${activeTab === 'brain' ? 'bg-white border border-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                        <span className={`material-symbols-outlined text-[16px] ${activeTab === 'brain' ? 'text-[#1F7A53]' : ''}`}>hub</span>
                        Brain
                      </button>
                      <button onClick={() => setActiveTab('moodboards')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-lg text-left spring-transition ${activeTab === 'moodboards' ? 'bg-white border border-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                        <span className={`material-symbols-outlined text-[16px] ${activeTab === 'moodboards' ? 'text-[#1F7A53]' : ''}`}>collections</span>
                        Moodboards
                      </button>
                      <button onClick={() => setActiveTab('editor')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-xs font-semibold rounded-lg text-left spring-transition ${activeTab === 'editor' ? 'bg-white border border-neutral-200 text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100'}`}>
                        <span className={`material-symbols-outlined text-[16px] ${activeTab === 'editor' ? 'text-[#1F7A53]' : ''}`}>edit_document</span>
                        Editor
                      </button>
                    </nav>
                  </div>
                </div>
                
                <div className="border-t border-neutral-200 pt-4 flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded bg-[#1F7A53] flex items-center justify-center text-[10px] font-bold text-white uppercase font-mono">C</div>
                  <div>
                    <div className="text-[10px] font-bold text-neutral-900 leading-none">Creator OS</div>
                    <div className="text-[8px] text-neutral-500 mt-0.5">by Pronoia</div>
                  </div>
                </div>
              </aside>

              
              <main className="flex-grow bg-white p-6 md:p-8 text-left overflow-y-auto no-scrollbar relative">
                
                {/* VIEW 1: TODAY WORKSPACE */}
                {activeTab === 'today' && (
                  <div className="space-y-6 spring-transition">
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900">Executive Priority Stack</h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">Running Multi-Objective Optimization Engine</p>
                      </div>
                      <span className="bg-emerald-50 text-[#1F7A53] px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-emerald-100">Deep Work Active</span>
                    </div>
                    
                    <div className="bg-neutral-50 border border-neutral-200 p-6 rounded-xl space-y-3">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Today's Executive Recommendation</span>
                      <h4 className="text-xl font-bold text-neutral-900">"Define brand style DNA language"</h4>
                      <div className="flex gap-4 text-[10px] font-mono text-neutral-500">
                        <span>✦ Priority: 8.5/10</span>
                        <span>✦ Context: Available (90 mins)</span>
                        <span>✦ Focus: High ROI Target</span>
                      </div>
                    </div>
                    
                    <div>
                      <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider block mb-3">HEUTE ENTDECKT</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="border border-neutral-200 p-3 rounded-lg bg-neutral-50/50">
                          <div className="text-base font-bold">2</div>
                          <div className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5">Matured Concepts</div>
                        </div>
                        <div className="border border-neutral-200 p-3 rounded-lg bg-neutral-50/50">
                          <div className="text-base font-bold">5</div>
                          <div className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5">New Thoughts</div>
                        </div>
                        <div className="border border-neutral-200 p-3 rounded-lg bg-neutral-50/50">
                          <div className="text-base font-bold">0</div>
                          <div className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5">Contradictions</div>
                        </div>
                        <div className="border border-neutral-200 p-3 rounded-lg bg-neutral-50/50">
                          <div className="text-base font-bold">3</div>
                          <div className="text-[9px] text-neutral-500 uppercase tracking-wider mt-0.5">Open Gaps</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIEW 2: PIPELINE WORKSPACE */}
                {activeTab === 'pipeline' && (
                  <div className="space-y-6 spring-transition">
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900">Content Pipeline</h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">Organize writing from strategy draft to publish</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-2">
                        <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Queue</span>
                        <div className="border border-neutral-200 bg-neutral-50 p-3 rounded-lg text-xs font-semibold text-neutral-900">Design audit list</div>
                        <div className="border border-neutral-200 bg-neutral-50 p-3 rounded-lg text-xs font-semibold text-neutral-900">Concept ideation draft</div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Drafting</span>
                        <div className="border border-neutral-200 bg-neutral-50 p-3 rounded-lg text-xs font-semibold text-neutral-900">Brand guidelines layout</div>
                      </div>
                      <div className="space-y-2">
                        <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Done / Published</span>
                        <div className="border border-neutral-200 bg-neutral-50 p-3 rounded-lg text-xs font-semibold text-neutral-400 line-through">Cognitive Wireframes v1</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIEW 3: BRAIN WORKSPACE */}
                {activeTab === 'brain' && (
                  <div className="space-y-6 spring-transition">
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900">Brain Index Graph</h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">Semantic memory map generated by KnowledgeEvaluator</p>
                      </div>
                    </div>
                    <div className="border border-neutral-200 rounded-xl p-4 h-[260px] flex items-center justify-center bg-neutral-50/50">
                      <svg className="w-full h-full text-neutral-350" viewBox="0 0 600 200">
                        <line x1="100" y1="100" x2="250" y2="60" stroke="#ECECEC" strokeWidth="1.5"/>
                        <line x1="250" y1="60" x2="400" y2="120" stroke="#ECECEC" strokeWidth="1.5"/>
                        <line x1="400" y1="120" x2="500" y2="50" stroke="#ECECEC" strokeWidth="1.5"/>
                        <line x1="250" y1="60" x2="350" y2="160" stroke="#ECECEC" strokeWidth="1.5"/>
                        
                        <circle cx="100" cy="100" r="5" fill="#1F7A53"/>
                        <text x="100" y="118" textAnchor="middle" fill="#111" fontSize="9" fontWeight="bold">Core Draft</text>

                        <circle cx="250" cy="60" r="5" fill="#111"/>
                        <text x="250" y="45" textAnchor="middle" fill="#111" fontSize="9" fontWeight="bold">Ideas Index</text>

                        <circle cx="400" cy="120" r="5" fill="#1F7A53"/>
                        <text x="400" y="138" textAnchor="middle" fill="#111" fontSize="9" fontWeight="bold">Strategy.pdf</text>

                        <circle cx="500" cy="50" r="5" fill="#6B7280"/>
                        <text x="500" y="35" textAnchor="middle" fill="#6B7280" fontSize="9">Moodboard</text>

                        <circle cx="350" cy="160" r="5" fill="#6B7280"/>
                        <text x="350" y="178" textAnchor="middle" fill="#6B7280" fontSize="9">Reference</text>
                      </svg>
                    </div>
                  </div>
                )}

                {/* VIEW 4: MOODBOARDS WORKSPACE */}
                {activeTab === 'moodboards' && (
                  <div className="space-y-6 spring-transition">
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900">Moodboards</h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">Capturing raw references and links</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      <div className="bg-neutral-100 border border-neutral-200 aspect-square rounded-lg flex items-center justify-center">
                        <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Asset_Grid.png</span>
                      </div>
                      <div className="bg-neutral-100 border border-neutral-200 aspect-square rounded-lg flex items-center justify-center">
                        <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Strategy_Book.pdf</span>
                      </div>
                      <div className="bg-white border border-neutral-200 p-3 rounded-lg flex flex-col justify-between">
                        <span className="text-[8px] uppercase tracking-wider text-neutral-500 font-semibold">Tweet</span>
                        <p className="text-[9px] text-neutral-700 italic">"Design around cognitive load."</p>
                      </div>
                      <div className="bg-neutral-100 border border-neutral-200 aspect-square rounded-lg flex items-center justify-center">
                        <span className="text-[9px] uppercase font-bold text-neutral-400 tracking-wider">Reference_Shot.jpg</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* VIEW 5: EDITOR WORKSPACE */}
                {activeTab === 'editor' && (
                  <div className="space-y-6 spring-transition">
                    <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                      <div>
                        <h3 className="text-lg font-bold text-neutral-900">Focused Content Editor</h3>
                        <p className="text-[11px] text-neutral-500 mt-0.5">Zero-distraction workspace for production</p>
                      </div>
                    </div>
                    <div className="space-y-4 max-w-lg mx-auto py-4">
                      <h4 className="text-xl font-bold text-neutral-850">Writing in Creator OS</h4>
                      <p className="text-xs text-neutral-650 leading-relaxed">
                        Creator OS actively indexes your library concepts in the background. Relevant strategies and bookmark guidelines show up along the screen margin as you write, without interrupting your text input.
                      </p>
                    </div>
                  </div>
                )}

              </main>

            </div>
          </div>

        </section>

        
        <section className="max-w-[1200px] mx-auto px-6 sm:px-10 mb-32 border-t border-neutral-200 pt-24">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="swiss-headline text-4xl sm:text-5xl text-neutral-900 mb-4 font-bold">
              Everything connected.
            </h2>
            <p className="text-sm text-neutral-500 max-w-md mx-auto leading-relaxed">
              Watch documents and concepts align instantly from raw notes to published outputs.
            </p>
          </div>

          
          <div className="max-w-4xl mx-auto bg-white border border-neutral-200 rounded-xl p-8 shadow-sm flex flex-col md:flex-row justify-between items-center relative overflow-hidden gap-12 md:gap-4">
            
            <div className="absolute inset-0 pointer-events-none hidden md:block">
              <svg className="w-full h-full" fill="none">
                <path d="M120 100 H 780" stroke="#ECECEC" strokeWidth="2"/>
                <path d="M120 100 H 780" stroke="#1F7A53" strokeWidth="2" className="animate-connection"/>
              </svg>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 p-5 rounded-xl w-48 text-center shadow-sm z-10">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-neutral-200 mx-auto mb-3">
                <span className="material-symbols-outlined text-[20px] text-[#1F7A53]">edit_note</span>
              </div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Raw Notes</h4>
              <p className="text-[10px] text-neutral-500 mt-1">Capture ideas, strategies and links instantly.</p>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 p-5 rounded-xl w-48 text-center shadow-sm z-10">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-neutral-200 mx-auto mb-3">
                <span className="material-symbols-outlined text-[20px] text-[#1F7A53]">hub</span>
              </div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Brain Graph</h4>
              <p className="text-[10px] text-neutral-500 mt-1">Automatic semantic mapping in the background.</p>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 p-5 rounded-xl w-48 text-center shadow-sm z-10">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-neutral-200 mx-auto mb-3">
                <span className="material-symbols-outlined text-[20px] text-[#1F7A53]">view_kanban</span>
              </div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Pipeline</h4>
              <p className="text-[10px] text-neutral-500 mt-1">Structure drafts and outlines into delivery channels.</p>
            </div>

            <div className="bg-neutral-50 border border-neutral-200 p-5 rounded-xl w-48 text-center shadow-sm z-10">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-neutral-200 mx-auto mb-3">
                <span className="material-symbols-outlined text-[20px] text-[#1F7A53]">send</span>
              </div>
              <h4 className="text-xs font-bold text-neutral-900 uppercase tracking-wider">Published</h4>
              <p className="text-[10px] text-neutral-500 mt-1">Export drafts and system insights to the web.</p>
            </div>

          </div>
        </section>

        
        <section id="features" className="max-w-[1200px] mx-auto px-6 sm:px-10 mb-32 border-t border-neutral-200 pt-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 lg:gap-16">
            
            <div className="flex flex-col gap-5 items-start">
              <div className="w-12 h-12 bg-white rounded-xl border border-neutral-200 flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[#1F7A53] text-[22px]">psychology</span>
              </div>
              <h3 className="swiss-headline text-3xl text-neutral-900 mt-2 font-bold">Think</h3>
              <p className="text-[11px] font-bold text-[#1F7A53] uppercase tracking-widest -mt-2">Collect everything</p>
              <p className="text-sm text-neutral-500 leading-relaxed font-medium">
                Index files, strategy pdfs, videos, quotes, and research papers. Pronoia processes materials without requiring manual tag configuration.
              </p>
            </div>

            <div className="flex flex-col gap-5 items-start">
              <div className="w-12 h-12 bg-white rounded-xl border border-neutral-200 flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[#1F7A53] text-[22px]">edit_document</span>
              </div>
              <h3 className="swiss-headline text-3xl text-neutral-900 mt-2 font-bold">Write</h3>
              <p className="text-[11px] font-bold text-[#1F7A53] uppercase tracking-widest -mt-2">Build ideas into content</p>
              <p className="text-sm text-neutral-500 leading-relaxed font-medium">
                A distraction-free writing environment. The software actively tracks your thesis and floats contextual connections right on the margins.
              </p>
            </div>

            <div className="flex flex-col gap-5 items-start">
              <div className="w-12 h-12 bg-white rounded-xl border border-neutral-200 flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[#1F7A53] text-[22px]">query_stats</span>
              </div>
              <h3 className="swiss-headline text-3xl text-neutral-900 mt-2 font-bold">Learn</h3>
              <p className="text-[11px] font-bold text-[#1F7A53] uppercase tracking-widest -mt-2">The system improves with you</p>
              <p className="text-sm text-neutral-500 leading-relaxed font-medium">
                Your strategic decisions and publishing parameters form a continuous feedback loop, refining the system's reasoning confidence over time.
              </p>
            </div>

          </div>
        </section>

        
        <section className="max-w-[1200px] mx-auto px-6 sm:px-10 mb-32 border-t border-neutral-200 pt-24">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="swiss-headline text-4xl sm:text-5xl text-neutral-900 mb-4 font-bold">
              One unified workspace view.
            </h2>
            <p className="text-sm text-neutral-500 max-w-md mx-auto leading-relaxed">
              Connect Today priority queue, Pipelines, the Brain graph, Moodboards, and Editor into a single continuous workspace.
            </p>
          </div>

          
          <div className="bg-white border border-neutral-200 rounded-xl shadow-xl overflow-hidden p-6 md:p-8 max-w-4xl mx-auto">
            <div className="border border-neutral-200 bg-neutral-50/50 rounded-xl p-4 md:p-8 flex flex-col md:flex-row justify-between items-start gap-8 min-h-[300px]">
              <div className="space-y-4 max-w-md">
                <div className="flex items-center gap-2.5">
                  <span className="bg-[#1F7A53] text-[#FAFAF8] px-2.5 py-1 rounded text-[9px] font-bold uppercase tracking-wider">Evolving</span>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold tracking-wider">Workspace Node #124</span>
                </div>
                <h4 className="swiss-headline text-2xl text-neutral-900 font-bold">Connecting strategy to delivery</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-medium">
                  Instead of jumping across disconnected productivity tools, Pronoia maintains your creative context across all modes, helping you produce high-quality work in less time.
                </p>
              </div>
              <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-sm w-full md:w-80 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
                  <span className="text-[10px] font-bold text-neutral-900 uppercase tracking-wider">Active Workspace Modules</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1F7A53]"></span>
                </div>
                <div className="space-y-2 text-xs font-semibold text-neutral-900 text-left">
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded border border-neutral-200">
                    <span className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-[#1F7A53]">today</span> Today priority queue</span>
                    <span className="text-[10px] text-neutral-400 font-medium">Synced</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded border border-neutral-200">
                    <span className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-[#1F7A53]">view_kanban</span> Content pipeline</span>
                    <span className="text-[10px] text-neutral-400 font-medium">Drafting</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-neutral-50 rounded border border-neutral-200">
                    <span className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-[#1F7A53]">hub</span> Semantic Brain graph</span>
                    <span className="text-[10px] text-neutral-400 font-medium">1.2k Nodes</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        
        <section id="ai-philosophy" className="max-w-[1200px] mx-auto px-6 sm:px-10 mb-32 border-t border-neutral-200 pt-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
            
            <div className="lg:col-span-5 flex flex-col gap-6 items-start">
              <span className="text-[11px] tracking-[0.2em] uppercase font-bold text-[#1F7A53]">Cognitive Design</span>
              <h2 className="swiss-headline text-5xl sm:text-6xl text-neutral-900 tracking-tight max-w-sm font-bold">
                The AI stays quiet. Until it matters.
              </h2>
              <p className="text-sm text-neutral-500 leading-relaxed font-medium">
                We don't build chat text boxes that interrupt your writing. Pronoia indexes in the background and surfaces suggestions precisely when you need them.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6 lg:pl-8">
              <div className="bg-white border border-neutral-200 p-6 rounded-xl shadow-sm">
                <span className="text-[9px] uppercase tracking-wider text-[#1F7A53] font-bold block mb-1">Feature 01</span>
                <h4 className="text-base font-bold text-neutral-900 mb-2">Ambient Suggestions</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-medium">
                  Quietly lists matching documents, links, and PDF quotes in the screen margin as you type.
                </p>
              </div>
              <div className="bg-white border border-neutral-200 p-6 rounded-xl shadow-sm">
                <span className="text-[9px] uppercase tracking-wider text-[#1F7A53] font-bold block mb-1">Feature 02</span>
                <h4 className="text-base font-bold text-neutral-900 mb-2">Cognitive Reasoning</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-medium">
                  Uses our Executive Function Engine to prioritize decisions based on deadline pressure and ROI.
                </p>
              </div>
              <div className="bg-white border border-neutral-200 p-6 rounded-xl shadow-sm">
                <span className="text-[9px] uppercase tracking-wider text-[#1F7A53] font-bold block mb-1">Feature 03</span>
                <h4 className="text-base font-bold text-neutral-900 mb-2">Traceability</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-medium">
                  Trace every suggestion or outlined note back to its original research file in one click.
                </p>
              </div>
              <div className="bg-white border border-neutral-200 p-6 rounded-xl shadow-sm">
                <span className="text-[9px] uppercase tracking-wider text-[#1F7A53] font-bold block mb-1">Feature 04</span>
                <h4 className="text-base font-bold text-neutral-900 mb-2">Knowledge Evaluation</h4>
                <p className="text-xs text-neutral-500 leading-relaxed font-medium">
                  Runs structural validation rules to flag contradictions and check information quality metrics.
                </p>
              </div>
            </div>

          </div>
        </section>

        
        <section className="max-w-[1200px] mx-auto px-6 sm:px-10 text-center py-24 border-t border-neutral-200">
          <h2 className="swiss-headline text-5xl sm:text-7xl text-neutral-900 max-w-3xl mx-auto mb-6 font-bold leading-tight">
            Build your second brain. That actually thinks.
          </h2>
          <div className="flex justify-center items-center gap-4 mt-8">
            <button onClick={onLogin} className="bg-[#1F7A53] text-[#FAFAF8] px-8 py-3.5 rounded-lg font-semibold hover:bg-emerald-800 transition-all shadow-sm text-sm">
              Join Beta
            </button>
            <button onClick={onLogin} className="bg-white border border-neutral-200 text-neutral-900 px-8 py-3.5 rounded-lg font-semibold hover:bg-neutral-50 transition-all text-sm">
              Request Access
            </button>
          </div>
        </section>

      </main>

      
      <footer className="w-full border-t border-neutral-200 bg-transparent py-12">
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-4">
            <img src="/logo-mark.png" alt="Creator OS Logo" className="w-4 h-4 object-contain grayscale" onError={(e) => e.currentTarget.style.display = 'none'} />
            <span className="text-sm font-bold tracking-tight text-neutral-900">Creator OS</span>
            <span className="text-xs text-neutral-500">© 2026 Creator OS by Pronoia. Engineered for precision.</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-xs font-semibold text-neutral-500">
            <a className="hover:text-neutral-900 transition-colors" href="#">Twitter</a>
            <a className="hover:text-neutral-900 transition-colors" href="#">GitHub</a>
            <a className="hover:text-neutral-900 transition-colors" href="#">Terms</a>
            <a className="hover:text-neutral-900 transition-colors" href="#">Privacy</a>
          </div>
        </div>
      </footer>

      {/* ─── Auth Modal Overlay ─── */}
      {showAuth && (
        <div 
          onClick={onCloseAuth}
          className="fixed inset-0 z-[1000] bg-black/10 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out] cursor-default"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl border border-neutral-200 relative shadow-2xl max-w-[400px] w-full max-h-[90vh] overflow-y-auto no-scrollbar p-8"
          >
            <button 
              onClick={onCloseAuth} 
              className="absolute top-5 right-5 text-neutral-400 hover:text-neutral-900 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <AuthScreen />
          </div>
        </div>
      )}

    </div>
  );
};
