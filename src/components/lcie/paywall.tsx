'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck, Sparkles, Globe2, Brain, CheckCircle2, Loader2, KeyRound,
  FileCheck, Calculator, ArrowRight, Lock, Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Gp4Logo } from '@/components/gp4-logo';
import { verifyKey, startFreePreview, type LicenseState } from '@/lib/lcie/client-license';
import { toast } from 'sonner';

const BRAND = 'Green G(P)\u2074\u2122';
const BRAND_FULL = 'Green G(P)\u2074\u2122 Global Operations';
const FRAMEWORK = 'Plan \u00b7 Procure \u00b7 Produce \u00b7 Provide';
// Set NEXT_PUBLIC_LEMON_CHECKOUT in your deploy env (the Lemon Squeezy checkout URL for the Pro product).
const LEMON_CHECKOUT = process.env.NEXT_PUBLIC_LEMON_CHECKOUT ?? 'https://your-store.lemonsqueezy.com/buy/replace-with-your-pro-product-id';
// Payoneer "Request a Payment" / checkout link — paste your Payoneer payment URL here.
// Used for the pay-per-PO one-off path (SMBs with 2-3 shipments/year who won't subscribe).
const PAYONEER_PAY = process.env.NEXT_PUBLIC_PAYONEER_PAY_URL ?? 'https://payoneer.com';

const TIERS = [
  {
    name: 'Free preview', price: '$0', per: ' trial', highlight: false,
    blurb: 'One free PO — see the full duty stack + waterfall + CBP comparison. US only.',
    features: ['1 PO calculation (one-time trial)', 'US destination only', 'HS codes + full duty stack', 'No CSV/JSON export, no CBP export'],
    cta: 'Start free preview', action: 'free' as const,
  },
  {
    name: 'Pay-per-PO', price: '$9', per: '/PO', highlight: false,
    blurb: 'For the 2-3 shipments/year shipper — no subscription. Pay one-off via Payoneer.',
    features: ['1 PO calculation per payment', 'All regions: US · UK · EU · AU', 'Full duty stack + live FX + CBP compare', 'No recurring billing — pay when you ship'],
    cta: 'Pay $9 via Payoneer', action: 'payoneer' as const,
  },
  {
    name: 'Pro', price: '$49', per: '/mo', highlight: true,
    blurb: 'For importers who ship regularly. All regions, full duty stack, export + CBP validation.',
    features: ['Unlimited PO calculations', 'All regions: US · UK · EU · AU', 'Live FX (ECB) + CBP entry comparison', 'CSV/JSON export · 1,000 calcs/mo'],
    cta: 'Subscribe via Lemon Squeezy', action: 'lemon' as const,
  },
  {
    name: 'Business', price: '$199', per: '/mo', highlight: false,
    blurb: 'Teams + procurement systems. Seats, batch upload, API access, priority LLM.',
    features: ['Everything in Pro', '3 team seats', 'API access (10k calls/mo)', 'Batch PO upload · priority LLM'],
    cta: 'Subscribe via Lemon Squeezy', action: 'lemon' as const,
  },
];

