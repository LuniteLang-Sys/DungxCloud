import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatBytes } from '@/lib/utils';
import { SettingsClient } from './settings-client';
import { 
  AlertCircle, 
  Cpu, 
  Sliders, 
  CheckCircle, 
  HelpCircle, 
  Palette, 
  Bell, 
  ShieldCheck, 
  Zap,
  Globe,
  Database
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const chunkSize = Number(process.env.CHUNK_SIZE) || 1024 * 1024 * 1024; // 1GB default
  
  const envStatus = {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Connected' : 'Missing',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Configured' : 'Missing',
    googleId: process.env.GOOGLE_CLIENT_ID ? 'Configured' : 'Missing',
    googleSecret: process.env.GOOGLE_CLIENT_SECRET ? 'Configured' : 'Missing',
    adminPassword: process.env.ADMIN_PASSWORD ? 'Configured' : 'Missing',
    jwtSecret: process.env.JWT_SECRET ? 'Configured' : 'Missing',
  };

  const allConfigured = Object.values(envStatus).every(status => status === 'Connected' || status === 'Configured');

  return (
    <div className="space-y-8 max-w-5xl mx-auto font-sans antialiased pb-12">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-heading font-black tracking-tight text-black" style={{ letterSpacing: '-0.8px' }}>
            System Settings
          </h1>
          <p className="text-[#5a5a5a] mt-1 text-sm font-heading font-bold">
            Configure your decentralized storage pool, manage credentials, and personalize your experience.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-brand-lavender/30 border-2 border-black rounded-xl text-[10px] font-heading font-black uppercase tracking-wider shadow-[2px_2px_0px_#000000]">
          <Zap className="w-3.5 h-3.5" />
          Version 2.4.0-Stable
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Environment Status Card */}
        <Card className="bg-surface-card border-2 border-black rounded-2xl overflow-hidden shadow-[6px_6px_0px_#000000]">
          <CardHeader className="bg-surface-soft border-b-2 border-black py-5 flex flex-row items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
                <Cpu className="w-5 h-5 text-black" />
              </div>
              <div>
                <CardTitle className="text-black text-base font-heading font-black">Backend Integrity</CardTitle>
                <CardDescription className="text-[#5a5a5a] text-xs mt-0.5 font-heading font-bold">Service connections and environment health.</CardDescription>
              </div>
            </div>
            
            {allConfigured ? (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-heading font-black bg-brand-mint text-black border-2 border-black shadow-[2px_2px_0px_#000000] uppercase tracking-wider">
                <CheckCircle className="w-3.5 h-3.5" /> Healthy
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-heading font-black bg-brand-pink text-white border-2 border-black shadow-[2px_2px_0px_#000000] uppercase tracking-wider animate-pulse">
                <AlertCircle className="w-3.5 h-3.5" /> Warning
              </span>
            )}
          </CardHeader>
          <CardContent className="p-6 bg-canvas/40">
            <div className="divide-y-2 divide-black/5">
              <div className="py-3.5 flex justify-between items-center text-sm">
                <span className="text-black font-heading font-black">Supabase DB Link</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-heading font-black border-2 border-black shadow-[2px_2px_0px_#000000] uppercase tracking-wider ${
                  envStatus.supabaseUrl === 'Connected' 
                    ? 'bg-brand-mint text-black' 
                    : 'bg-brand-pink text-white'
                }`}>
                  {envStatus.supabaseUrl === 'Connected' ? 'Active' : 'Missing'}
                </span>
              </div>
              
              <div className="py-3.5 flex justify-between items-center text-sm">
                <span className="text-black font-heading font-black">Service Role Key</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-heading font-black border-2 border-black shadow-[2px_2px_0px_#000000] uppercase tracking-wider ${
                  envStatus.supabaseKey === 'Configured' 
                    ? 'bg-brand-mint text-black' 
                    : 'bg-brand-pink text-white'
                }`}>
                  {envStatus.supabaseKey === 'Configured' ? 'Active' : 'Missing'}
                </span>
              </div>

              <div className="py-3.5 flex justify-between items-center text-sm">
                <span className="text-black font-heading font-black">Google OAuth Client</span>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-heading font-black border-2 border-black shadow-[2px_2px_0px_#000000] uppercase tracking-wider ${
                  envStatus.googleId === 'Configured' && envStatus.googleSecret === 'Configured'
                    ? 'bg-brand-mint text-black' 
                    : 'bg-brand-pink text-white'
                }`}>
                  {envStatus.googleId === 'Configured' ? 'Active' : 'Missing'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Storage Configuration Card */}
        <Card className="bg-surface-card border-2 border-black rounded-2xl overflow-hidden shadow-[6px_6px_0px_#000000] flex flex-col justify-between">
          <div>
            <CardHeader className="bg-surface-soft border-b-2 border-black py-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
                  <Sliders className="w-5 h-5 text-black" />
                </div>
                <div>
                  <CardTitle className="text-black text-base font-heading font-black">Pool Allocation</CardTitle>
                  <CardDescription className="text-[#5a5a5a] text-xs mt-0.5 font-heading font-bold">Control file splitting and distribution.</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-5 bg-canvas/40">
              <div className="flex justify-between items-center bg-canvas border-2 border-black p-4.5 rounded-xl shadow-[3px_3px_0px_#000000]">
                <span className="text-black text-sm font-heading font-black">Split Threshold</span>
                <span className="font-black text-black text-base font-mono">{formatBytes(chunkSize)}</span>
              </div>
              <div className="bg-surface-soft border-2 border-black p-4.5 rounded-xl flex items-start gap-3 shadow-[3px_3px_0px_rgba(0,0,0,0.06)]">
                <HelpCircle className="w-5 h-5 text-black flex-shrink-0 mt-0.5" />
                <p className="text-xs text-black/85 leading-relaxed font-semibold">
                  Files larger than <span className="text-brand-pink font-extrabold">{formatBytes(chunkSize)}</span> are dynamically split into shards across your Google storage pool.
                </p>
              </div>
            </CardContent>
          </div>
          <div className="p-6 pt-0 bg-canvas/40">
            <SettingsClient />
          </div>
        </Card>

        {/* Personalization Section */}
        <Card className="bg-surface-card border-2 border-black rounded-2xl overflow-hidden shadow-[6px_6px_0px_#000000]">
          <CardHeader className="bg-surface-soft border-b-2 border-black py-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
                <Palette className="w-5 h-5 text-black" />
              </div>
              <div>
                <CardTitle className="text-black text-base font-heading font-black">Personalization</CardTitle>
                <CardDescription className="text-[#5a5a5a] text-xs mt-0.5 font-heading font-bold">Customize your dashboard appearance.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6 bg-canvas/40">
            <div className="space-y-4">
              <label className="block text-xs font-heading font-black uppercase text-[#5a5a5a]">Interface Theme</label>
              <div className="grid grid-cols-3 gap-3">
                {['Neo-Brutal', 'Minimal', 'Modern'].map((t) => (
                  <button 
                    key={t}
                    className={`px-3 py-2 rounded-xl text-xs font-heading font-black border-2 border-black shadow-[2px_2px_0px_#000000] transition-all ${
                      t === 'Neo-Brutal' ? 'bg-brand-peach text-black' : 'bg-white text-[#5a5a5a]'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-between p-4 bg-white border-2 border-black rounded-xl shadow-[3px_3px_0px_#000000]">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5 text-black" />
                <span className="text-sm font-heading font-black">Desktop Notifications</span>
              </div>
              <div className="w-10 h-6 bg-success border-2 border-black rounded-full relative shadow-inner">
                <div className="absolute right-0.5 top-0.5 w-4 h-4 bg-white border-2 border-black rounded-full" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Advanced Pool Control */}
        <Card className="bg-surface-card border-2 border-black rounded-2xl overflow-hidden shadow-[6px_6px_0px_#000000]">
          <CardHeader className="bg-surface-soft border-b-2 border-black py-5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-canvas border-2 border-black text-black shadow-[2px_2px_0px_#000000]">
                <Database className="w-5 h-5 text-black" />
              </div>
              <div>
                <CardTitle className="text-black text-base font-heading font-black">Advanced Pool Control</CardTitle>
                <CardDescription className="text-[#5a5a5a] text-xs mt-0.5 font-heading font-bold">Fine-tune storage engine behavior.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4 bg-canvas/40">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3.5 bg-canvas border-2 border-black rounded-xl hover:bg-surface-soft transition-colors cursor-pointer group shadow-[2px_2px_0px_#000000]">
                <div className="flex items-center gap-3">
                  <Globe className="w-4 h-4 text-[#5a5a5a]" />
                  <span className="text-sm font-heading font-black">Global CDN Caching</span>
                </div>
                <span className="text-[10px] font-heading font-black uppercase text-success">Enabled</span>
              </div>
              <div className="flex items-center justify-between p-3.5 bg-canvas border-2 border-black rounded-xl hover:bg-surface-soft transition-colors cursor-pointer group shadow-[2px_2px_0px_#000000]">
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-[#5a5a5a]" />
                  <span className="text-sm font-heading font-black">Shard Encryption (AES-256)</span>
                </div>
                <span className="text-[10px] font-heading font-black uppercase text-[#5a5a5a]">Disabled</span>
              </div>
            </div>
            
            <p className="text-[10px] text-[#5a5a5a] italic text-center pt-2">
              Advanced changes require a full pool re-synchronization.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
