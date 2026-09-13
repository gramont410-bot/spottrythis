import React from 'react';
import { UserRound } from 'lucide-react';

export default function GuardAvatar({ photo, name, size = 'h-10 w-10', rounded = 'rounded-full' }) {
  if (photo) {
    return (
      <img
        src={photo}
        alt={name || 'Guard'}
        className={`${size} ${rounded} object-cover border border-blue-500/40`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={`${name || 'Guard'} neutral profile`}
      className={`${size} ${rounded} flex shrink-0 items-center justify-center border border-slate-600 bg-slate-700 text-slate-300`}
    >
      <UserRound className="h-1/2 w-1/2" />
    </div>
  );
}
