// stores/audioStore.ts
import { create } from "zustand";

interface AudioStore {
  isMuted: boolean;
  activeVideoId: string | null;
  isFeedActive: boolean;
  toggleMute: () => void;
  setActiveVideoId: (id: string | null) => void;
  setFeedActive: (active: boolean) => void;
}

export const useAudioStore = create<AudioStore>((set) => ({
  isMuted: true,
  activeVideoId: null,
  isFeedActive: true,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setActiveVideoId: (id) => set({ activeVideoId: id }),
  setFeedActive: (active) => set({ isFeedActive: active }),
}));
