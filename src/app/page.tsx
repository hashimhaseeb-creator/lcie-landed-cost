'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Leaf,
  Upload,
  FileText,
  Sparkles,
  Loader2,
  ShieldCheck,
  Globe2,
  Truck,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Database,
  ScanLine,
  Brain,
  ChevronRight,
  Sun,
  Moon,
  Download,
  RefreshCw,
  Boxes,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DutyCharts } from '@/components/lcie/duty-charts';
import type { PoDto, DetermineResponse, CalculateResponse, Region, RegionCalculation, DeterminationResult, AgentStep } from '@/lib/lcie/types';
import { toast } from 'sonner';

const CUR: Record<string, string> = { USD: '$', GBP: '£', EUR: '€', PKR: '₨', INR: '₹' };
const sym = (c: string) => CUR[c] ?? '';
const fmtMoney = (n: number, c: string) => `${sym(c)}${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(n < 0.1 ? 3 : 2)}%`;

interface SampleSummary { id: string; title: string; blurb: string; lineCount: number }

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    fetch('/api/lcie/sample-po')
      .then((r) => r.json())
      .then((d) => setSamples(d.samples ?? []))
      .catch(() => void 0);
  }, []);

  // reveal agent steps progressively for a "live" feel
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

  const reset = () => {
    setPo(null);
    setAgentResult(null);
    setCalcResult(null);
    setVisibleSteps([]);
    setError(null);
    setPasteText('');
  };

  const uploadPayload = useCallback(async (rawText: string, fileName?: string) => {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', new File([rawText], fileName ?? 'po.txt', { type: 'text/plain' }));
      const res = await fetch('/api/lcie/upload-po', { method: 'POST', body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.detail ?? e.error ?? 'Upload failed');
      }
      const dto: PoDto = await res.json();
      setPo(dto);
      setAgentResult(null);
      setCalcResult(null);
      setVisibleSteps([]);
      toast.success(`PO ${dto.poNumber} parsed — ${dto.lineItems.length} line item(s)`);
      setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      toast.error('PO upload failed');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const text = await file.text();
    await uploadPayload(text, file.name);
  }, [uploadPayload]);

  const handleLoadSample = useCallback(async (id: string) => {
    setUploading(true);
    setError(null);
    try {
      const res = await fetch(`/api/lcie/sample-po?id=${id}`);
      const data = await res.json();
      const fd = new FormData();
      fd.append('file', new File([JSON.stringify(data, null, 2)], `${id}.json`, { type: 'application/json' }));
      fd.append('meta', JSON.stringify({ poNumber: data.poNumber, supplier: data.supplier, originCountry: data.originCountry, destinationCountry: data.destinationCountry, currency: data.currency, incoterm: data.incoterm, freight: data.freight, insurance: data.insurance, otherCharges: data.otherCharges }));
      const r2 = await fetch('/api/lcie/upload-po', { method: 'POST', body: fd });
      if (!r2.ok) {
        const e = await r2.json().catch(() => ({}));
        throw new Error(e.detail ?? e.error ?? 'Sample load failed');
      }
      const dto: PoDto = await r2.json();
      setPo(dto);
      setAgentResult(null);
      setCalcResult(null);
      setVisibleSteps([]);
      toast.success(`Sample PO loaded — ${dto.lineItems.length} line item(s)`);
      setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sample load failed');
      toast.error('Sample load failed');
    } finally {
      setUploading(false);
    }
  }, []);

  const handlePaste = useCallback(async () => {
    if (!pasteText.trim()) return;
    await uploadPayload(pasteText, 'pasted-po.txt');
  }, [pasteText, uploadPayload]);

  const handleRunAgent = useCallback(async () => {
    if (!po) return;
    setAgentLoading(true);
    setError(null);
    setAgentResult(null);
    setCalcResult(null);
    setVisibleSteps([]);
    try {
      const r1 = await fetch('/api/lcie/determine-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId: po.id }),
      });
      if (!r1.ok) {
        const e = await r1.json().catch(() => ({}));
        throw new Error(e.detail ?? e.error ?? 'Agent run failed');
      }
      const det: DetermineResponse = await r1.json();
      setAgentResult(det);
      toast.success(`LCIE agent classified ${det.determinations.length / 3} line(s) × 3 regions in ${(det.durationMs / 1000).toFixed(1)}s`);

      setCalcLoading(true);
      const r2 = await fetch('/api/lcie/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poId: po.id }),
      });
      if (!r2.ok) {
        const e = await r2.json().catch(() => ({}));
        throw new Error(e.detail ?? e.error ?? 'Landed cost failed');
      }
      const calc: CalculateResponse = await r2.json();
      setCalcResult(calc);
      toast.success('Landed cost calculated for US / UK / EU');
      setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 120);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Agent run failed');
      toast.error('LCIE agent failed');
    } finally {
      setAgentLoading(false);
      setCalcLoading(false);
    }
  }, [po]);

  const downloadReport = () => {
    if (!po || !agentResult || !calcResult) return;
    const blob = new Blob([JSON.stringify({ po, agentResult, calcResult }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lcie-report-${po.poNumber}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50/60 via-background to-background dark:from-emerald-950/30 dark:via-background dark:to-background">
      {/* Header (sticky) */}
      <header className="sticky top-0 z-50 w-full border-b border-emerald-200/60 dark:border-emerald-900/40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="relative h-9 w-9 rounded-xl bg-primary/15 border border-primary/30 grid place-items-center text-primary">
              <Leaf className="h-5 w-5" />
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-primary lcie-pulse" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700 dark:text-emerald-400 font-semibold leading-none">Green G(P)4 Supply Chain Framework</p>
              <h1 className="text-sm md:text-base font-semibold leading-tight truncate">LCIE Landed Cost Agent</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden sm:inline-flex border-emerald-300/60 text-emerald-700 dark:text-emerald-400 dark:border-emerald-800/60 gap-1">
              <Cpu className="h-3 w-3" /> AI Agent online
            </Badge>
            <Button variant="outline" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Toggle theme">
              {mounted && theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="container mx-auto px-4 pt-10 pb-6">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="max-w-3xl">
            <Badge variant="secondary" className="mb-3 border-emerald-200/60 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-400">
              <Sparkles className="h-3 w-3 mr-1" /> AI-assisted harmonized code determination
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
              Landed Cost Intelligence Engine
              <span className="block text-emerald-600 dark:text-emerald-400">for US · UK · EU duty stacks</span>
            </h2>
            <p className="mt-3 text-muted-foreground text-base md:text-lg max-w-2xl">
              Upload a Purchase Order and the LCIE agent auto-determines HS codes for the{' '}
              <strong className="text-foreground">US HTS</strong>,{' '}
              <strong className="text-foreground">UK Global Tariff</strong> and{' '}
              <strong className="text-foreground">EU TARIC</strong> schedules, then calculates duty, VAT and other leviable charges — live, with reasoning you can audit.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { icon: Brain, label: 'AI HS classification' },
                { icon: Globe2, label: '3 regions in one pass' },
                { icon: ShieldCheck, label: 'Auditable reasoning' },
                { icon: Calculator, label: 'Full landed cost' },
              ].map((f) => (
                <Badge key={f.label} variant="outline" className="gap-1.5 py-1.5 px-3 rounded-full border-emerald-200/60 dark:border-emerald-900/40">
                  <f.icon className="h-3.5 w-3.5 text-primary" /> {f.label}
                </Badge>
              ))}
            </div>
          </motion.div>
        </section>

        {/* Workspace */}
        <section ref={workspaceRef} className="container mx-auto px-4 pb-12 space-y-6">
          {/* Upload card */}
          {!po && (
            <Card className="border-emerald-200/60 dark:border-emerald-900/40 overflow-hidden">
              <CardHeader className="bg-emerald-50/60 dark:bg-emerald-950/20 border-b border-emerald-100 dark:border-emerald-900/30">
                <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /> Upload a Purchase Order</CardTitle>
                <CardDescription>Drop a CSV / JSON / text PO, paste PO lines, or load a sample consignment to begin.</CardDescription>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Dropzone */}
                  <div>
                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={(e) => {
                        e.preventDefault(); setDragOver(false);
                        const f = e.dataTransfer.files?.[0];
                        if (f) handleFile(f);
                      }}
                      onClick={() => fileInputRef.current?.click()}
                      className={`cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dragOver ? 'border-primary bg-primary/5' : 'border-emerald-200 dark:border-emerald-900/50 hover:border-primary/60 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20'}`}
                    >
                      <input ref={fileInputRef} type="file" accept=".csv,.json,.txt,.xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                      <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 grid place-items-center mb-3">
                        {uploading ? <Loader2 className="h-6 w-6 text-primary animate-spin" /> : <FileText className="h-6 w-6 text-primary" />}
                      </div>
                      <p className="font-medium">{uploading ? 'Parsing PO…' : 'Drop PO file here or click to browse'}</p>
                      <p className="text-xs text-muted-foreground mt-1">CSV, JSON, or plain text · auto-detects columns</p>
                    </div>
                  </div>
                  {/* Paste */}
                  <div className="flex flex-col">
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5"><Boxes className="h-4 w-4 text-primary" /> Paste PO line items</label>
                    <Textarea
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder={`1. Cotton knit T-shirt, 220gsm — 5000 pcs @ $3.20
2. Leather handbag, cowhide — 800 pcs @ $18.50
3. 5G smartphone, 6.7" OLED — 1200 pcs @ $142`}
                      className="flex-1 min-h-[140px] font-mono text-xs lcie-scroll"
                    />
                    <Button onClick={handlePaste} disabled={!pasteText.trim() || uploading} className="mt-2 self-end" size="sm">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />} Parse &amp; load
                    </Button>
                  </div>
                </div>

                {/* Samples */}
                {samples.length > 0 && (
                  <div className="mt-6">
                    <Separator className="mb-4" />
                    <p className="text-sm font-medium mb-2 flex items-center gap-1.5"><Boxes className="h-4 w-4 text-primary" /> Or load a sample consignment</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {samples.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => handleLoadSample(s.id)}
                          disabled={uploading}
                          className="text-left rounded-lg border border-emerald-200/70 dark:border-emerald-900/40 bg-card hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 hover:border-primary/50 p-3 transition-colors disabled:opacity-60"
                        >
                          <p className="text-sm font-medium leading-tight">{s.title}</p>
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.blurb}</p>
                          <p className="text-[11px] text-primary mt-2 flex items-center gap-1">{s.lineCount} line items <ChevronRight className="h-3 w-3" /></p>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {error && (
                  <div className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                    <p className="text-destructive">{error}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* PO + line items */}
          {po && (
            <Card className="border-emerald-200/60 dark:border-emerald-900/40">
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> {po.poNumber}</CardTitle>
                    <CardDescription className="mt-1">
                      {po.supplier ? `${po.supplier} · ` : ''}{po.originCountry ?? '—'} → {po.destinationCountry ?? '—'} · {po.incoterm ?? 'FOB'} · {po.currency}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1">{po.lineItems.length} lines</Badge>
                    <Button variant="outline" size="sm" onClick={reset}><RefreshCw className="h-3.5 w-3.5" /> New PO</Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="border-t">
                  <ScrollArea className="h-[280px] lcie-scroll">
                    <Table>
                      <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                        <TableRow>
                          <TableHead className="w-12">#</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="w-20">SKU</TableHead>
                          <TableHead className="text-right w-20">Qty</TableHead>
                          <TableHead className="text-right w-28">Unit value</TableHead>
                          <TableHead className="text-right w-32">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {po.lineItems.map((li) => (
                          <TableRow key={li.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{li.lineNumber}</TableCell>
                            <TableCell>
                              <p className="font-medium text-sm leading-tight">{li.description}</p>
                              {li.material && <p className="text-[11px] text-muted-foreground">{li.material}</p>}
                            </TableCell>
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
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-t bg-emerald-50/40 dark:bg-emerald-950/15">
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span>Freight: <strong className="text-foreground font-mono">{fmtMoney(po.freight, po.currency)}</strong></span>
                    <span>Insurance: <strong className="text-foreground font-mono">{fmtMoney(po.insurance, po.currency)}</strong></span>
                    <span>Other: <strong className="text-foreground font-mono">{fmtMoney(po.otherCharges, po.currency)}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm text-muted-foreground">FOB subtotal</span>
                        </TooltipTrigger>
                        <TooltipContent>The goods value before freight, insurance, duty or tax.</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <span className="font-mono font-semibold text-lg text-primary">{fmtMoney(po.lineItems.reduce((s, l) => s + l.totalValue, 0), po.currency)}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="border-t bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Ready for the LCIE AI agent to determine HS codes for US, UK &amp; EU.</p>
                <Button onClick={handleRunAgent} disabled={agentLoading || calcLoading} size="lg" className="gap-2">
                  {agentLoading || calcLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Brain className="h-4 w-4" />}
                  {agentLoading ? 'Agent classifying…' : calcLoading ? 'Calculating landed cost…' : 'Run LCIE AI Agent'}
                </Button>
              </CardFooter>
            </Card>
          )}

          {/* Agent steps panel */}
          <AnimatePresence>
            {(agentLoading || visibleSteps.length > 0) && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Card className="border-emerald-200/60 dark:border-emerald-900/40">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2"><Cpu className="h-5 w-5 text-primary" /> LCIE Agent — live trace</CardTitle>
                        <CardDescription>Grounding · LLM classification · parsing · storage — one row per step.</CardDescription>
                      </div>
                      {agentResult && <Badge variant="outline" className="gap-1"><Database className="h-3 w-3" /> {agentResult.model} · {(agentResult.durationMs / 1000).toFixed(1)}s</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="max-h-72 overflow-y-auto lcie-scroll border-t">
                      <ul className="divide-y">
                        {visibleSteps.map((s) => (
                          <li key={s.step} className="flex items-start gap-3 p-3 text-sm">
                            <span className={`mt-0.5 h-5 w-5 rounded-full grid place-items-center shrink-0 ${s.status === 'error' ? 'bg-destructive/15 text-destructive' : s.status === 'stored' ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : s.status === 'llm_call' ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>
                              {s.status === 'stored' ? <CheckCircle2 className="h-3 w-3" /> : s.status === 'error' ? <AlertTriangle className="h-3 w-3" /> : s.status === 'llm_call' ? <Brain className="h-3 w-3" /> : <ScanLine className="h-3 w-3" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="font-medium leading-tight">{s.description}</p>
                              {s.detail && <p className="text-xs text-muted-foreground mt-0.5">{s.detail}</p>}
                              <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">{new Date(s.ts).toLocaleTimeString()} · {s.status}</p>
                            </div>
                          </li>
                        ))}
                        {agentLoading && (
                          <li className="flex items-center gap-3 p-3 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" /> awaiting next step…
                          </li>
                        )}
                      </ul>
                    </div>
                    {agentLoading && <div className="h-1 w-full lcie-flow-bar" />}
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Results */}
          {calcResult && agentResult && (
            <ResultsDashboard calc={calcResult} determinations={agentResult.determinations} onDownload={downloadReport} />
          )}

          {error && po && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-destructive">{error}</p>
            </div>
          )}
        </section>
      </main>

      {/* Footer (sticky to bottom) */}
      <footer className="mt-auto border-t border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
        <div className="container mx-auto px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Leaf className="h-3.5 w-3.5 text-primary" />
            <span>Green G(P)4 Supply Chain Framework · LCIE Landed Cost Agent</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Truck className="h-3 w-3" /> US HTS · UK Global Tariff · EU TARIC</span>
            <span className="hidden sm:inline">·</span>
            <span>Demo · rates are research-typical MFN</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Results dashboard                                                   */
/* ------------------------------------------------------------------ */

function ResultsDashboard({
  calc,
  determinations,
  onDownload,
}: {
  calc: CalculateResponse;
  determinations: DeterminationResult[];
  onDownload: () => void;
}) {
  const byRegion = (r: Region) => calc.calculations.find((c) => c.region === r)!;
  const detsFor = (r: Region) => determinations.filter((d) => d.region === r).sort((a, b) => a.lineNumber - b.lineNumber);
  const us = byRegion('US');
  const uk = byRegion('UK');
  const eu = byRegion('EU');

  const cheapest = [...calc.calculations].sort((a, b) => a.effectiveRate - b.effectiveRate)[0];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="space-y-6">
      <Card className="border-emerald-200/60 dark:border-emerald-900/40">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5 text-primary" /> Landed cost results — {calc.poNumber}</CardTitle>
              <CardDescription>AI-determined HS codes · duty · VAT · MPF/HMF · freight &amp; insurance across 3 regions.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {cheapest && (
                <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600 text-white">
                  <ShieldCheck className="h-3.5 w-3.5" /> Lowest effective rate: {cheapest.flag} {cheapest.region} ({(cheapest.effectiveRate * 100).toFixed(2)}%)
                </Badge>
              )}
              <Button variant="outline" size="sm" onClick={onDownload} className="gap-1"><Download className="h-3.5 w-3.5" /> Export JSON</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <DutyCharts calculations={calc.calculations} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RegionCard calc={us} dets={detsFor('US')} accent="us" />
        <RegionCard calc={uk} dets={detsFor('UK')} accent="uk" />
        <RegionCard calc={eu} dets={detsFor('EU')} accent="eu" />
      </div>

      <Card className="border-emerald-200/60 dark:border-emerald-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><ScanLine className="h-4 w-4 text-primary" /> Per-line HS determination &amp; reasoning</CardTitle>
          <CardDescription>What the LCIE agent classified for every line, per region — with confidence and grounding.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="US">
            <div className="px-4 pt-2 border-b">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="US" className="gap-1">🇺🇸 US HTS</TabsTrigger>
                <TabsTrigger value="UK" className="gap-1">🇬🇧 UK Tariff</TabsTrigger>
                <TabsTrigger value="EU" className="gap-1">🇪🇺 EU TARIC</TabsTrigger>
              </TabsList>
            </div>
            {(['US', 'UK', 'EU'] as Region[]).map((r) => (
              <TabsContent key={r} value={r} className="m-0">
                <ScrollArea className="max-h-96 lcie-scroll">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur z-10">
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead className="min-w-[200px]">Item</TableHead>
                        <TableHead className="w-36">HS code</TableHead>
                        <TableHead className="text-right w-20">Duty</TableHead>
                        <TableHead className="text-right w-20">VAT</TableHead>
                        <TableHead className="w-24">Conf.</TableHead>
                        <TableHead className="min-w-[260px]">Reasoning</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detsFor(r).map((d) => (
                        <TableRow key={`${d.lineItemId}-${d.region}`}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{d.lineNumber}</TableCell>
                          <TableCell><p className="text-sm font-medium leading-tight">{d.description}</p><p className="text-[11px] text-muted-foreground">{d.tariffDescription}</p></TableCell>
                          <TableCell className="font-mono text-xs">{d.hsCode || '—'}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{d.dutyType === 'free' ? 'Free' : fmtPct(d.dutyRate)}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{r === 'US' ? '—' : fmtPct(d.vatRate)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
              <Progress value={d.confidence * 100} className="h-1.5 w-12 [&>div]:bg-emerald-500" />
                              <span className="text-[10px] text-muted-foreground">{Math.round(d.confidence * 100)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground leading-snug">{d.reasoning ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RegionCard({ calc, dets, accent }: { calc: RegionCalculation; dets: DeterminationResult[]; accent: 'us' | 'uk' | 'eu' }) {
  const rows: { label: string; value: number; muted?: boolean; hint?: string }[] = [
    { label: 'FOB subtotal (goods)', value: calc.subtotal, muted: true },
    { label: 'Import duty', value: calc.dutyTotal, hint: 'AI-determined HS rate × calc base' },
    ...(calc.region === 'US'
      ? [
          { label: 'MPF (0.3464%)', value: calc.mpfTotal, hint: 'Merchandise Processing Fee, capped $31.67–$614.35' },
          { label: 'HMF (0.125%)', value: calc.hmfTotal, hint: 'Harbor Maintenance Fee (ocean)' },
        ]
      : []),
    ...(calc.region !== 'US' ? [{ label: 'VAT', value: calc.vatTotal, hint: 'On (CIF + duty)' }] : []),
    { label: 'Freight', value: calc.freight, muted: true },
    { label: 'Insurance', value: calc.insurance, muted: true },
    ...(calc.otherLevies > 0 ? [{ label: 'Other levies', value: calc.otherLevies }] : []),
  ];
  const avgConfidence = dets.length ? dets.reduce((s, d) => s + d.confidence, 0) / dets.length : 0;
  const accentRing = accent === 'us' ? 'before:bg-rose-400' : accent === 'uk' ? 'before:bg-blue-400' : 'before:bg-amber-400';
  return (
    <Card className={`relative overflow-hidden border-emerald-200/60 dark:border-emerald-900/40 before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${accentRing}`}>
      <CardHeader className="pb-2 pl-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2"><span className="text-lg">{calc.flag}</span> {calc.label}</CardTitle>
          <Badge variant="outline" className="font-mono">{calc.currency}</Badge>
        </div>
        <CardDescription className="pl-5">{calc.region === 'US' ? 'Duty on FOB · MPF/HMF · no federal VAT' : 'Duty on CIF · VAT on (CIF + duty)'}</CardDescription>
      </CardHeader>
      <CardContent className="pl-5 pb-3 pt-0">
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild><span className={`text-xs ${r.muted ? 'text-muted-foreground' : ''}`}>{r.label}</span></TooltipTrigger>
                  {r.hint && <TooltipContent><p className="max-w-[220px]">{r.hint}</p></TooltipContent>}
                </Tooltip>
              </TooltipProvider>
              <span className={`font-mono ${r.muted ? 'text-muted-foreground' : 'font-medium'}`}>{fmtMoney(r.value, calc.currency)}</span>
            </li>
          ))}
        </ul>
        <Separator className="my-3" />
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Total landed cost</p>
            <p className="text-2xl font-bold font-mono text-primary">{fmtMoney(calc.totalLandedCost, calc.currency)}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Effective rate</p>
            <p className="text-sm font-mono">{fmtPct(calc.effectiveRate)}</p>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1"><ShieldCheck className="h-3 w-3 text-emerald-500" /> avg agent confidence</span>
          <span className="font-mono">{Math.round(avgConfidence * 100)}%</span>
        </div>
        <Progress value={avgConfidence * 100} className="mt-1 h-1 [&>div]:bg-emerald-500" />
      </CardContent>
    </Card>
  );
}
