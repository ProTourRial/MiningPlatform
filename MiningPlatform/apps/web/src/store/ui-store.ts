/**
 * MiningPlatform
 * Author: Abia Nugrahanto
 * Copyright (c) 2026 Abia Nugrahanto. All rights reserved.
 */

import { create } from 'zustand';

type UiState = {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarOpen: false,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
}));
