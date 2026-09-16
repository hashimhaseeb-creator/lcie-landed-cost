'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Sparkles, Loader2, ShieldCheck, Globe2, Truck, Calculator,
  CheckCircle2, AlertTriangle, Cpu, Database, ScanLine, Brain, ChevronRight,
  Sun, Moon, Download, RefreshCw, Boxes, Search, Layers, Leaf, ArrowRight,
  TrendingUp, Wallet, Ship, FileCheck, Anchor, MapPin, Percent,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Gp4Logo } from '@/components/gp4-logo';
import { DutyCharts } from '@/components/lcie/duty-charts';
import type { PoDto, DetermineResponse, CalculateResponse, DeterminationResult, AgentStep, LandedCostInputs } from '@/lib/lcie/types';
import { toast } from 'sonner';

const BRAND = 'Green G(P)\u2074\u2122';
const BRAND_FULL = 'Green G(P)\u2074\u2122 Global Operations';
const FRAMEWORK = 'Plan \u00b7 Procure \u00b7 Produce \u00b7 Provide';

const CUR: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', PKR: '₨', INR: '₹', PLN: 'zł', SEK: 'kr', CZK: 'Kč', DKK: 'kr', HUF: 'Ft', RON: 'lei', BGN: 'лв', CAD: 'C$', MXN: 'Mex$', AUD: 'A$', NZD: 'NZ$', CNY: '¥', JPY: '¥', AED: 'د.إ', SAR: '﷼', TRY: '₺', BRL: 'R$' };
const sym = (c: string) => CUR[c] ?? c + ' ';
const fmtMoney = (n: number, c: string) => `${sym(c)}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(n < 0.1 && n > 0 ? 3 : 2)}%`;

interface SampleSummary { id: string; title: string; blurb: string; lineCount: number }
const NAV = [
  { label: 'H₂ Protocol Tool' },
  { label: 'LCIE Cost Calculator', active: true },
  { label: 'ICE Fleet Savings' },
  { label: 'About' },
  { label: 'ROI' },
];

