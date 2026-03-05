// stores/audioStore.ts
import { create } from "zustand";

interface AudioStore {
  isMuted: boolean;
  activeVideoId: string | null;
  toggleMute: () => void;
  setActiveVideoId: (id: string | null) => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  isMuted: true,
  activeVideoId: null,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setActiveVideoId: (id) => set({ activeVideoId: id }),
}));