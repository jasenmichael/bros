export function navRecentsScrollHints(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  epsilon = 1,
) {
  return {
    canScrollUp: scrollTop > 0,
    canScrollDown: scrollTop + clientHeight < scrollHeight - epsilon,
  }
}

export function navRecentsScrollStep(clientHeight: number) {
  return Math.max(48, Math.round(clientHeight * 0.6))
}
