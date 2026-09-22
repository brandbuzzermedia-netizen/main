/**
 * Applications are written from the product range outward — every entry names
 * materials that T3 Media Corp actually stocks, so the page stays factual.
 */

export type Application = {
  name: string;
  slug: string;
  body: string;
  materials: string[];
  plate: string;
};

export const applications: Application[] = [
  {
    name: 'Residential Interiors',
    slug: 'residential-interiors',
    body: 'Homes put every surface under daily use at close range. Gloss has to stay flat, wet areas have to stay dry, and the finishes have to agree with each other across rooms.',
    materials: ['Acrylic Laminates', 'Wallpapers', 'WPC Doors', 'Acrylic Mirror Sheets'],
    plate: 'acrylic-gloss',
  },
  {
    name: 'Commercial Interiors',
    slug: 'commercial-interiors',
    body: 'Offices and workplaces need large areas finished consistently and quickly, with materials that survive cleaning schedules and churn.',
    materials: ['ACP', 'Digital Glass', 'Wallpapers', 'Acrylic / Plexiglass Sheets'],
    plate: 'acp-interior',
  },
  {
    name: 'Kitchens',
    slug: 'kitchens',
    body: 'The one room where the substrate matters as much as the surface. Wipeable backsplashes, gloss shutters and a carcass that tolerates water.',
    materials: ['Acrylic Laminates', 'Digital Glass', 'PVC Ply Sheets'],
    plate: 'digital-glass',
  },
  {
    name: 'Wardrobes',
    slug: 'wardrobes',
    body: 'Full-height shutters magnify every flaw in a finish. Gloss, mirror and interior ACP each solve a different brief on the same opening.',
    materials: ['Acrylic Laminates', 'Acrylic Mirror Sheets', 'ACP', 'PVC Ply Sheets'],
    plate: 'mirror',
  },
  {
    name: 'Ceilings',
    slug: 'ceilings',
    body: 'A ceiling is the largest uninterrupted plane in most rooms. Translucent panels turn it into a light source; ACP keeps it flat and maintenance-free.',
    materials: ['Alabaster Sheets', 'ACP', 'Acrylic / Plexiglass Sheets'],
    plate: 'alabaster-lit',
  },
  {
    name: 'Wall Panels',
    slug: 'wall-panels',
    body: 'Feature walls carry the idea of a scheme. Backlit alabaster, printed glass, mirror and wallpaper each do it in a different register.',
    materials: ['Alabaster Sheets', 'Digital Glass', 'Wallpapers', 'Acrylic Mirror Sheets'],
    plate: 'wallpaper-motif',
  },
  {
    name: 'Partitions',
    slug: 'partitions',
    body: 'Dividing a space without darkening it. Clear and coloured acrylic, printed glass and CNC-cut screens all let light through while defining a boundary.',
    materials: ['Acrylic / Plexiglass Sheets', 'Digital Glass', 'CNC Cutting'],
    plate: 'cnc-screen',
  },
  {
    name: 'Furniture',
    slug: 'furniture',
    body: 'Manufacturers need finish consistency across a batch and components cut to the same tolerance every time — which is what CNC cutting is for.',
    materials: ['Acrylic Laminates', 'PVC Ply Sheets', 'CNC Cutting', 'Acrylic Mirror Sheets'],
    plate: 'cnc',
  },
  {
    name: 'Hospitality',
    slug: 'hospitality',
    body: 'Lobbies, bars and restaurants are judged in photographs before anyone walks in. Backlit alabaster and printed glass do most of that work.',
    materials: ['Alabaster Sheets', 'Digital Glass', 'ACP', 'Acrylic / Plexiglass Sheets'],
    plate: 'alabaster',
  },
  {
    name: 'Retail Spaces',
    slug: 'retail-spaces',
    body: 'Displays change often and fixtures take punishment. Lightweight, shatter-resistant and cut-to-shape beat heavy and fragile every time.',
    materials: ['Acrylic Mirror Sheets', 'Acrylic / Plexiglass Sheets', 'CNC Cutting', 'ACP'],
    plate: 'plexi-colour',
  },
  {
    name: 'Architectural Features',
    slug: 'architectural-features',
    body: 'Facades, fascias, jaalis and screens — the elements that give a building its outline, in materials that hold up outdoors.',
    materials: ['ACP', 'CNC Cutting', 'Acrylic / Plexiglass Sheets'],
    plate: 'acp-facade',
  },
  {
    name: 'Pooja Rooms & Temples',
    slug: 'pooja-rooms',
    body: 'Soft, even, warm light is the whole brief. Translucent alabaster and printed glass are specified here more than anywhere else in the home.',
    materials: ['Alabaster Sheets', 'Digital Glass', 'CNC Cutting'],
    plate: 'alabaster-edge',
  },
];
