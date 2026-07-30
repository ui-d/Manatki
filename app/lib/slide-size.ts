// Re-export from shared so client (app/) and server (actions/) share one source of truth.
export {
  DECK_KIND_VALUES,
  MAX_SLIDE_AREA,
  MAX_SLIDE_DIM,
  MIN_SLIDE_DIM,
  SIZE_PRESETS,
  SIZE_PRESET_VALUES,
  getPresetSize,
  getSlideDims,
  isUniformSize,
  isValidSlideDims,
  type DeckKind,
  type SizePreset,
  type SlideSize,
} from "@shared/slide-size";
