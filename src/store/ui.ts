import { create } from 'zustand'
/** Transient UI state shared by the palette, the shortcut sheet and the buttons that open them. Not saved. */
export const useUi = create<{ palette: boolean; help: boolean; openPalette: () => void; closePalette: () => void; toggleHelp: (on?: boolean) => void }>((set) => ({
  palette: false, help: false,
  openPalette: () => set({ palette: true, help: false }), closePalette: () => set({ palette: false }),
  toggleHelp: (on) => set((s) => ({ help: on ?? !s.help, palette: false })),
}))
