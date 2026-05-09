'use client';

import { useState, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Percent,
  Wallet,
  Activity,
  ArrowRight,
  ShieldCheck,
  Zap,
  RefreshCw,
  Info,
  Mic,
  Image as ImageIcon,
  X
} from 'lucide-react';

const EXAMPLES = [
  {
    label: 'Provision Shop',
    text: 'I get provision shop for Ibogun. Every day I dey sell like 30k. But transport to go buy market na 3k. I join one Ajo wey I dey contribute 2k every day. I no owe anybody, but some students owe me like 5k.',
  },
  {
    label: 'Pure Water',
    text: 'Omo, things hard right now. I carry 50k buy pure water and soft drinks last week. I don sell half, but I use 15k buy medicine for my pikin, and police collect 5k from me. Now I no get money to restock.',
  },
  {
    label: 'Accessories',
    text: 'Market dey move well well. I sell phone accessories for Sagamu. Yesterday I make 50k, today 40k. But the problem be say I collect goods on credit from Alaba, I owe them 200k. Plus shop rent dey due next month, na 150k.',
  },
];

const SYSTEM_INSTRUCTION = `You are "Oja-Score Pro", a specialized financial risk engine for West African MSMEs. Your task is to transform informal, conversational business updates into high-fidelity financial profiles.

### CORE LOGIC STEPS:
1. DATA EXTRACTION: Identify Daily Sales (S), Direct Expenses (E), Informal Savings/Ajo (A), and Total Debt (D).
2. MONTHLY PROJECTION: Calculate Monthly Revenue (R) as S * 26 (assuming 6 trading days/week).
3. PROFIT MARGIN: Estimate Net Profit (P) as R - (E * 26 usually, or just apply logic contextually). 
4. SAVINGS DISCIPLINE: Evaluate 'A' as a percentage of 'P'. High savings ratio = High reliability.
5. DEBT RATIO: Compare 'D' against 'R'. If D > R, the risk is Critical.

### CREDIT SCORE CALCULATION (Internal weighting):
- 40% Savings Consistency (Is there an Ajo/Esusu mentioned?)
- 30% Turnover Velocity (How fast is inventory moving?)
- 30% Debt-to-Income (Is the debt manageable?)

### TONE: 
Friendly, polite, and professional Nigerian English/Pidgin.

### OUTPUT RULES:
- You MUST only output a single code block containing a valid JSON object.
- NO prose outside the JSON.
- If data is missing (e.g., they didn't mention debt), use a reasonable industry average and flag it in 'top_risks'.
`;

interface OjaScore {
  financial_metrics: {
    est_monthly_revenue: number;
    est_net_profit: number;
    burn_rate_percent: number;
    ajo_contribution_monthly: number;
  };
  risk_profile: {
    score: number;
    status: 'Approved' | 'Review Required' | 'Declined';
    top_risks: string[];
    strengths: string[];
  };
  insights: {
    business_health_label: 'Thriving' | 'Stable' | 'Struggling';
    next_best_action: string;
  };
}

