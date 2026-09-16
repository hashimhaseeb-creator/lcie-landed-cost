'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LabelList,
} from 'recharts';
import type { RegionCalculation } from '@/lib/lcie/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const CURRENCY_SYMBOL: Record<string, string> = {
  USD: '$',
  GBP: '£',
  EUR: '€',
};

function sym(c: string) {
  return CURRENCY_SYMBOL[c] ?? '';
}

function fmt(n: number, c: string) {
  const s = sym(c);
  return `${s}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

const STACK_COLORS = {
  Subtotal: 'var(--chart-3)',
  Duty: 'var(--chart-1)',
  'Section 301': '#7c3aed',
  IEEPA: '#db2777',
  VAT: 'var(--chart-2)',
  MPF: 'var(--chart-4)',
  HMF: '#a3a3a3',
  Freight: 'var(--muted-foreground)',
  Insurance: 'var(--chart-5)',
  'Other levies': '#f97316',
} as const;

export function DutyCharts({ calculations }: { calculations: RegionCalculation[] }) {
  const stackData = calculations.map((c) => ({
    region: c.region,
    Subtotal: Math.round(c.subtotal),
    Duty: Math.round(c.dutyTotal),
    'Section 301': Math.round(c.section301Total),
    IEEPA: Math.round(c.ieepaTotal),
    VAT: Math.round(c.vatTotal),
    MPF: Math.round(c.mpfTotal),
    HMF: Math.round(c.hmfTotal),
    Freight: Math.round(c.freight),
    Insurance: Math.round(c.insurance),
    'Other levies': Math.round(c.otherLevies),
    total: Math.round(c.totalLandedCost),
    currency: c.currency,
  }));

  const rateData = calculations.map((c) => ({
    region: c.region,
    rate: +(c.effectiveRate * 100).toFixed(2),
    currency: c.currency,
  }));

  const top = calculations.slice().sort((a, b) => b.totalLandedCost - a.totalLandedCost)[0];
  const donutData = top
    ? [
        { name: 'Subtotal (goods)', value: Math.round(top.subtotal), color: 'var(--chart-3)' },
        { name: 'Import duty (MFN)', value: Math.round(top.dutyTotal), color: 'var(--chart-1)' },
        { name: 'Section 301', value: Math.round(top.section301Total), color: '#7c3aed' },
        { name: 'IEEPA reciprocal', value: Math.round(top.ieepaTotal), color: '#db2777' },
        { name: 'VAT', value: Math.round(top.vatTotal), color: 'var(--chart-2)' },
        { name: 'MPF', value: Math.round(top.mpfTotal), color: 'var(--chart-4)' },
        { name: 'HMF', value: Math.round(top.hmfTotal), color: '#a3a3a3' },
        { name: 'Freight', value: Math.round(top.freight), color: 'var(--muted-foreground)' },
        { name: 'Insurance', value: Math.round(top.insurance), color: 'var(--chart-5)' },
        { name: 'Other levies', value: Math.round(top.otherLevies), color: '#f97316' },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card className="border-emerald-200/60 dark:border-emerald-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Landed cost stack by region</CardTitle>
          <CardDescription>How each region&apos;s total landed cost is composed (destination currency).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stackData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="region" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
                <YAxis tickFormatter={(v) => sym(stackData[0]?.currency ?? 'USD') + v} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} width={56} />
                <Tooltip
                  formatter={(v: number, name: string) => [fmt(v, stackData[0]?.currency ?? 'USD'), name]}
                  contentStyle={{ background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {Object.keys(STACK_COLORS).map((k) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={STACK_COLORS[k as keyof typeof STACK_COLORS]} maxBarSize={64} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-emerald-200/60 dark:border-emerald-900/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Effective landed-cost rate</CardTitle>
          <CardDescription>(Total landed cost ÷ FOB subtotal) − 1, per region.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rateData} layout="vertical" margin={{ top: 8, right: 32, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: 'var(--muted-foreground)' }} />
                <YAxis type="category" dataKey="region" tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} width={40} />
                <Tooltip
                  formatter={(v: number) => [`${v}%`, 'Effective rate']}
                  contentStyle={{ background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                />
                <Bar dataKey="rate" fill="var(--chart-1)" radius={[0, 6, 6, 0]} maxBarSize={36}>
                  <LabelList dataKey="rate" position="right" formatter={(v: number) => `${v}%`} style={{ fontSize: 11, fill: 'var(--foreground)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {top && (
        <Card className="border-emerald-200/60 dark:border-emerald-900/40 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {top.flag} {top.label} — landed cost composition ({sym(top.currency)} {Math.round(top.totalLandedCost).toLocaleString()})
            </CardTitle>
            <CardDescription>Highest-touch region. Hover slices for amounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="40%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={1}
                  >
                    {donutData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number, n: string) => [fmt(v, top.currency), n]}
                    contentStyle={{ background: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend layout="vertical" align="right" verticalAlign="middle" wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
