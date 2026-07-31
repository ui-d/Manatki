/**
 * Localized display helpers for canvas-size presets, shared by every surface
 * that lists them (toolbar size picker, slide-rail adapt menu).
 */
import type { useT } from "@agent-native/core/client/i18n";

import {
  SIZE_PRESETS,
  type SizePreset,
  type SizePresetCategory,
} from "@/lib/slide-size";

export const SIZE_CATEGORY_LABEL_KEYS: Record<SizePresetCategory, string> = {
  posts: "editorToolbar.sizeCategoryPosts",
  vertical: "editorToolbar.sizeCategoryVertical",
  banners: "editorToolbar.sizeCategoryBanners",
  web: "editorToolbar.sizeCategoryWeb",
  ads: "editorToolbar.sizeCategoryAds",
};

/** Localized preset label; falls back to the table's English label when a
 *  newly-added preset has no `editorToolbar.sizePreset.<id>` key yet. */
export function presetLabel(
  t: ReturnType<typeof useT>,
  key: SizePreset,
): string {
  const i18nKey = `editorToolbar.sizePreset.${key}`;
  const translated = t(i18nKey);
  return translated && translated !== i18nKey
    ? translated
    : SIZE_PRESETS[key].label;
}
