"use client";

import React, { useState, useMemo } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Activity, Plus, Trash2, 
  Search, Loader2, AlertCircle, Play, SlidersHorizontal, Calculator, 
  BarChart3
} from 'lucide-react';

// ============================================================================
// 1. MATH ENGINES
// ============================================================================

interface BlackScholesResult {
  callPrice: number;
  putPrice: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

function normalCDF(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - prob : prob;
}

function normalPDF(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function calculateBlackScholes(S: number, K: number, T: number, r: number, sigma: number): BlackScholesResult {
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma * sigma) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const Nd1 = normalCDF(d1);
  const Nd2 = normalCDF(d2);
  const Nmd1 = normalCDF(-d1);
  const Nmd2 = normalCDF(-d2);
  const nd1 = normalPDF(d1);

  const callPrice = S * Nd1 - K * Math.exp(-r * T) * Nd2;
  const putPrice = K * Math.exp(-r * T) * Nmd2 - S * Nmd1;
  
  const delta = Nd1;
  const gamma = nd1 / (S * sigma * Math.sqrt(T));
  const theta = -(S * nd1 * sigma) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * Nd2;
  const vega = S * nd1 * Math.sqrt(T);
  const rho = K * T * Math.exp(-r * T) * Nd2;

  return { callPrice, putPrice, delta, gamma, theta: theta / 365, vega: vega / 100, rho: rho / 100 };
}

function generateGaussianRandom(): number {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random();
  while (u2 === 0) u2 = Math.random();
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
}

function simulateGBMPath(S0: number, r: number, sigma: number, T: number, steps: number): number[] {
  const dt = T / steps;
  const path = new Array(steps + 1);
  path[0] = S0;
  for (let i = 1; i <= steps; i++) {
    const Z = generateGaussianRandom();
    const drift = (r - 0.5 * sigma * sigma) * dt;
    const diffusion = sigma * Math.sqrt(dt) * Z;
    path[i] = path[i - 1] * Math.exp(drift + diffusion);
  }
  return path;
}

// ============================================================================
// 2. TYPES & CONFIGURATION
// ============================================================================

interface Asset {
  id: string;
  name: string;
  currentValue: number;
  targetAllocation: number;
}

const PALETTE = {
  sage: '#577c75',     
  amber: '#d97706',    
  sand: '#e7e5e4',     
  charcoal: '#44403c', 
  stone: '#78716c',    
  charts: ['#577c75', '#0f766e', '#d97706', '#b45309', '#0e7490', '#6366f1']
};

// ============================================================================
// 3. MAIN COMPONENT: EQUILIBRIUM
// ============================================================================

export default function Equilibrium() {
  const [activeTab, setActiveTab] = useState<'derivatives' | 'montecarlo' | 'allocation'>('derivatives');

  // --- STATE ---
  const [ticker, setTicker] = useState('');
  const [isFetchingPrice, setIsFetchingPrice] = useState(false);
  const [priceError, setPriceError] = useState('');

  // Black-Scholes State
  const [S, setS] = useState(100);
  const [K, setK] = useState(100);
  const [T, setT] = useState(1);
  const [r, setR] = useState(5);
  const [sigma, setSigma] = useState(20);

  // Monte Carlo State
  const [mcParams, setMcParams] = useState({
    S0: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, iterations: 2000, steps: 50, optionType: 'call' as 'call' | 'put'
  });
  const [mcResults, setMcResults] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);

  // Portfolio State
  const [assets, setAssets] = useState<Asset[]>([
    { id: '1', name: 'Global Equities', currentValue: 50000, targetAllocation: 40 },
    { id: '2', name: 'Green Bonds', currentValue: 30000, targetAllocation: 30 },
    { id: '3', name: 'Real Estate', currentValue: 20000, targetAllocation: 30 },
  ]);

