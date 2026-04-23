export const MOBILE_LAYOUT_BREAKPOINT = 960;
export const MOBILE_LAYOUT_QUERY = `(max-width: ${MOBILE_LAYOUT_BREAKPOINT}px)`;

export function matchesMobileLayoutViewport() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}
