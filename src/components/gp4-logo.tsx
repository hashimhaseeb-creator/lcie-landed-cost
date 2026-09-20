import * as React from 'react';
export function Gp4Logo({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <img src="/gp4-logo.png" alt="Green G(P)4 trademark logo" width={size} height={size}
      className={`rounded-full object-cover ${className ?? ''}`} style={{ width: size, height: size }} />
  );
}
