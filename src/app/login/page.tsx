'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Lock, Cloud, KeyRound, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        toast.success('Access granted! Opening dashboard...');
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error('Invalid Master Password');
      }
    } catch (err) {
      toast.error('Connection timed out');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-canvas relative overflow-hidden font-sans antialiased">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="z-10 w-full max-w-[400px] px-4"
      >
        <div className="flex flex-col items-center mb-8 text-center space-y-3">
          {/* Custom playful CSS claymation cloud illustration */}
          <motion.div 
            animate={{ y: [0, -5, 0] }}
            transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut" }}
            className="h-16 w-16 bg-brand-peach border-2 border-black rounded-2xl flex items-center justify-center shadow-[4px_4px_0px_#000000]"
          >
            <Cloud className="w-8 h-8 text-black fill-canvas" />
          </motion.div>
          
          <div className="space-y-1">
            <h1 className="text-3xl font-heading font-black tracking-tight text-black" style={{ letterSpacing: '-0.8px' }}>
              Smart Cloud NAS
            </h1>
            <p className="text-[#5a5a5a] text-[10px] font-heading font-black uppercase tracking-widest">
              Distributed Cloud Pool Storage
            </p>
          </div>
        </div>

        <Card className="bg-surface-card border-2 border-black shadow-[6px_6px_0px_#000000] relative overflow-hidden rounded-2xl">
          <CardHeader className="space-y-1.5 pt-7 pb-5 bg-surface-soft border-b-2 border-black">
            <CardTitle className="text-black text-lg font-heading font-black flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-brand-pink" /> Security Access
            </CardTitle>
            <CardDescription className="text-black/80 text-xs leading-relaxed font-semibold">
              Enter credentials to securely authenticate and access the distributed NAS storage pool.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 pt-5 bg-canvas/20">
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="relative group">
                <Lock className="absolute left-3.5 top-3.5 h-4 w-4 text-[#5a5a5a] group-focus-within:text-black transition-colors" />
                <Input
                  type="password"
                  placeholder="Master password"
                  className="pl-10 pr-4 py-6 bg-canvas border-2 border-black text-black placeholder:text-[#5a5a5a] rounded-xl focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-black hover:bg-canvas/50 transition-all font-mono text-sm shadow-[2px_2px_0px_#000000]"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
              
              <Button 
                type="submit" 
                className="w-full bg-black hover:bg-zinc-800 text-white border-2 border-black py-6 font-heading font-black rounded-xl text-sm shadow-[3px_3px_0px_rgba(0,0,0,0.2)] hover:translate-y-[0.5px] hover:shadow-[2.5px_2.5px_0px_rgba(0,0,0,0.2)] active:translate-y-[1.5px] active:shadow-none cursor-pointer flex items-center justify-center gap-2 transition-all group"
                disabled={loading}
              >
                {loading ? 'Authenticating Access...' : 'Authenticate'}
              </Button>
            </form>
          </CardContent>
        </Card>
        
        <p className="text-center text-[#5a5a5a] text-[10px] mt-8 font-heading font-black tracking-wider flex items-center justify-center gap-1.5 uppercase">
          <ShieldAlert className="w-4 h-4 text-brand-pink" /> Secure Control Node
        </p>
      </motion.div>
    </div>
  );
}