  // --- LOGIC ---
  const handleStockSearch = async () => {
    if (!ticker) return;
    setIsFetchingPrice(true);
    setPriceError('');
    try {
      const API_KEY = 'FYYX9SDAG15X3QIM'; 
      const response = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${API_KEY}`);
      const data = await response.json();

      if (data['Note'] || data['Information']) throw new Error("API Limit reached");
      const priceString = data['Global Quote']?.['05. price'];
      if (!priceString) throw new Error("Symbol not found");

      const price = parseFloat(priceString);
      if (activeTab === 'derivatives') {
        setS(price);
        setK(price);
      } else if (activeTab === 'montecarlo') {
        setMcParams(prev => ({ ...prev, S0: price, K: price }));
      }
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : 'Fetch failed');
    } finally {
      setIsFetchingPrice(false);
    }
  };

  const result = useMemo(() => calculateBlackScholes(S, K, T, r / 100, sigma / 100), [S, K, T, r, sigma]);
  
  const chartData = useMemo(() => {
    const data = [];
    const minS = S * 0.5;
    const maxS = S * 1.5;
    const step = (maxS - minS) / 50;
    for (let price = minS; price <= maxS; price += step) {
      const bs = calculateBlackScholes(price, K, T, r / 100, sigma / 100);
      data.push({
        price: price.toFixed(2),
        call: bs.callPrice.toFixed(2),
        put: bs.putPrice.toFixed(2),
      });
    }
    return data;
  }, [S, K, T, r, sigma]);

  const runMonteCarloSimulation = () => {
    setIsCalculating(true);
    setTimeout(() => {
      const { S0, K, T, r, sigma, iterations, steps, optionType } = mcParams;
      const allPaths: number[][] = [];
      const payoffs: number[] = [];
      let sumPayoff = 0;
      let inTheMoneyCount = 0;

      for (let i = 0; i < iterations; i++) {
        const path = simulateGBMPath(S0, r, sigma, T, steps);
        allPaths.push(path);
        const ST = path[path.length - 1];
        let payoff = optionType === 'call' ? Math.max(ST - K, 0) : Math.max(K - ST, 0);
        if (payoff > 0) inTheMoneyCount++;
        const discounted = payoff * Math.exp(-r * T);
        payoffs.push(discounted);
        sumPayoff += discounted;
      }

      const optionPrice = sumPayoff / iterations;
      payoffs.sort((a, b) => a - b);
      const index5th = Math.floor(iterations * 0.05);
      const valueAtRisk = optionPrice - payoffs[index5th];

      const visualPaths: number[][] = [];
      const step = Math.max(1, Math.floor(iterations / 20));
      for (let i = 0; i < iterations; i += step) {
        if (visualPaths.length < 20) visualPaths.push(allPaths[i]);
      }

      setMcResults({
        optionPrice,
        inTheMoneyProbability: (inTheMoneyCount / iterations) * 100,
        valueAtRisk,
        visualPaths
      });
      setIsCalculating(false);
    }, 50);
  };

  const mcChartData = useMemo(() => {
    if (!mcResults) return [];
    const data: any[] = [];
    const steps = mcResults.visualPaths[0]?.length || 0;
    for (let step = 0; step < steps; step++) {
      const point: any = { step };
      mcResults.visualPaths.forEach((path: number[], idx: number) => {
        point[`path${idx}`] = path[step];
      });
      data.push(point);
    }
    return data;
  }, [mcResults]);

  const calculations = useMemo(() => {
    const totalValue = assets.reduce((sum, a) => sum + (a.currentValue || 0), 0);
    const totalAllocation = assets.reduce((sum, a) => sum + (a.targetAllocation || 0), 0);
    const isValid = Math.abs(totalAllocation - 100) < 0.01;
    const actions = assets.map(asset => {
      const targetValue = (totalValue * (asset.targetAllocation || 0)) / 100;
      const delta = targetValue - (asset.currentValue || 0);
      return { ...asset, targetValue, delta, action: delta > 0.01 ? 'BUY' : delta < -0.01 ? 'SELL' : 'HOLD' };
    });
    const currentData = assets.filter(a => a.currentValue > 0).map(a => ({ name: a.name || 'Unnamed', value: a.currentValue }));
    const targetData = assets.filter(a => a.targetAllocation > 0 && totalValue > 0).map(a => ({ name: a.name || 'Unnamed', value: (totalValue * a.targetAllocation) / 100 }));
    return { totalValue, totalAllocation, isValid, actions, currentData, targetData };
  }, [assets]);

  const addAsset = () => setAssets([...assets, { id: Date.now().toString(), name: '', currentValue: 0, targetAllocation: 0 }]);
  const removeAsset = (id: string) => setAssets(assets.filter(a => a.id !== id));
  const updateAsset = (id: string, field: keyof Asset, value: string | number) => setAssets(assets.map(a => (a.id === id ? { ...a, [field]: value } : a)));

  // ============================================================================
  // 4. DESIGN COMPONENTS
  // ============================================================================

  const SectionHeader = ({ icon: Icon, title }: any) => (
    <div className="flex items-center gap-3 mb-6 opacity-80">
      <Icon size={18} className="text-[#577c75]" />
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#78716c]">{title}</h2>
    </div>
  );

  const MethodologyTag = ({ label }: any) => (
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#f5f5f4] border border-[#e7e5e4] mb-6">
      <Calculator size={12} className="text-[#577c75]" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#78716c]">{label}</span>
    </div>
  );

  const SliderInput = ({ label, value, onChange, min, max, step, unit = '' }: any) => {
    const isPrefix = unit === '$';
    return (
      <div className="group">
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-sm text-[#44403c] font-medium font-serif">{label}</label>
          <span className="text-sm font-mono text-[#577c75]">{isPrefix ? unit : ''}{value.toFixed(2)}{!isPrefix ? unit : ''}</span>
        </div>
        <input 
          type="range" min={min} max={max} step={step} value={value} 
          onChange={(e) => onChange(parseFloat(e.target.value))} 
          className="w-full h-1 bg-[#e7e5e4] rounded-full appearance-none cursor-pointer accent-[#577c75] hover:accent-[#45625d] transition-all" 
        />
      </div>
    );
  };

  const Card = ({ children, className = '' }: any) => (
    <div className={`bg-white rounded-3xl p-8 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-100 ${className}`}>
      {children}
    </div>
  );

  const StatBox = ({ label, value, sub }: any) => (
    <div className="flex flex-col">
      <span className="text-xs font-bold uppercase tracking-wider text-[#78716c] mb-1">{label}</span>
      <span className="text-2xl font-serif text-[#44403c]">{value}</span>
      {sub && <span className="text-xs text-[#78716c] mt-1">{sub}</span>}
    </div>
  );

  // ============================================================================
  // 5. RENDER
  // ============================================================================

  return (
    <div className="min-h-screen bg-[#fafaf9] text-[#44403c] font-sans selection:bg-[#577c75] selection:text-white pb-20">
      
      {/* HEADER */}
      <header className="sticky top-0 z-50 bg-[#fafaf9]/80 backdrop-blur-md border-b border-[#e7e5e4]">
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#577c75] flex items-center justify-center text-white">
              <span className="font-serif italic font-bold">E</span>
            </div>
            <h1 className="text-xl font-serif font-medium text-[#44403c]">Equilibrium</h1>
          </div>
          <nav className="flex gap-1 bg-[#e7e5e4] p-1 rounded-full">
            {[
              { id: 'derivatives', label: 'Valuation' },
              { id: 'montecarlo', label: 'Simulation' },
              { id: 'allocation', label: 'Balance' }
            ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                  activeTab === tab.id 
                    ? 'bg-white text-[#44403c] shadow-sm' 
                    : 'text-[#78716c] hover:text-[#577c75]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        
        {/* TAB: DERIVATIVES (Black-Scholes) */}
        {activeTab === 'derivatives' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-6">
               <Card>
                <div className="flex justify-between items-start">
                  <SectionHeader icon={BarChart3} title="Black-Scholes" />
                </div>
                
                <div className="flex gap-2 mb-8">
                  <input
                    type="text" placeholder="Ticker (e.g. AAPL)"
                    value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())}
                    className="w-full bg-[#f5f5f4] border-none rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-[#577c75] placeholder:text-[#a8a29e]"
                  />
                  <button 
                    onClick={handleStockSearch} disabled={isFetchingPrice}
                    className="bg-[#577c75] text-white px-4 rounded-xl hover:bg-[#45625d] transition-colors disabled:opacity-50"
                  >
                    {isFetchingPrice ? <Loader2 className="animate-spin" size={18}/> : <Search size={18}/>}
                  </button>
                </div>
                {priceError && <p className="text-xs text-amber-600 mb-4">{priceError}</p>}

                <SectionHeader icon={SlidersHorizontal} title="Parameters" />
                <div className="space-y-8">
                  <SliderInput label="Spot Price" value={S} onChange={setS} min={1} max={500} step={0.5} unit="$" />
                  <SliderInput label="Strike Price" value={K} onChange={setK} min={1} max={500} step={0.5} unit="$" />
                  <SliderInput label="Volatility (σ)" value={sigma} onChange={setSigma} min={1} max={150} step={1} unit="%" />
                  <SliderInput label="Time (Years)" value={T} onChange={setT} min={0.1} max={5} step={0.1} />
                  <SliderInput label="Risk-Free Rate" value={r} onChange={setR} min={0} max={15} step={0.1} unit="%" />
                </div>
              </Card>
            </div>

            <div className="lg:col-span-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card className="flex flex-col items-center justify-center text-center py-10">
                  <span className="text-[#577c75] mb-2"><TrendingUp size={24}/></span>
                  <StatBox label="Call Value" value={`$${result.callPrice.toFixed(2)}`} />
                </Card>
                <Card className="flex flex-col items-center justify-center text-center py-10">
                  <span className="text-[#d97706] mb-2"><TrendingDown size={24}/></span>
                  <StatBox label="Put Value" value={`$${result.putPrice.toFixed(2)}`} />
                </Card>
              </div>

              <Card>
                <SectionHeader icon={Activity} title="Payoff Analysis" />
                <div className="h-64 w-full">
                  <ResponsiveContainer>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
                      <XAxis dataKey="price" stroke="#a8a29e" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                      <YAxis stroke="#a8a29e" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} 
                      />
                      <Legend iconType="circle" />
                      <Line type="monotone" dataKey="call" stroke="#577c75" strokeWidth={2} dot={false} name="Call" />
                      <Line type="monotone" dataKey="put" stroke="#d97706" strokeWidth={2} dot={false} name="Put" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[['Delta', result.delta], ['Gamma', result.gamma], ['Theta', result.theta], ['Vega', result.vega], ['Rho', result.rho]].map(([name, val]) => (
                  <div key={name as string} className="bg-white rounded-2xl p-4 text-center shadow-sm border border-stone-100">
                    <div className="text-[10px] uppercase font-bold text-[#a8a29e] mb-1">{name}</div>
                    <div className="text-lg font-serif text-[#44403c]">{(val as number).toFixed(3)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: MONTE CARLO */}
        {activeTab === 'montecarlo' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="space-y-6">
              <Card>
                <div className="flex justify-between items-start">
                  <SectionHeader icon={SlidersHorizontal} title="Monte-Carlo Configuration" />
                </div>
                
                <div className="flex bg-[#f5f5f4] p-1 rounded-xl mb-6">
                  <button onClick={() => setMcParams({...mcParams, optionType: 'call'})} className={`flex-1 py-2 text-sm rounded-lg transition-all ${mcParams.optionType === 'call' ? 'bg-white shadow-sm text-[#577c75] font-bold' : 'text-[#78716c]'}`}>Call</button>
                  <button onClick={() => setMcParams({...mcParams, optionType: 'put'})} className={`flex-1 py-2 text-sm rounded-lg transition-all ${mcParams.optionType === 'put' ? 'bg-white shadow-sm text-[#d97706] font-bold' : 'text-[#78716c]'}`}>Put</button>
                </div>
                <div className="space-y-6">
                  <SliderInput label="Spot (S₀)" value={mcParams.S0} onChange={(v:number) => setMcParams({...mcParams, S0:v})} min={1} max={500} step={1} unit="$"/>
                  <SliderInput label="Steps" value={mcParams.steps} onChange={(v:number) => setMcParams({...mcParams, steps:v})} min={10} max={200} step={10} />
                  <SliderInput label="Iterations" value={mcParams.iterations} onChange={(v:number) => setMcParams({...mcParams, iterations:v})} min={100} max={5000} step={100} />
                </div>
                <button 
                  onClick={runMonteCarloSimulation} disabled={isCalculating}
                  className="w-full mt-8 bg-[#44403c] text-[#fafaf9] py-3 rounded-xl hover:bg-black transition-colors flex justify-center items-center gap-2"
                >
                  {isCalculating ? <Loader2 className="animate-spin" size={18}/> : <Play size={18} fill="currentColor"/>}
                  <span className="font-medium">Run Simulation</span>
                </button>
              </Card>
            </div>

            <div className="lg:col-span-2 space-y-6">
              {mcResults && (
                <div className="grid grid-cols-3 gap-4">
                  <Card className="text-center py-6">
                    <StatBox label="Est. Price" value={`$${mcResults.optionPrice.toFixed(2)}`} />
                  </Card>
                  <Card className="text-center py-6">
                    <StatBox label="ITM Probability" value={`${mcResults.inTheMoneyProbability.toFixed(1)}%`} />
                  </Card>
                  <Card className="text-center py-6 border-amber-100">
                     <StatBox label="95% VaR" value={`$${mcResults.valueAtRisk.toFixed(2)}`} />
                  </Card>
                </div>
              )}
              
              <Card>
                <div className="flex justify-between items-center mb-6">
                  <SectionHeader icon={Activity} title="Random Walks" />
                  {mcResults && <span className="text-xs text-[#a8a29e] bg-[#f5f5f4] px-3 py-1 rounded-full">20 paths visualized</span>}
                </div>
                
                <div className="h-80 w-full flex items-center justify-center bg-[#fafaf9] rounded-2xl overflow-hidden relative">
                  {!mcResults ? (
                    <span className="text-[#a8a29e] text-sm">Awaiting Simulation...</span>
                  ) : (
                    <ResponsiveContainer>
                      <LineChart data={mcChartData}>
                        <XAxis dataKey="step" hide />
                        <YAxis domain={['auto', 'auto']} hide />
                        <Tooltip contentStyle={{ borderRadius: '12px' }} />
                        {mcResults.visualPaths.map((_:any, idx:number) => (
                           <Line 
                             key={idx} type="basis" dataKey={`path${idx}`} 
                             stroke={PALETTE.charts[idx % PALETTE.charts.length]} 
                             strokeWidth={1.5} dot={false} strokeOpacity={0.4} 
                           />
                        ))}
                         <Line type="monotone" dataKey={() => mcParams.K} stroke="#44403c" strokeDasharray="3 3" strokeWidth={1} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* TAB: ALLOCATION */}
        {activeTab === 'allocation' && (
          <div className="space-y-6">
            <Card>
              <div className="flex justify-between items-center mb-6">
                <SectionHeader icon={SlidersHorizontal} title="Portfolio Composition" />
                <button onClick={addAsset} className="text-[#577c75] hover:bg-[#577c75]/10 p-2 rounded-full transition-colors"><Plus size={20}/></button>
              </div>

              {/* NEW HEADERS AS REQUESTED */}
              <div className="flex items-center gap-4 px-3 mb-2">
                <span className="flex-1 text-[10px] font-bold tracking-widest text-[#a8a29e] uppercase">Asset</span>
                <span className="w-24 text-[10px] font-bold tracking-widest text-[#a8a29e] uppercase text-right">Current Value</span>
                <span className="w-24 text-[10px] font-bold tracking-widest text-[#a8a29e] uppercase text-right">Target</span>
                <span className="w-6"></span>
              </div>

              <div className="space-y-2">
                {assets.map((asset) => (
                  <div key={asset.id} className="flex items-center gap-4 p-3 hover:bg-[#f5f5f4] rounded-xl transition-colors group">
                    <input 
                      value={asset.name} onChange={e => updateAsset(asset.id, 'name', e.target.value)}
                      className="bg-transparent border-none focus:ring-0 font-medium text-[#44403c] w-full placeholder:text-[#d6d3d1]" 
                      placeholder="Asset Name"
                    />
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-stone-100 w-24">
                      <span className="text-[#a8a29e] text-xs">$</span>
                      <input 
                        type="number" value={asset.currentValue || ''} onChange={e => updateAsset(asset.id, 'currentValue', parseFloat(e.target.value))}
                        className="w-full bg-transparent border-none text-right text-sm focus:ring-0 p-0" placeholder="0"
                      />
                    </div>
                    <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg shadow-sm border border-stone-100 w-24">
                      <input 
                        type="number" value={asset.targetAllocation || ''} onChange={e => updateAsset(asset.id, 'targetAllocation', parseFloat(e.target.value))}
                        className="w-full bg-transparent border-none text-right text-sm focus:ring-0 p-0" placeholder="0"
                      />
                      <span className="text-[#a8a29e] text-xs">%</span>
                    </div>
                    <button onClick={() => removeAsset(asset.id)} className="w-6 text-[#a8a29e] hover:text-[#d97706] opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16}/></button>
                  </div>
                ))}
              </div>
              <div className="mt-6 flex justify-end">
                {!calculations.isValid ? (
                  <span className="text-amber-600 text-sm flex items-center gap-2"><AlertCircle size={14}/> Total allocation: {calculations.totalAllocation}% (Must be 100%)</span>
                ) : (
                   <span className="text-[#577c75] text-sm font-medium">Allocation Balanced</span>
                )}
              </div>
            </Card>

            {calculations.isValid && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                   <SectionHeader icon={Activity} title="Current Allocation Variance" />
                   <div className="h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        {/* CHANGED DATA SOURCE TO CURRENT DATA */}
                        <Pie data={calculations.currentData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                          {calculations.currentData.map((entry, index) => <Cell key={`cell-${index}`} fill={PALETTE.charts[index % PALETTE.charts.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{borderRadius: '12px'}} formatter={(value: number) => `$${value.toLocaleString()}`}/>
                      </PieChart>
                    </ResponsiveContainer>
                   </div>
                </Card>
                <Card className="space-y-4">
                  <SectionHeader icon={TrendingUp} title="Rebalancing Actions" />
                  {calculations.actions.map(action => (
                     action.action !== 'HOLD' && (
                      <div key={action.id} className="flex items-center justify-between p-4 bg-[#f5f5f4] rounded-2xl">
                        <div>
                          <div className="font-serif text-[#44403c]">{action.name || 'Unnamed'}</div>
                          <div className="text-xs text-[#78716c]">Target: ${action.targetValue.toLocaleString(undefined, {maximumFractionDigits:0})}</div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-bold tracking-wider ${action.action === 'BUY' ? 'text-[#577c75]' : 'text-[#d97706]'}`}>
                            {action.action}
                          </div>
                          <div className="text-sm font-mono">${Math.abs(action.delta).toLocaleString(undefined, {maximumFractionDigits:0})}</div>
                        </div>
                      </div>
                     )
                  ))}
                  {calculations.actions.every(a => a.action === 'HOLD') && <div className="text-center text-[#a8a29e] py-10">Portfolio is perfectly balanced.</div>}
                </Card>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}