/** Little objects for empty shelf space, drawn as SVG. Purely decorative. */
import type { DecorKind } from '../shelfLayout';

const svg = (vb: string, body: string) => `<svg viewBox="${vb}" preserveAspectRatio="xMidYMax meet" aria-hidden="true">${body}</svg>`;

export const DECOR_SVG: Record<DecorKind, string> = {
  plant: svg(
    '0 0 42 56',
    `<defs><linearGradient id="dp-pot" x1="0" x2="1"><stop offset="0" stop-color="#8e4a2c"/><stop offset=".45" stop-color="#c06b42"/><stop offset="1" stop-color="#7a3d22"/></linearGradient></defs>
     <g fill="#3f7a46"><path d="M21 34C14 26 6 25 3 18c8 0 14 6 18 16z"/><path d="M21 34c4-12 12-18 18-19-2 9-9 14-18 19z" fill="#4f8f52"/><path d="M21 34C19 22 22 10 27 4c3 10-1 21-6 30z" fill="#5a9c5b"/><path d="M21 34C17 25 12 17 13 8c6 6 9 16 8 26z" fill="#356b3c"/></g>
     <path d="M9 34h24l-3 22H12z" fill="url(#dp-pot)"/><rect x="7" y="32" width="28" height="5" rx="1.5" fill="#a85a36"/>`
  ),
  vase: svg(
    '0 0 24 62',
    `<defs><linearGradient id="dv" x1="0" x2="1"><stop offset="0" stop-color="#1f3b5c"/><stop offset=".4" stop-color="#4f79a6"/><stop offset="1" stop-color="#1a314d"/></linearGradient></defs>
     <g stroke="#b59a6a" stroke-width="1" fill="none"><path d="M12 30C11 18 8 8 5 2"/><path d="M12 30c1-12 4-20 8-26"/><path d="M12 30V6"/></g>
     <g fill="#d9b874"><circle cx="5" cy="3" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="12" cy="6" r="2"/></g>
     <path d="M8 28h8c0 4 6 8 6 18 0 9-4 16-10 16S2 55 2 46c0-10 6-14 6-18z" fill="url(#dv)"/>
     <path d="M5 44c3 2 11 2 14 0" stroke="#e8eef5" stroke-width="1.2" fill="none" opacity=".7"/>`
  ),
  stack: svg(
    '0 0 62 30',
    `<rect x="2" y="20" width="56" height="10" rx="1" fill="#2c4a6e"/><rect x="4" y="21.5" width="52" height="1.2" fill="#e8dcc4" opacity=".6"/>
     <rect x="6" y="11" width="50" height="9" rx="1" fill="#7a2e2e"/><rect x="8" y="12.5" width="46" height="1" fill="#f0d79a" opacity=".7"/>
     <rect x="4" y="3" width="46" height="8" rx="1" fill="#2f5a3a"/><rect x="6" y="4.5" width="42" height="1" fill="#f0d79a" opacity=".6"/>
     <rect x="48" y="3" width="2" height="8" fill="#efe6d2"/><rect x="54" y="11" width="2" height="9" fill="#efe6d2"/><rect x="56" y="20" width="2" height="10" fill="#efe6d2"/>`
  ),
  globe: svg(
    '0 0 42 60',
    `<defs><radialGradient id="dg" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#d9c79a"/><stop offset="1" stop-color="#8f7a4a"/></radialGradient></defs>
     <circle cx="21" cy="22" r="16" fill="url(#dg)"/>
     <path d="M12 14c4-2 7 1 6 5s3 6 1 9-6 1-8-2-3-9 1-12zM25 10c3 0 6 3 5 6s-4 2-5 5 2 6-1 8-4-3-4-6 1-13 5-13z" fill="#6b7f4a" opacity=".85"/>
     <path d="M5 22a16 16 0 0 0 32 0" fill="none" stroke="#b88a3d" stroke-width="2"/>
     <path d="M21 4a18 18 0 0 1 0 36" fill="none" stroke="#b88a3d" stroke-width="2"/>
     <path d="M21 40v12M13 58h16l-3-6H16z" fill="#7c5a28" stroke="#7c5a28" stroke-width="2"/>`
  ),
  frame: svg(
    '0 0 40 50',
    `<g transform="rotate(-4 20 50)"><rect x="3" y="4" width="34" height="44" rx="1.5" fill="#b88a3d"/><rect x="6" y="7" width="28" height="38" fill="#f1e6cf"/>
     <rect x="8" y="9" width="24" height="34" fill="#9cc0d6"/><circle cx="25" cy="16" r="3" fill="#f6e3a1"/>
     <path d="M8 43V31c5-5 9-4 13 0s7-3 11 0v12z" fill="#5f8a55"/><path d="M8 43v-6c6-3 12 0 24-2v8z" fill="#4a7043"/></g>`
  ),
  clock: svg(
    '0 0 34 42',
    `<path d="M4 40h26l-2-6H6z" fill="#6b4a1f"/><circle cx="17" cy="19" r="15" fill="#b88a3d"/><circle cx="17" cy="19" r="12" fill="#f5ecd6"/>
     <g stroke="#3a2a14" stroke-width="1.6" stroke-linecap="round"><path d="M17 19V11"/><path d="M17 19l5 3"/></g>
     <g fill="#3a2a14"><circle cx="17" cy="9" r=".9"/><circle cx="27" cy="19" r=".9"/><circle cx="17" cy="29" r=".9"/><circle cx="7" cy="19" r=".9"/></g>`
  ),
  candle: svg(
    '0 0 20 50',
    `<defs><radialGradient id="dc"><stop offset="0" stop-color="#ffd27a" stop-opacity=".9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs>
     <circle cx="10" cy="9" r="9" fill="url(#dc)"/><path d="M10 4c2 3 2 6 0 8-2-2-2-5 0-8z" fill="#ffcf6b"/>
     <rect x="6.5" y="13" width="7" height="25" rx="1" fill="#efe4c8"/><path d="M2 46h16l-2-4H4z" fill="#b88a3d"/><rect x="5" y="38" width="10" height="4" fill="#9c7230"/>`
  )
};
