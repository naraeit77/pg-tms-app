'use client';

import { create } from 'zustand';

interface SidebarState {
  isOpen: boolean;
  isCollapsed: boolean;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  toggleCollapse: () => void;
}

export const useSidebarStore = create<SidebarState>((set) => ({
  isOpen: false,       // 모바일 오버레이
  isCollapsed: false,  // 데스크톱 축소 모드
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  setOpen: (open) => set({ isOpen: open }),
  toggleCollapse: () => set((s) => ({ isCollapsed: !s.isCollapsed })),
}));