export default function Page() {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<OjaScore | null>(null);
  const [error, setError] = useState('');

  // Multimodal state
  const [isRecording, setIsRecording] = useState(false);
  const [imageData, setImageData] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  const handleMicrophoneClick = () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      return;
    }

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-NG'; // Nigerian English

    recognition.onstart = () => {
      setIsRecording(true);
      setError('');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) {
        setInputText((prev) => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + finalTranscript);
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsRecording(false);
      setError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const handleImageUploadClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round(height * (MAX_WIDTH / width));
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round(width * (MAX_HEIGHT / height));
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
            setImageData(dataUrl);
          } else {
            setImageData(reader.result as string);
          }
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
    // reset input so the same file could be selected again if removed
    if (e.target) {
        e.target.value = '';
    }
  };

  const handleAnalyze = async () => {
    if (!inputText.trim() && !imageData) return;
    
    setIsAnalyzing(true);
    setError('');
    
    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('Gemini API key is not configured.');
      }
      
      const ai = new GoogleGenAI({ apiKey });
      
      const parts: any[] = [];
      if (inputText.trim()) {
        parts.push({ text: inputText });
      }
      if (imageData) {
        const base64Data = imageData.split(',')[1];
        const mimeType = imageData.match(/[^:]\w+\/[\w-+\d.]+(?=;|,)/)?.[0] || 'image/jpeg';
        parts.push({ inlineData: { data: base64Data, mimeType } });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: parts,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              financial_metrics: {
                type: Type.OBJECT,
                properties: {
                  est_monthly_revenue: { type: Type.INTEGER },
                  est_net_profit: { type: Type.INTEGER },
                  burn_rate_percent: { type: Type.INTEGER },
                  ajo_contribution_monthly: { type: Type.INTEGER }
                },
                required: ["est_monthly_revenue", "est_net_profit", "burn_rate_percent", "ajo_contribution_monthly"]
              },
              risk_profile: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.INTEGER },
                  status: { type: Type.STRING, enum: ["Approved", "Review Required", "Declined"] },
                  top_risks: { type: Type.ARRAY, items: { type: Type.STRING } },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["score", "status", "top_risks", "strengths"]
              },
              insights: {
                type: Type.OBJECT,
                properties: {
                  business_health_label: { type: Type.STRING, enum: ["Thriving", "Stable", "Struggling"] },
                  next_best_action: { type: Type.STRING }
                },
                required: ["business_health_label", "next_best_action"]
              }
            },
            required: ["financial_metrics", "risk_profile", "insights"]
          }
        }
      });
      
      const textResult = response.text;
      if (textResult) {
        setResult(JSON.parse(textResult));
      } else {
        throw new Error('Empty response from AI engine.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to analyze business data.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatNaira = (amount: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Approved': return 'text-black bg-green-500';
      case 'Review Required': return 'text-black bg-yellow-400';
      case 'Declined': return 'text-white bg-red-600';
      default: return 'text-white bg-white/20';
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return '#22c55e'; // green-500
    if (score >= 40) return '#facc15'; // yellow-400
    return '#dc2626'; // red-600
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans flex flex-col overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-white/20 pb-6 pt-8 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex justify-between items-baseline">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter uppercase">OjaScore <span className="text-yellow-400">.</span></h1>
          <div className="text-right uppercase tracking-widest text-[10px] sm:text-xs font-bold opacity-60">
            AI Risk Engine <br/> Financial Pulse v2.4
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 flex flex-col flex-grow w-full">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 flex-grow">
          
          {/* LEFT COLUMN: Input Section */}
          <div className="lg:col-span-5 flex flex-col h-full lg:min-h-[600px]">
            <div className="mb-6">
              <h2 className="text-xs uppercase tracking-[0.3em] font-bold text-yellow-400 mb-2">Assess Business Health</h2>
              <p className="text-white/60 leading-relaxed text-sm">
                Paste conversational updates or interview notes from the merchant. Our AI will instantly structure the data into an actionable credit profile.
              </p>
            </div>

            <div className="flex-grow bg-white/5 p-6 border border-white/20 flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <label htmlFor="business-update" className="block text-[10px] uppercase font-bold text-white/50 tracking-widest">
                  Merchant Update (Voice-to-Text or Chat)
                </label>
                <div className="flex gap-2">
                  <button 
                    onClick={handleMicrophoneClick}
                    className={`p-2 rounded-full border transition-colors ${
                      isRecording 
                        ? 'border-red-500 bg-red-500/20 text-red-500 animate-pulse' 
                        : 'border-white/20 hover:border-yellow-400 hover:text-yellow-400 text-white/60'
                    }`}
                    title={isRecording ? 'Stop Recording' : 'Start Voice Input'}
                  >
                    <Mic size={16} />
                  </button>
                  <button 
                    onClick={handleImageUploadClick}
                    className="p-2 rounded-full border border-white/20 hover:border-yellow-400 hover:text-yellow-400 text-white/60 transition-colors"
                    title="Upload Image"
                  >
                    <ImageIcon size={16} />
                  </button>
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileChange} 
                  />
                </div>
              </div>

              {imageData && (
                <div className="mb-4 relative self-start group">
                  <img src={imageData} alt="Uploaded" className="h-24 w-auto rounded border border-white/20 object-cover" />
                  <button 
                    onClick={() => setImageData(null)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remove Image"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <textarea
                id="business-update"
                className="w-full flex-grow min-h-[200px] bg-[#0A0A0A] border border-white/20 text-white p-4 focus:outline-none focus:border-yellow-400 focus:ring-0 placeholder:text-white/30 resize-none font-mono text-sm leading-relaxed"
                placeholder="e.g., Market dey move well well. I sell phone accessories for Sagamu. Yesterday I make 50k..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
              />

              <div className="mt-6 flex flex-col gap-3">
                <p className="text-[10px] uppercase font-bold text-white/50 tracking-widest">Try an example</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((ex, i) => (
                    <button
                      key={i}
                      onClick={() => setInputText(ex.text)}
                      className="text-[10px] bg-transparent border border-white/20 hover:border-yellow-400 hover:text-yellow-400 text-white/60 uppercase font-bold tracking-widest px-3 py-1.5 transition-all text-left"
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={isAnalyzing || (!inputText.trim() && !imageData)}
              className="mt-6 w-full bg-white hover:bg-yellow-400 disabled:bg-white/10 disabled:text-white/30 text-black font-black uppercase tracking-widest py-4 flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="animate-spin" size={16} />
                  Analyzing Profile...
                </>
              ) : (
                <>
                  <Activity size={16} />
                  Generate Oja-Score
                </>
              )}
            </button>

            {error && (
              <div className="mt-4 border-l-2 border-red-500 bg-red-500/10 text-red-500 px-4 py-3 flex gap-3 text-sm font-bold uppercase tracking-wide">
                <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                <p>{error}</p>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Output Profile */}
          <div className="lg:col-span-7 flex flex-col">
            <AnimatePresence mode="wait">
              {!result && !isAnalyzing && (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-grow flex flex-col items-center justify-center text-center p-8 border border-white/20 bg-transparent min-h-[400px]"
                >
                  <TrendingUp size={48} className="text-white/20 mb-6" />
                  <h3 className="text-xl font-black uppercase tracking-widest text-white/40 mb-2">Awaiting Data</h3>
                  <p className="text-white/30 text-sm max-w-xs uppercase tracking-wider font-bold">Input a business update to generate financial profile.</p>
                </motion.div>
              )}

              {isAnalyzing && (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex-grow flex flex-col items-center justify-center text-center bg-white text-black p-8 min-h-[400px]"
                >
                  <Loader2 size={48} className="text-black animate-spin mb-6" />
                  <h3 className="text-xl font-black uppercase tracking-widest mb-4 border-b-2 border-black pb-2 inline-block">Processing Ledger...</h3>
                  <div className="text-black/60 text-xs font-bold uppercase tracking-widest space-y-2">
                    <p>Extracting sales & expenses...</p>
                    <p className="opacity-70">Calculating margins & metric ratios...</p>
                    <p className="opacity-40">Compiling risk profile...</p>
                  </div>
                </motion.div>
              )}

              {result && !isAnalyzing && (
                <motion.div
                  key="result"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="space-y-8 flex-grow flex flex-col"
                >
                  {/* Critical Ledger Container */}
                  <div className="bg-white text-black p-6 sm:p-8 flex flex-col sm:flex-row justify-between flex-grow">
                    
                    <div className="flex flex-col mb-8 sm:mb-0 max-w-[50%]">
                      <div className="mb-8">
                        <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-black/50 mb-2 border-b-2 border-black/10 pb-2">Oja-Score</p>
                        <div className="text-[80px] sm:text-[100px] font-black leading-[0.85] tracking-tighter" style={{ color: getScoreColor(result.risk_profile.score) }}>
                          {result.risk_profile.score}
                        </div>
                        <div className="flex gap-4 mt-4 items-center">
                          <span className={`px-2 md:px-3 py-1 font-black text-[10px] sm:text-xs tracking-widest uppercase ${getStatusColor(result.risk_profile.status)}`}>
                            {result.risk_profile.status}
                          </span>
                        </div>
                      </div>

                      <div>
                         <h3 className="text-xs font-black uppercase tracking-[0.2em] border-b-2 border-black pb-2 mb-4">Core Metrics</h3>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                           <div>
                             <p className="text-[10px] uppercase font-bold text-black/50 mb-1 tracking-widest">Est. Monthly Rev</p>
                             <p className="text-xl sm:text-2xl font-black">{formatNaira(result.financial_metrics.est_monthly_revenue)}</p>
                           </div>
                           <div>
                             <p className="text-[10px] uppercase font-bold text-black/50 mb-1 tracking-widest">Net Profit</p>
                             <p className="text-xl sm:text-2xl font-black text-green-600">{formatNaira(result.financial_metrics.est_net_profit)}</p>
                           </div>
                           <div>
                             <p className="text-[10px] uppercase font-bold text-black/50 mb-1 tracking-widest">Monthly Ajo</p>
                             <p className="text-xl sm:text-2xl font-black">{formatNaira(result.financial_metrics.ajo_contribution_monthly)}</p>
                           </div>
                           <div>
                             <p className="text-[10px] uppercase font-bold text-black/50 mb-1 tracking-widest">Burn Rate</p>
                             <p className="text-xl sm:text-2xl font-black text-red-600">{result.financial_metrics.burn_rate_percent}%</p>
                           </div>
                         </div>
                      </div>
                    </div>

                    <div className="sm:pl-8 sm:border-l-2 border-black/10 flex flex-col flex-1">
                      <div className="mb-8">
                        <p className="text-sm font-black uppercase tracking-widest border-black pb-2 border-b-2 mb-4">Risk Profile</p>
                        
                        <div className="mb-4">
                           <p className="text-[10px] uppercase font-bold text-black/50 mb-2 tracking-widest">Strengths</p>
                           <ul className="space-y-2">
                            {result.risk_profile.strengths.map((str, idx) => (
                              <li key={idx} className="flex gap-2 text-xs font-bold leading-tight">
                                <span className="text-green-600 font-black">+</span>
                                {str}
                              </li>
                            ))}
                            {result.risk_profile.strengths.length === 0 && (
                              <li className="text-xs text-black/30 font-bold uppercase tracking-wider">None Indicated</li>
                            )}
                          </ul>
                        </div>

                        <div>
                           <p className="text-[10px] uppercase font-bold text-black/50 mb-2 tracking-widest">Risk Factors</p>
                           <ul className="space-y-2">
                            {result.risk_profile.top_risks.map((risk, idx) => (
                              <li key={idx} className="flex gap-2 text-xs font-bold leading-tight">
                                <span className="text-red-500 font-black">-</span>
                                {risk}
                              </li>
                            ))}
                            {result.risk_profile.top_risks.length === 0 && (
                              <li className="text-xs text-black/30 font-bold uppercase tracking-wider">None Indicated</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Recommendation Bar */}
                  <div className="bg-yellow-400 text-black p-6 border-l-8 border-black flex flex-col justify-between h-auto mt-auto">
                    <p className="text-[10px] uppercase tracking-[0.2em] font-black opacity-60 mb-2">Next Best Action</p>
                    <p className="text-sm sm:text-base font-bold leading-relaxed">{result.insights.next_best_action}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 flex justify-between items-center text-[10px] font-mono uppercase text-white/30 tracking-widest border-t border-white/10 pt-4">
          <div>Status: Operative</div>
          <div className="flex gap-4 sm:gap-6">
             <span>OjaScore / {new Date().getFullYear()}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
