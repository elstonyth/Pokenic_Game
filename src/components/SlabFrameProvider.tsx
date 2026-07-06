'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_SLAB_FRAME } from '@/lib/site-settings';

// The admin-configurable slab-frame overlay URL, resolved server-side in the
// root layout and provided app-wide so every SlabImage shares one value
// (context instead of prop-drilling through reveal/vault/profile trees).
const SlabFrameContext = createContext<string>(DEFAULT_SLAB_FRAME);

export function SlabFrameProvider({
  frameUrl,
  children,
}: {
  frameUrl: string;
  children: ReactNode;
}) {
  return (
    <SlabFrameContext.Provider value={frameUrl}>
      {children}
    </SlabFrameContext.Provider>
  );
}

export function useSlabFrame(): string {
  return useContext(SlabFrameContext);
}