export function Paywall({ onUnlocked }: { onUnlocked: (s: LicenseState) => void }) {
  const [keyInput, setKeyInput] = useState('');
  const [busy, setBusy] = useState<'free' | 'verify' | null>(null);

  const handleFree = async () => {
    setBusy('free');
    const s = await startFreePreview();
    if (s.valid && s.key) { onUnlocked(s); toast.success(`Free preview unlocked — 3 calculations this month`); }
    else { toast.error(s.reason ?? 'Could not start free preview'); }
    setBusy(null);
  };
  const handleVerify = async () => {
    if (!keyInput.trim()) { toast.error('Enter your license key'); return; }
    setBusy('verify');
    const s = await verifyKey(keyInput.trim());
    if (s.valid) { onUnlocked(s); toast.success(`Unlocked — ${s.plan} plan, ${s.remaining} calcs remaining`); }
    else { toast.error(s.reason ?? 'Invalid license key'); }
    setBusy(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background gp4-hero-glow">
      {/* header */}
      <header className="sticky top-0 z-50 w-full border-b border-emerald-200/50 dark:border-emerald-900/40 bg-background/85 backdrop-blur">
        <div className="container mx-auto px-4 h-16 flex items-center gap-3">
          <Gp4Logo size={52} />
          <div className="min-w-0 leading-tight">
            <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300 font-semibold">{BRAND} <span className="text-muted-foreground font-normal">Global Operations</span></p>
            <h1 className="text-sm md:text-base font-bold font-display truncate">LCIE Landed Cost Engine</h1>
          </div>
          <a href={LEMON_CHECKOUT} target="_blank" rel="noopener noreferrer" className="ml-auto">
            <Button size="sm" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Subscribe</Button>
          </a>
        </div>
      </header>

      <main className="flex-1">
        <section className="container mx-auto px-4 pt-12 pb-8 text-center max-w-4xl">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <Badge variant="secondary" className="mb-3 border-emerald-200/60 dark:border-emerald-900/40 text-emerald-700 dark:text-emerald-300"><Sparkles className="h-3 w-3 mr-1" /> {FRAMEWORK}</Badge>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight font-display">
              The AI landed-cost engine for
              <span className="block text-emerald-600 dark:text-emerald-400">US · UK · EU · Australia</span>
            </h2>
            <p className="mt-4 text-muted-foreground text-base md:text-lg max-w-2xl mx-auto">
              Upload a Purchase Order and the LCIE agent auto-determines HS codes (HTS / UK Global Tariff / EU TARIC / Australian Tariff) and the full regulation stack — Section 301 / 9903.xx.xx, MPF, HMF, VAT/GST, Import Processing Charge — for the final destined country, in destination currency via live ECB FX.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {[{ icon: Brain, label: 'AI HS classification' }, { icon: Globe2, label: '4 regions, live FX' }, { icon: FileCheck, label: 'CBP entry validation' }, { icon: ShieldCheck, label: 'Auditable waterfall' }].map((f) => (
                <Badge key={f.label} variant="outline" className="gap-1.5 py-1.5 px-3 rounded-full border-emerald-200/60 dark:border-emerald-900/40"><f.icon className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> {f.label}</Badge>
              ))}
            </div>
          </motion.div>
        </section>

        {/* pricing */}
        <section className="container mx-auto px-4 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
            {TIERS.map((t) => (
              <Card key={t.name} className={`relative overflow-hidden ${t.highlight ? 'border-emerald-500 shadow-lg ring-2 ring-emerald-500/30' : 'border-emerald-200/60 dark:border-emerald-900/40'}`}>
                {t.highlight && <div className="absolute top-0 left-0 right-0 bg-emerald-600 text-white text-center text-[11px] font-semibold py-1">MOST POPULAR</div>}
                <CardHeader className={`${t.highlight ? 'pt-8' : ''} text-center`}>
                  <CardTitle className="text-lg">{t.name}</CardTitle>
                  <p className="text-3xl font-bold font-display">{t.price}<span className="text-base font-normal text-muted-foreground">{t.per}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">{t.blurb}</p>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 text-sm">
                    {t.features.map((f) => (
                      <li key={f} className="flex items-start gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" /> <span>{f}</span></li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {t.action === 'free' ? (
                    <Button className="w-full gap-1.5" variant={t.highlight ? 'default' : 'outline'} onClick={handleFree} disabled={busy !== null}>
                      {busy === 'free' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {t.cta}
                    </Button>
                  ) : t.action === 'payoneer' ? (
                    <a href={PAYONEER_PAY} target="_blank" rel="noopener noreferrer" className="w-full">
                      <Button className="w-full gap-1.5" variant="outline">
                        <Wallet className="h-4 w-4" /> {t.cta}
                      </Button>
                    </a>
                  ) : (
                    <a href={LEMON_CHECKOUT} target="_blank" rel="noopener noreferrer" className="w-full">
                      <Button className={`w-full gap-1.5 ${t.highlight ? '' : 'variant-outline'}`} variant={t.highlight ? 'default' : 'outline'}>
                        <Lock className="h-4 w-4" /> {t.cta}
                      </Button>
                    </a>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        {/* license-key entry */}
        <section className="container mx-auto px-4 pb-16 max-w-lg">
          <Card className="border-emerald-200/60 dark:border-emerald-900/40">
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><KeyRound className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Already subscribed? Enter your license key</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="lk" className="text-xs">License key (emailed by Lemon Squeezy after checkout)</Label>
                <Input id="lk" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} placeholder="GP4-PRO-XXXXXXXX" className="font-mono mt-1" />
              </div>
              <Button className="w-full gap-1.5" onClick={handleVerify} disabled={busy !== null}>
                {busy === 'verify' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Unlock the engine
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">No card stored here — Lemon Squeezy handles payment + issues the key. Pakistan-friendly payouts via Payoneer.</p>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="mt-auto border-t border-emerald-200/50 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20">
        <div className="container mx-auto px-4 py-5 text-center text-xs text-muted-foreground">
          <div className="flex items-center justify-center gap-2 mb-1"><Gp4Logo size={28} /><span className="font-semibold">{BRAND_FULL}</span></div>
          <p>LCIE Landed Cost Engine · HS classification + duty stack for US / UK / EU / AU · © 2026 {BRAND}</p>
          <p className="mt-1 text-[10px]">Modelled estimates · MFN/Column 1 rates · Section 301 / IEEPA subject to executive action · FX = ECB reference rates</p>
        </div>
      </footer>
    </div>
  );
}
