/**
 * Phase 2C: Pure validation rules for SignatureRegion placement and participant binding.
 *
 * These helpers run on both the teacher region-designer UI (to gate drag-end / publish) and
 * the publish Edge Function (to gate the publish request). They are intentionally framework
 * free so they can be reused without DOM or pdf.js dependencies.
 */

import type {
  PdfRegionRect,
  SignatureParticipant,
  SignatureRegion,
} from '@domain/entities/SignatureRequest';

export interface ViewportPx {
  readonly widthPx: number;
  readonly heightPx: number;
}

export interface PageSize {
  readonly widthPx: number;
  readonly heightPx: number;
}

export type ParticipantRegionMatch =
  | { readonly status: 'ok' }
  | { readonly status: 'too-many-regions'; readonly excess: number }
  | { readonly status: 'too-few-regions'; readonly shortfall: number };

/**
 * Returns true when every coordinate of `rect` is inside the unit square (the normalized
 * coordinate system used by SignatureRegion). The unit square represents the full PDF page;
 * `x + w` and `y + h` must remain ≤ 1 so the rectangle does not bleed off the page.
 */
export function isWithinPageBounds(rect: PdfRegionRect): boolean {
  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) return false;
  if (!Number.isFinite(rect.w) || !Number.isFinite(rect.h)) return false;
  if (rect.x < 0 || rect.y < 0) return false;
  if (rect.w <= 0 || rect.h <= 0) return false;
  if (rect.x + rect.w > 1 + EPSILON) return false;
  if (rect.y + rect.h > 1 + EPSILON) return false;
  return true;
}

const EPSILON = 1e-6;

const MIN_RECT_WIDTH_PX = 50;
const MIN_RECT_HEIGHT_PX = 20;

/**
 * Returns true when the on-screen rendering of `rect` (in the supplied viewport) is at least
 * 50×20 px. Below that, handwritten signatures become unreadable and the canvas captures lose
 * the strokes' visual hierarchy. Phase 2C uses screen pixels (not PDF points) because the
 * region designer runs in a browser viewport that may be zoomed.
 */
export function meetsMinimumSize(rect: PdfRegionRect, viewport: ViewportPx): boolean {
  if (!Number.isFinite(viewport.widthPx) || !Number.isFinite(viewport.heightPx)) return false;
  if (viewport.widthPx <= 0 || viewport.heightPx <= 0) return false;
  const widthPx = rect.w * viewport.widthPx;
  const heightPx = rect.h * viewport.heightPx;
  return widthPx >= MIN_RECT_WIDTH_PX && heightPx >= MIN_RECT_HEIGHT_PX;
}

/**
 * Compares the number of participants with the number of *region-bound* slots and returns a
 * machine-readable mismatch state. The teacher UI uses this to gate the publish action; the
 * publish Edge Function re-runs it server-side to refuse stale clients.
 *
 * Phase 2C only treats `participantId` as the binding key. Multiple regions for the same
 * participant (e.g., student + parent signature on a single absence form) count once.
 */
export function checkParticipantRegionMatch(
  participants: readonly SignatureParticipant[],
  regions: readonly SignatureRegion[],
): ParticipantRegionMatch {
  const participantIds = new Set(participants.map((p) => p.id));
  const boundParticipantIds = new Set<string>();
  for (const region of regions) {
    if (participantIds.has(region.participantId)) {
      boundParticipantIds.add(region.participantId);
    }
  }
  const need = participantIds.size;
  const have = boundParticipantIds.size;
  if (have === need) return { status: 'ok' };
  if (have < need) return { status: 'too-few-regions', shortfall: need - have };
  return { status: 'too-many-regions', excess: have - need };
}

/**
 * Returns true when the multi-page PDF mixes portrait and landscape pages. Pattern 2 auto-
 * replicate assumes uniform page geometry within the row span; mixed orientations would shift
 * the absolute pixel coordinates of replicated rectangles unpredictably. Per the deep-interview
 * decision (R7 + iter 2 patch 7), this is a *warning*, not a rejection — the teacher confirms
 * before continuing.
 */
export function isMixedOrientationWarn(pages: readonly PageSize[]): boolean {
  if (pages.length < 2) return false;
  let hasPortrait = false;
  let hasLandscape = false;
  for (const page of pages) {
    if (!Number.isFinite(page.widthPx) || !Number.isFinite(page.heightPx)) continue;
    if (page.widthPx <= 0 || page.heightPx <= 0) continue;
    if (page.heightPx > page.widthPx) hasPortrait = true;
    else if (page.widthPx > page.heightPx) hasLandscape = true;
    if (hasPortrait && hasLandscape) return true;
  }
  return false;
}
