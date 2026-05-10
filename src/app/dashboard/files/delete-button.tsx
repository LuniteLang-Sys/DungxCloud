'use client';

import { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function DeleteButton({ fileId }: { fileId: string }) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!isConfirming || isDeleting) return;
    const timer = setTimeout(() => {
      setIsConfirming(false);
    }, 4000); // Reset after 4 seconds
    return () => clearTimeout(timer);
  }, [isConfirming, isDeleting]);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault(); // Prevent native form submission
    
    if (!isConfirming) {
      setIsConfirming(true);
      return;
    }

    if (isDeleting) return;

    try {
      setIsDeleting(true);
      const res = await fetch(`/api/files/${fileId}/delete`, {
        method: 'POST',
      });
      
      if (!res.ok) {
        throw new Error('Failed to delete file');
      }
      
      // Instantly refresh the page data (Server Components reload seamlessly)
      router.refresh();
      setIsConfirming(false);
    } catch (error) {
      console.error('Delete error:', error);
      setIsConfirming(false);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDeleting}
      className={`
        border-2 border-black rounded-xl text-xs flex items-center gap-1.5 
        px-3.5 py-2 transition-all font-heading font-black
        ${isDeleting 
          ? 'opacity-70 cursor-wait bg-zinc-200 text-black shadow-none translate-y-[1.5px]' 
          : 'cursor-pointer hover:translate-y-[0.5px] active:translate-y-[1.5px] active:shadow-none'}
        ${isConfirming && !isDeleting
          ? 'bg-rose-600 text-white shadow-[2px_2px_0px_#000000] animate-pulse hover:bg-rose-700' 
          : !isDeleting 
            ? 'bg-brand-pink text-white hover:bg-rose-600 shadow-[2px_2px_0px_rgba(0,0,0,0.15)] hover:shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.15)]' 
            : ''
        }
      `}
    >
      {isDeleting ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin text-black" /> Deleting...
        </>
      ) : isConfirming ? (
        <>
          <AlertTriangle className="w-4 h-4 animate-bounce" /> Confirm Delete?
        </>
      ) : (
        <>
          <Trash2 className="w-4 h-4" /> Delete
        </>
      )}
    </button>
  );
}

