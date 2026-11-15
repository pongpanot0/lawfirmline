import type { TemplateBlock, TemplateLayout } from '@lawfirm/shared';
import { REQUIRED_VAT_BLOCKS } from '@lawfirm/shared';

export function move(layout: TemplateLayout, from: number, to: number): TemplateLayout {
  if (from < 0 || from >= layout.blocks.length || to < 0 || to > layout.blocks.length) return layout;
  const blocks = [...layout.blocks];
  const [block] = blocks.splice(from, 1);
  blocks.splice(Math.min(to, blocks.length), 0, block);
  return { ...layout, blocks };
}
export function insertAt(layout: TemplateLayout, block: TemplateBlock, index: number): TemplateLayout {
  const blocks = [...layout.blocks]; blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, block);
  return { ...layout, blocks };
}
export function setColumn(layout: TemplateLayout, id: string, column: TemplateBlock['column']): TemplateLayout {
  return { ...layout, blocks: layout.blocks.map(b => b.id === id ? { ...b, column } : b) };
}
export function toggleHidden(layout: TemplateLayout, id: string, vatRegistered: boolean): TemplateLayout {
  return { ...layout, blocks: layout.blocks.map(b => b.id === id && !(vatRegistered && REQUIRED_VAT_BLOCKS.includes(b.type)) ? { ...b, hidden: !b.hidden } : b) };
}
