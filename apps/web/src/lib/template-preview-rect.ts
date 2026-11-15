export function overlayRect(rect: { left: number; top: number; width: number; height: number }, scale: number, offset: { left: number; top: number }) {
  return { left: offset.left + rect.left * scale, top: offset.top + rect.top * scale, width: rect.width * scale, height: rect.height * scale };
}