export default function Home() {
  const [po, setPo] = useState<PoDto | null>(null);
  const [agentResult, setAgentResult] = useState<DetermineResponse | null>(null);
  const [calcResult, setCalcResult] = useState<CalculateResponse | null>(null);
  const [visibleSteps, setVisibleSteps] = useState<AgentStep[]>([]);
  const [uploading, setUploading] = useState(false);
  const [agentLoading, setAgentLoading] = useState(false);
  const [calcLoading, setCalcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [samples, setSamples] = useState<SampleSummary[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [inputs, setInputs] = useState<LandedCostInputs>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    fetch('/api/lcie/sample-po').then((r) => r.json()).then((d) => setSamples(d.samples ?? [])).catch(() => void 0);
  }, []);

  useEffect(() => {
    if (!agentResult) return;
    setVisibleSteps([]);
    let i = 0;
    const iv = setInterval(() => {
      i += 1;
      setVisibleSteps(agentResult.agentSteps.slice(0, i));
      if (i >= agentResult.agentSteps.length) clearInterval(iv);
    }, 140);
    return () => clearInterval(iv);
  }, [agentResult]);

  // pre-fill landed-cost inputs from the PO once it's loaded
  useEffect(() => {
    if (po) {
      setInputs({
        freight: po.freight || undefined,
        insurance: po.insurance || undefined,
        otherCharges: po.otherCharges || undefined,
        customsBrokerFee: undefined, documentationFee: undefined, dutyAdvanceFee: undefined,
        harborOrPortFee: undefined, inlandDestinationDelivery: undefined,
        incoterm: po.incoterm,
      });
    }
  }, [po]);

  const reset = () => {
    setPo(null); setAgentResult(null); setCalcResult(null); setVisibleSteps([]);
    setError(null); setPasteText(''); setInputs({});
  };

  const uploadPayload = useCallback(async (rawText: string, fileName?: string) => {
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', new File([rawText], fileName ?? 'po.txt', { type: 'text/plain' }));
      const res = await fetch('/api/lcie/upload-po', { method: 'POST', body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? e.error ?? 'Upload failed'); }
      const dto: PoDto = await res.json();
      setPo(dto); setAgentResult(null); setCalcResult(null); setVisibleSteps([]);
      toast.success(`PO ${dto.poNumber} parsed — ${dto.lineItems.length} line item(s)`);
      setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); toast.error('PO upload failed'); }
    finally { setUploading(false); }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    setUploading(true); setError(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/lcie/upload-po', { method: 'POST', body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.detail ?? e.error ?? 'Upload failed'); }
      const dto: PoDto = await res.json();
      setPo(dto); setAgentResult(null); setCalcResult(null); setVisibleSteps([]);
      toast.success(`PO ${dto.poNumber} parsed — ${dto.lineItems.length} line item(s)`);
      setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setError(e instanceof Error ? e.message : 'Upload failed'); toast.error('PO upload failed'); }
    finally { setUploading(false); }
  }, []);

  const handleLoadSample = useCallback(async (id: string) => {
    setUploading(true); setError(null);
    try {
      const res = await fetch(`/api/lcie/sample-po?id=${id}`);
      const data = await res.json();
      const fd = new FormData();
      fd.append('file', new File([JSON.stringify(data, null, 2)], `${id}.json`, { type: 'application/json' }));
      fd.append('meta', JSON.stringify({ poNumber: data.poNumber, supplier: data.supplier, originCountry: data.originCountry, destinationCountry: data.destinationCountry, currency: data.currency, incoterm: data.incoterm, freight: data.freight, insurance: data.insurance, otherCharges: data.otherCharges }));
      const r2 = await fetch('/api/lcie/upload-po', { method: 'POST', body: fd });
      if (!r2.ok) { const e = await r2.json().catch(() => ({})); throw new Error(e.detail ?? e.error ?? 'Sample load failed'); }
      const dto: PoDto = await r2.json();
      setPo(dto); setAgentResult(null); setCalcResult(null); setVisibleSteps([]);
      toast.success(`Sample PO loaded — ${dto.lineItems.length} line item(s)`);
      setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) { setError(e instanceof Error ? e.message : 'Sample load failed'); toast.error('Sample load failed'); }
    finally { setUploading(false); }
  }, []);

  const handlePaste = useCallback(async () => {
    if (!pasteText.trim()) return;
    await uploadPayload(pasteText, 'pasted-po.txt');
  }, [pasteText, uploadPayload]);

  const handleRunAgent = useCallback(async () => {
    if (!po) return;
    setAgentLoading(true); setError(null); setAgentResult(null); setCalcResult(null); setVisibleSteps([]);
    try {
      const r1 = await fetch('/api/lcie/determine-codes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId: po.id }),
      });
      if (!r1.ok) { const e = await r1.json().catch(() => ({})); throw new Error(e.detail ?? e.error ?? 'Agent run failed'); }
      const det: DetermineResponse = await r1.json();
      setAgentResult(det);
      const dest = det.determinations[0]?.region ?? 'US';
      toast.success(`LCIE agent classified ${det.determinations.length} line(s) for ${dest} in ${(det.durationMs / 1000).toFixed(1)}s`);

      setCalcLoading(true);
      const r2 = await fetch('/api/lcie/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId: po.id, inputs }),
      });
      if (!r2.ok) { const e = await r2.json().catch(() => ({})); throw new Error(e.detail ?? e.error ?? 'Landed cost failed'); }
      const calc: CalculateResponse = await r2.json();
      setCalcResult(calc);
      toast.success(`Landed cost calculated for ${calc.destination.flag} ${calc.destination.countryName} in ${calc.destination.currency}`);
      setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
    } catch (e) { setError(e instanceof Error ? e.message : 'Agent run failed'); toast.error('LCIE agent failed'); }
    finally { setAgentLoading(false); setCalcLoading(false); }
  }, [po, inputs]);

  const handleRecalculate = useCallback(async () => {
    if (!po) return;
    setCalcLoading(true); setError(null);
    try {
      const r = await fetch('/api/lcie/calculate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId: po.id, inputs }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail ?? e.error ?? 'Re-calculate failed'); }
      const calc: CalculateResponse = await r.json();
      setCalcResult(calc);
      toast.success('Landed cost re-calculated with your inputs');
    } catch (e) { setError(e instanceof Error ? e.message : 'Re-calculate failed'); toast.error('Re-calculate failed'); }
    finally { setCalcLoading(false); }
  }, [po, inputs]);

  const downloadReport = () => {
    if (!po || !agentResult || !calcResult) return;
    const blob = new Blob([JSON.stringify({ po, agentResult, calcResult, landedCostInputs: inputs }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `lcie-report-${po.poNumber}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const inputCur = po?.currency ?? 'USD';

  return (
    <div className="min-h-screen flex flex-col bg-background gp4-hero-glow">
      {/* ===== Header (sticky) ===== */}
      <header className="sticky top-0 z-50 w-full border-b border-cyan-200/50 dark:border-cyan-900/40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative shrink-0"><Gp4Logo size={38} /><span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-cyan-400 gp4-pulse" /></div>
            <div className="min-w-0 leading-tight">
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700 dark:text-cyan-300 font-semibold">{BRAND} <span className="text-muted-foreground font-normal">Global Operations</span></p>
              <h1 className="text-sm md:text-base font-bold font-display truncate">LCIE Landed Cost Engine</h1>
            </div>
          </div>
          <nav className="hidden lg:flex items-center gap-1">
            {NAV.map((n) => (
              <span key={n.label} className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${n.active ? 'bg-cyan-600 text-white' : 'text-muted-foreground hover:text-foreground hover:bg-muted'}`}>{n.label}</span>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex border-cyan-300/60 text-cyan-700 dark:text-cyan-300 dark:border-cyan-800/60 gap-1"><Cpu className="h-3 w-3" /> Agent online</Badge>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">{mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* ===== Hero ===== */}
        <section className="container mx-auto px-4 pt-10 pb-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-3xl">
            <Badge variant="secondary" className="mb-3 border-cyan-200/60 dark:border-cyan-900/40 text-cyan-700 dark:text-cyan-300"><Sparkles className="h-3 w-3 mr-1" /> {FRAMEWORK} — a decision sequence, not a product category</Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight font-display">
              LCIE Landed Cost Engine
              <span className="block text-cyan-600 dark:text-cyan-400">destination-aware duty stack with live FX</span>
            </h2>
            <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-2xl">
              Upload a PO and the agent determines the HS code &amp; full regulation stack — <strong className="text-foreground">Section 301, IEEPA, MPF, HMF, VAT</strong> — for <strong className="text-foreground">only the final destined country</strong>. US destinations settle in US$; UK in £, EU in € (or member currency) via <strong className="text-foreground">live ECB FX rates</strong>. You set freight, insurance &amp; every import charge.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { icon: Search, label: 'HS Classification Agent' },
                { icon: Layers, label: 'Destination-only stack' },
                { icon: TrendingUp, label: 'Live FX conversion' },
                { icon: Wallet, label: 'Editable import charges' },
                { icon: ShieldCheck, label: 'Auditable waterfall' },
              ].map((f) => (
                <Badge key={f.label} variant="outline" className="gap-1.5 py-1.5 px-3 rounded-full border-cyan-200/60 dark:border-cyan-900/40"><f.icon className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" /> {f.label}</Badge>
              ))}
            </div>
          </motion.div>
        </section>

        {/* ===== Workspace ===== */}
        <section ref={workspaceRef} className="container mx-auto px-4 pb-12 space-y-6">
          {/* Upload card */}
          {!po && (
            <Card className="border-cyan-200/60 dark:border-cyan-900/40 overflow-hidden">
              <CardHeader className="bg-cyan-50/60 dark:bg-cyan-950/20 border-b border-cyan-100 dark:border-cyan-900/30">
                <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /> Upload a Purchase Order</CardTitle>
                <CardDescription>Drop a <strong>PDF</strong>, CSV, JSON or text PO, paste PO lines, or load a sample consignment to begin.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }} onClick={() => fileInputRef.current?.click()}
                      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-cyan-500 bg-cyan-50/60' : 'border-cyan-200 dark:border-cyan-900/50 hover:border-cyan-500/60 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20'}`}>
                      <input ref={fileInputRef} type="file" accept=".csv,.json,.txt,.xml,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                      <div className="mx-auto h-12 w-12 rounded-full bg-cyan-600/10 grid place-items-center mb-3">{uploading ? <Loader2 className="h-6 w-6 text-cyan-600 animate-spin" /> : <FileText className="h-6 w-6 text-cyan-600 dark:text-cyan-400" />}</div>
                      <p className="font-medium">{uploading ? 'Parsing PO…' : 'Drop PO file here or click to browse'}</p>
                      <p className="text-xs text-muted-foreground mt-1"><span className="text-cyan-700 dark:text-cyan-300 font-medium">PDF</span> · CSV · JSON · text — auto-detects format &amp; columns</p>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Boxes className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /> Paste PO line items</label>
                    <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={`1. Cotton knit T-shirt, 220gsm — 5000 pcs @ $3.20\n2. Leather handbag, cowhide — 800 pcs @ $18.50`} className="flex-1 min-h-[140px] font-mono text-xs lcie-scroll" />
                    <Button onClick={handlePaste} disabled={!pasteText.trim() || uploading} className="mt-2 self-end" size="sm">{uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Parse &amp; load</Button>
                  </div>
                </div>
                {samples.length > 0 && (
                  <div className="mt-6">
                    <Separator className="mb-4" />
                    <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><Boxes className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /> Or load a sample consignment</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {samples.map((s) => (
                        <button key={s.id} onClick={() => handleLoadSample(s.id)} disabled={uploading} className="text-left rounded-lg border border-cyan-200/70 dark:border-cyan-900/40 bg-card hover:bg-cyan-50/50 dark:hover:bg-cyan-950/20 hover:border-cyan-500/50 p-3 transition-colors disabled:opacity-60">
                          <p className="text-sm font-medium leading-tight">{s.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.blurb}</p>
                          <p className="text-[11px] text-cyan-700 dark:text-cyan-300 mt-2 flex items-center gap-1">{s.lineCount} line items <ChevronRight className="h-3 w-3" /></p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {error && (<div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /><p className="text-destructive">{error}</p></div>)}
              </CardContent>
            </Card>
          )}

          {/* PO + line items + landed-cost inputs */}
          {po && (
            <>
              <Card className="border-cyan-200/60 dark:border-cyan-900/40">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /> {po.poNumber}</CardTitle>
                      <CardDescription className="mt-1">{po.supplier ? `${po.supplier} · ` : ''}{po.originCountry ?? '—'} → {po.destinationCountry ?? '—'} · {po.incoterm ?? 'FOB'} · {po.currency}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="gap-1">{po.lineItems.length} lines</Badge>
                      <Button variant="outline" size="sm" onClick={reset}><RefreshCw className="h-3.5 w-3.5" /> New PO</Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="border-t">
                    <ScrollArea className="h-[260px] lcie-scroll">
                      <Table>
                        <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                          <TableRow>
                            <TableHead className="w-10">#</TableHead><TableHead>Description</TableHead><TableHead className="w-20">SKU</TableHead>
                            <TableHead className="text-right w-20">Qty</TableHead><TableHead className="text-right w-24">Unit</TableHead><TableHead className="text-right w-28">Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {po.lineItems.map((li) => (
                            <TableRow key={li.id}>
                              <TableCell className="font-mono text-xs text-muted-foreground">{li.lineNumber}</TableCell>
                              <TableCell><p className="font-medium text-sm leading-tight">{li.description}</p>{li.material && <p className="text-[11px] text-muted-foreground">{li.material}</p>}</TableCell>
                              <TableCell className="font-mono text-xs">{li.sku ?? '—'}</TableCell>
                              <TableCell className="text-right text-sm">{li.quantity} <span className="text-[10px] text-muted-foreground">{li.unit ?? 'PCS'}</span></TableCell>
                              <TableCell className="text-right font-mono text-sm">{fmtMoney(li.unitValue, po.currency)}</TableCell>
                              <TableCell className="text-right font-mono text-sm font-medium">{fmtMoney(li.totalValue, po.currency)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t bg-cyan-50/40 dark:bg-cyan-950/15">
                    <span className="text-sm text-muted-foreground">FOB subtotal</span>
                    <span className="font-mono font-semibold text-lg text-cyan-700 dark:text-cyan-300">{fmtMoney(po.lineItems.reduce((s, l) => s + l.totalValue, 0), po.currency)}</span>
                  </div>
                </CardContent>
                <CardFooter className="border-t bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">Ready for the LCIE AI agent to determine the destination duty stack.</p>
                  <Button onClick={handleRunAgent} disabled={agentLoading || calcLoading} size="lg" className="gap-2">{agentLoading || calcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}{agentLoading ? 'Agent classifying…' : calcLoading ? 'Calculating landed cost…' : 'Run LCIE AI Agent'}</Button>
                </CardFooter>
              </Card>

              {/* Editable landed-cost inputs */}
              <LandedCostInputsForm inputs={inputs} setInputs={setInputs} currency={inputCur} onRecalculate={handleRecalculate} disabled={calcLoading || agentLoading} hasResult={!!calcResult} />
            </>
          )}

          {/* Agent steps panel */}
          <AnimatePresence>
            {(agentLoading || visibleSteps.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Card className="border-cyan-200/60 dark:border-cyan-900/40">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div><CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /> LCIE Agent — live trace</CardTitle><CardDescription>Grounding · LLM classification · parsing · storage.</CardDescription></div>
                      {agentResult && <Badge variant="outline" className="gap-1"><Database className="h-3 w-3" /> {agentResult.model} · {(agentResult.durationMs / 1000).toFixed(1)}s</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-64 overflow-y-auto lcie-scroll border-t">
                      <ul className="divide-y">
                        {visibleSteps.map((s) => (
                          <li key={s.step} className="flex items-start gap-3 p-3 text-sm">
                            <span className={`mt-0.5 h-5 w-5 rounded-full grid place-items-center shrink-0 ${s.status === 'error' ? 'bg-destructive/15 text-destructive' : s.status === 'stored' ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400' : s.status === 'llm_call' ? 'bg-cyan-600/15 text-cyan-600 dark:text-cyan-400' : 'bg-muted text-muted-foreground'}`}>{s.status === 'stored' ? <CheckCircle2 className="h-3 w-3" /> : s.status === 'error' ? <AlertTriangle className="h-3 w-3" /> : s.status === 'llm_call' ? <Brain className="h-3 w-3" /> : <ScanLine className="h-3 w-3" />}</span>
                            <div className="min-w-0 flex-1"><p className="font-medium leading-tight">{s.description}</p>{s.detail && <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>}<p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{new Date(s.ts).toLocaleTimeString()} · {s.status}</p></div>
                          </li>
                        ))}
                        {agentLoading && (<li className="flex items-center gap-3 p-3 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin text-cyan-600" /> awaiting next step…</li>)}
                      </ul>
                    </div>
                    {agentLoading && <div className="h-1 w-full gp4-flow-bar" />}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          {calcResult && agentResult && (
            <ResultsDashboard calc={calcResult} determinations={agentResult.determinations} onDownload={downloadReport} inputs={inputs} inputCur={inputCur} />
          )}

          {error && po && (<div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" /><p className="text-destructive">{error}</p></div>)}
        </section>
      </main>

      {/* ===== Footer (sticky to bottom) ===== */}
      <footer className="mt-auto border-t border-cyan-200/50 dark:border-cyan-900/40 bg-cyan-50/50 dark:bg-cyan-950/20">
        <div className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-3"><Gp4Logo size={36} /><div className="leading-tight"><p className="font-bold font-display text-sm">{BRAND_FULL}</p><p className="text-xs text-muted-foreground">Hydrogen Systems &amp; Supply Chain Framework</p></div></div>
              <p className="text-xs text-muted-foreground max-w-md leading-relaxed">Hydrogen hardware, pharmacology-grade wellness intelligence, and forensic landed-cost engineering — merged into one executive control deck.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5 border-cyan-300/60 text-cyan-700 dark:text-cyan-300 dark:border-cyan-800/60 hover:bg-cyan-50 dark:hover:bg-cyan-950/40"><Truck className="h-3.5 w-3.5" /> Schedule an Enterprise Green Audit</Button>
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Live Engines</p>
              <ul className="space-y-1.5 text-xs">
                <li className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-500" /> LCIE Landed Cost Engine</li>
                <li className="flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> H₂ Protocol &amp; Usage Tool</li>
                <li className="flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" /> ICE Fleet Savings Engine</li>
              </ul>
            </div>
            <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Divisions</p>
              <ul className="space-y-1.5 text-xs text-muted-foreground">
                <li className="flex items-center gap-1.5"><Leaf className="h-3 w-3" /> Going Green with Hydrogen</li>
                <li className="flex items-center gap-1.5"><Leaf className="h-3 w-3" /> {BRAND} Supply Chain Framework</li>
              </ul>
            </div>
          </div>
          <Separator className="mb-4" />
          <p className="text-[11px] text-muted-foreground leading-relaxed"><strong className="text-foreground">Financial disclaimer:</strong> landed-cost outputs are modelled estimates; FX rates are ECB reference rates (daily); Section 301 / IEEPA rates are subject to executive action and change without notice. Actual results depend on the HTS subheading, country of origin, tariff programme eligibility, and the importer's facts.</p>
          <div className="mt-3 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>© 2026 {BRAND_FULL}. All rights reserved. {BRAND} is a trademark of its owner.</span>
            <span className="flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-cyan-600" /> MFN / Column 1 rates · modelled for demonstration</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editable landed-cost inputs form                                     */
/* ------------------------------------------------------------------ */

function LandedCostInputsForm({
  inputs, setInputs, currency, onRecalculate, disabled, hasResult,
}: {
  inputs: LandedCostInputs; setInputs: (i: LandedCostInputs) => void;
  currency: string; onRecalculate: () => void; disabled: boolean; hasResult: boolean;
}) {
  const set = (k: keyof LandedCostInputs, v: string) => {
    const n = v === '' ? undefined : parseFloat(v);
    setInputs({ ...inputs, [k]: Number.isFinite(n) ? n : undefined });
  };
  const fields: { key: keyof LandedCostInputs; label: string; icon: typeof Truck; hint: string }[] = [
    { key: 'freight', label: 'Freight', icon: Ship, hint: 'Ocean / air freight to destination port' },
    { key: 'insurance', label: 'Insurance', icon: ShieldCheck, hint: 'Marine / cargo insurance' },
    { key: 'otherCharges', label: 'Other handling', icon: Boxes, hint: 'Packing, handling, terminal' },
    { key: 'customsBrokerFee', label: 'Customs broker fee', icon: FileCheck, hint: 'Entry filing / broker' },
    { key: 'documentationFee', label: 'Documentation fee', icon: FileText, hint: 'B/L, cert of origin, docs' },
    { key: 'dutyAdvanceFee', label: 'Duty advance fee', icon: Wallet, hint: 'Duty paid on your behalf' },
    { key: 'harborOrPortFee', label: 'Harbor / port fee', icon: Anchor, hint: 'Port dues, wharfage' },
    { key: 'inlandDestinationDelivery', label: 'Inland delivery', icon: MapPin, hint: 'Port → final DC' },
  ];
  return (
    <Card className="border-cyan-200/60 dark:border-cyan-900/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /> Landed-cost inputs</CardTitle>
        <CardDescription>Enter every import charge that touches this shipment — all in the PO currency ({currency}). The duty stack recalculates instantly.</CardDescription>
      </CardHeader>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {fields.map((f) => (
            <div key={f.key}>
              <Label className="text-xs flex items-center gap-1 mb-1"><f.icon className="h-3 w-3 text-cyan-600 dark:text-cyan-400" /> {f.label}</Label>
              <TooltipProvider delayDuration={200}><Tooltip><TooltipTrigger asChild><Input type="number" min="0" step="0.01" value={inputs[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)} className="font-mono text-sm" placeholder="0.00" /></TooltipTrigger><TooltipContent><p className="max-w-[200px] text-xs">{f.hint}</p></TooltipContent></Tooltip></TooltipProvider>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter className="border-t bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">All amounts in <strong className="text-foreground">{currency}</strong>. FX-converted to the destination currency on calculate.</p>
        <Button onClick={onRecalculate} disabled={disabled || !hasResult} size="sm" className="gap-1.5">
          {disabled ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {hasResult ? 'Re-calculate landed cost' : 'Run agent first'}
        </Button>
      </CardFooter>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Results dashboard                                                    */
/* ------------------------------------------------------------------ */

function ResultsDashboard({
  calc, determinations, onDownload, inputs, inputCur,
}: {
  calc: CalculateResponse; determinations: DeterminationResult[];
  onDownload: () => void; inputs: LandedCostInputs; inputCur: string;
}) {
  const c = calc.calculation;
  if (!c) return null;
  const dets = determinations.slice().sort((a, b) => a.lineNumber - b.lineNumber);
  const fx = calc.fx;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
      {/* Destination header + FX */}
      <Card className="border-cyan-200/60 dark:border-cyan-900/40">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-cyan-600 dark:text-cyan-400" /> Landed cost — {calc.poNumber} → {calc.destination.flag} {calc.destination.countryName}</CardTitle>
              <CardDescription>Duty stack for the final destination only · {c.region === 'US' ? 'HTS' : c.region === 'UK' ? 'UK Global Tariff' : 'EU TARIC'} classification · {c.notes.split('.')[0]}.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {fx ? (
                <TooltipProvider><Tooltip><TooltipTrigger asChild><Badge className="gap-1 bg-cyan-600 hover:bg-cyan-600 text-white"><TrendingUp className="h-3.5 w-3.5" /> {sym(calc.originCurrency)}1 = {fmtMoney(fx.rate, calc.destination.currency)}</Badge></TooltipTrigger><TooltipContent><p className="text-xs">Live {fx.source === 'frankfurter' ? 'ECB reference' : fx.source} rate · {fx.date}<br/>{calc.originCurrency} → {calc.destination.currency} · fetched {new Date(fx.fetchedAt).toLocaleTimeString()}</p></TooltipContent></Tooltip></TooltipProvider>
              ) : (
                <Badge variant="outline" className="gap-1 border-cyan-300/60 text-cyan-700 dark:text-cyan-300"><Globe2 className="h-3.5 w-3.5" /> {calc.destination.currency} (no FX — PO already in destination currency)</Badge>
              )}
              <Button variant="outline" size="sm" onClick={onDownload} className="gap-1"><Download className="h-3.5 w-3.5" /> Export JSON</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {fx && (
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-200/50 dark:border-cyan-900/40 p-2.5 text-xs">
              <span className="text-muted-foreground">Live FX:</span>
              <span className="font-mono font-medium">{fmtMoney(1, calc.originCurrency)} {calc.originCurrency} = {fmtMoney(fx.rate, calc.destination.currency)} {calc.destination.currency}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">{fx.source === 'frankfurter' ? 'ECB reference rate' : fx.source} · {fx.date}</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">source PO currency: {calc.originCurrency}</span>
            </div>
          )}
          {c && <DutyCharts calculations={[c]} />}
        </CardContent>
      </Card>

      {/* Single destination region card with waterfall */}
      <RegionCard calc={c} dets={dets} originCurrency={calc.originCurrency} fxRate={fx?.rate ?? 1} />

      {/* Per-line determination + reasoning */}
      <Card className="border-cyan-200/60 dark:border-cyan-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ScanLine className="h-4 w-4 text-cyan-600 dark:text-cyan-400" /> Per-line HS determination &amp; duty stack</CardTitle>
          <CardDescription>What the LCIE agent classified for every line — HS code, duty rate, Section 301 / IEEPA (US only), VAT, and reasoning, all in {c.currency}.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[460px] overflow-y-auto lcie-scroll">
            <Table>
              <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                <TableRow>
                  <TableHead className="w-10">#</TableHead><TableHead className="min-w-[180px]">Item</TableHead><TableHead className="w-32">HS code</TableHead>
                  <TableHead className="text-right w-20">Duty</TableHead>
                  {c.region === 'US' && <TableHead className="text-right w-20">§301</TableHead>}
                  {c.region === 'US' && <TableHead className="text-right w-20">IEEPA</TableHead>}
                  {c.region !== 'US' && <TableHead className="text-right w-20">VAT</TableHead>}
                  <TableHead className="text-right w-24">Line total</TableHead><TableHead className="w-20">Conf.</TableHead><TableHead className="min-w-[240px]">Reasoning</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.lineBreakdown.map((lb) => (
                  <TableRow key={lb.lineItemId}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{lb.lineNumber}</TableCell>
                    <TableCell><p className="text-sm font-medium leading-tight">{lb.description}</p><p className="text-[11px] text-muted-foreground">{lb.tariffDescription}</p></TableCell>
                    <TableCell className="font-mono text-xs">{lb.hsCode || '—'}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{lb.dutyType === 'free' ? 'Free' : fmtPct(lb.dutyRate)}</TableCell>
                    {c.region === 'US' && <TableCell className="text-right font-mono text-xs text-violet-600 dark:text-violet-400">{fmtPct(lb.section301Rate)}</TableCell>}
                    {c.region === 'US' && <TableCell className="text-right font-mono text-xs text-pink-600 dark:text-pink-400">{fmtPct(lb.ieepaRate)}</TableCell>}
                    {c.region !== 'US' && <TableCell className="text-right font-mono text-xs">{fmtPct(lb.vatRate)}</TableCell>}
                    <TableCell className="text-right font-mono text-xs font-medium">{fmtMoney(lb.lineLandedCost, c.currency)}</TableCell>
                    <TableCell><div className="flex items-center gap-1.5"><Progress value={lb.confidence * 100} className="h-1.5 w-10 [&>div]:bg-cyan-500" /><span className="text-[10px] text-muted-foreground">{Math.round(lb.confidence * 100)}%</span></div></TableCell>
                    <TableCell className="text-xs text-muted-foreground leading-snug">{lb.reasoning ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Single destination region card with the duty-stack waterfall        */
/* ------------------------------------------------------------------ */

function RegionCard({
  calc, dets, originCurrency, fxRate,
}: {
  calc: CalculateResponse['calculation'] extends infer C ? C extends null ? never : C : never;
  dets: DeterminationResult[]; originCurrency: string; fxRate: number;
}) {
  if (!calc) return null;
  const avgConfidence = dets.length ? dets.reduce((s, d) => s + d.confidence, 0) / dets.length : 0;

  return (
    <Card className="border-cyan-200/60 dark:border-cyan-900/40 relative overflow-hidden before:absolute before:left-0 before:top-0 before:h-full before:w-1 before:bg-cyan-500">
      <CardHeader className="pb-2 pl-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><span className="text-lg">{calc.flag}</span> {calc.label} — duty stack</CardTitle>
          <Badge variant="outline" className="font-mono">{calc.currency}</Badge>
        </div>
        <CardDescription className="pl-5">{calc.region === 'US' ? 'Duty on FOB · §301 / IEEPA · MPF/HMF · no federal VAT' : 'Duty on CIF · VAT on (CIF + duty)'}</CardDescription>
      </CardHeader>
      <CardContent className="pl-5 pb-3 pt-0">
        {/* Waterfall: step-by-step duty stack */}
        <div className="rounded-lg border border-cyan-200/50 dark:border-cyan-900/40 overflow-hidden">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 px-3 py-2 bg-cyan-50/50 dark:bg-cyan-950/15 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-cyan-200/50 dark:border-cyan-900/40">
            <span>Duty-stack step</span><span className="text-right">Amount ({calc.currency}) · Cumulative</span>
          </div>
          <ul className="divide-y divide-border">
            {calc.waterfall.map((w, i) => {
              const isTotal = w.label.startsWith('=');
              const isSubtotal = w.label.includes('CIF value');
              const max = calc.waterfall[calc.waterfall.length - 1]?.cumulative || 1;
              const pctW = Math.min(100, Math.max(2, (w.cumulative / max) * 100));
              return (
                <li key={i} className={`relative px-3 py-1.5 ${isTotal ? 'bg-cyan-50/60 dark:bg-cyan-950/25 font-semibold' : ''}`}>
                  <div className="grid grid-cols-[1fr_auto] gap-x-3 items-center text-sm">
                    <span className={`flex items-center gap-1.5 ${isTotal ? 'text-cyan-700 dark:text-cyan-300' : ''}`}>
                      {w.label.startsWith('+') ? <ArrowRight className="h-3 w-3 text-muted-foreground" /> : isTotal ? <Calculator className="h-3 w-3 text-cyan-600" /> : null}
                      <span>{w.label.replace(/^[+=]\s*/, isTotal ? '' : '')}</span>
                      {w.rate !== undefined && w.rate > 0 && <Badge variant="secondary" className="ml-1 text-[10px] py-0 h-4 gap-0.5"><Percent className="h-2.5 w-2.5" />{fmtPct(w.rate)}</Badge>}
                    </span>
                    <span className="font-mono text-right whitespace-nowrap">
                      <span className={w.amount < 0 ? 'text-destructive' : ''}>{w.amount >= 0 ? '+' : ''}{fmtMoney(w.amount, calc.currency)}</span>
                      <span className="text-muted-foreground text-xs ml-2">→ {fmtMoney(w.cumulative, calc.currency)}</span>
                    </span>
                  </div>
                  {!isTotal && (
                    <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-cyan-500 to-teal-400" style={{ width: `${pctW}%` }} />
                    </div>
                  )}
                  {w.note && <p className="text-[10px] text-muted-foreground mt-0.5">{w.note}</p>}
                </li>
              );
            })}
          </ul>
        </div>

        <Separator className="my-3" />
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total landed cost</p>
            <p className="text-2xl font-bold font-mono text-cyan-700 dark:text-cyan-300">{fmtMoney(calc.totalLandedCost, calc.currency)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Effective rate</p>
            <p className="text-sm font-mono">{fmtPct(calc.effectiveRate)}</p>
            {fxRate !== 1 && <p className="text-[10px] text-muted-foreground mt-0.5">≈ {fmtMoney(calc.totalLandedCost / fxRate, originCurrency)} {originCurrency}</p>}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-cyan-600" /> avg agent confidence</span>
          <span className="font-mono">{Math.round(avgConfidence * 100)}%</span>
        </div>
        <Progress value={avgConfidence * 100} className="mt-1 h-1 [&>div]:bg-cyan-500" />
      </CardContent>
    </Card>
  );
}
