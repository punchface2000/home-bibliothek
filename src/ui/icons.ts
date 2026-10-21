/** Inline SVG icons (24×24, stroke = currentColor). */
const s = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"${extra}>${body}</svg>`;

export const I = {
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: s('<path d="M15 5l-7 7 7 7"/>'),
  gear: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  sparkle: s('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>'),
  barcode: s('<path d="M4 6v12M7 6v12M10 6v12M14 6v12M17 6v12M20 6v12"/><path d="M2 4h3M19 4h3M2 20h3M19 20h3" stroke-width="1.4"/>'),
  camera: s('<path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>'),
  quote: s('<path d="M9.5 7C6.5 8 5 10 5 13v4h5v-5H7.5c0-2 .8-3.2 2.6-4zM18.5 7c-3 1-4.5 3-4.5 6v4h5v-5h-2.5c0-2 .8-3.2 2.6-4z"/>'),
  pen: s('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>'),
  more: s('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>', ' stroke-width="2"'),
  sort: s('<path d="M7 4v16M4 17l3 3 3-3M17 20V4M14 7l3-3 3 3"/>'),
  spines: s('<path d="M5 4h3v16H5zM10 6h3v14h-3zM15.5 5.2l2.9-.8 3.6 14.8-2.9.8z"/><path d="M3 20h18"/>'),
  grid: s('<rect x="4" y="4" width="6.5" height="7" rx="1"/><rect x="13.5" y="4" width="6.5" height="7" rx="1"/><rect x="4" y="14" width="6.5" height="7" rx="1"/><rect x="13.5" y="14" width="6.5" height="7" rx="1"/>'),
  star: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z"/></svg>',
  trash: s('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
  external: s('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  user: s('<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4.5-6 8-6s7 2 8 6"/>'),
  download: s('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  upload: s('<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>'),
  check: s('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  copy: s('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>'),
  book: s('<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3"/>'),
  chevron: s('<path d="M9 5l7 7-7 7"/>'),
  edit: s('<path d="M4 20h4L19 9l-4-4L4 16z"/>')
};
