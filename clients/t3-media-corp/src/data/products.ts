/**
 * Product catalogue.
 *
 * Content rule: every factual claim below traces back to T3 Media Corp's
 * existing website. Where the existing site does not publish a figure, the
 * `specifications` entry says so rather than guessing — see `specNote`.
 *
 * To add a product, append an entry here. Routes, the mega-menu, sitemap,
 * JSON-LD and the catalogue page all read from this array.
 */

export type Spec = { label: string; value: string };

export type Product = {
  name: string;
  slug: string;
  category: 'Surfaces' | 'Panels & Boards' | 'Doors & Frames' | 'Glass & Acrylic' | 'Services';
  /** One line for cards and meta descriptions. */
  shortDescription: string;
  /** Positioning statement under the product-page H1. */
  positioning: string;
  /** Two or three paragraphs for the overview section. */
  overview: string[];
  features: { title: string; body: string }[];
  applications: string[];
  specifications: Spec[];
  /** Shown under the spec table when the published data is incomplete. */
  specNote?: string;
  faq: { q: string; a: string }[];
  /** Material plate id — see public/plates/. */
  plate: string;
  gallery: { plate: string; caption: string }[];
  seoTitle: string;
  seoDescription: string;
  featured?: boolean;
};

const ENQUIRE_SPEC_NOTE =
  'Sizes, finishes and pricing are confirmed against your requirement — send your drawing or area schedule and our team will revert with what is in stock.';

export const products: Product[] = [
  {
    name: 'Alabaster Sheets',
    slug: 'alabaster-sheets',
    category: 'Surfaces',
    shortDescription:
      'Translucent decorative sheets that turn a ceiling, counter or temple wall into a light source.',
    positioning:
      'Light passes through it. That single property is why alabaster ends up in the parts of a project people photograph.',
    overview: [
      'Alabaster sheets are translucent decorative panels used where a surface needs to glow rather than simply cover. Backlit, they diffuse light softly and evenly, so a ceiling or counter reads as a warm plane instead of a row of fixtures.',
      'T3 Media Corp stocks more than 100 designs, from near-plain translucents to heavily veined stone patterns, in thicknesses from 2mm to 10mm. Thinner sheets suit curved and backlit detail; heavier gauges hold their own on counters and free-standing panels.',
      'The material is waterproof, which is what makes it workable in pooja rooms, bar counters and washroom feature walls where a paper-faced panel would not last.',
    ],
    features: [
      {
        title: 'Diffused, even light',
        body: 'Backlighting spreads across the sheet instead of hot-spotting, so LED lines behind the panel stay invisible.',
      },
      {
        title: '100+ designs',
        body: 'Stone veining, marbled translucents and plain diffusers — matched to the rest of the scheme rather than chosen from three options.',
      },
      {
        title: '2mm to 10mm',
        body: 'Thin gauges for curved coves and backlit ceilings; heavier gauges for counters and vertical panels.',
      },
      {
        title: 'Waterproof',
        body: 'Usable in wet and semi-wet areas where decorative boards fail.',
      },
    ],
    applications: [
      'Ceilings and coves',
      'Pooja rooms and temples',
      'Bar counters',
      'Hotel lobbies',
      'Reception desks',
      'Backlit wall panels',
      'Light fixtures',
    ],
    specifications: [
      { label: 'Thickness', value: '2mm – 10mm' },
      { label: 'Designs', value: '100+' },
      { label: 'Finish', value: 'Translucent decorative' },
      { label: 'Water resistance', value: 'Waterproof' },
    ],
    specNote: ENQUIRE_SPEC_NOTE,
    faq: [
      {
        q: 'Can alabaster sheets be backlit?',
        a: 'Yes — backlighting is the primary reason the material is specified. The sheet diffuses light evenly, which is why it is used for ceilings, coves, pooja rooms and counters.',
      },
      {
        q: 'What thicknesses are available?',
        a: 'T3 Media Corp stocks alabaster sheets from 2mm to 10mm.',
      },
      {
        q: 'Are alabaster sheets waterproof?',
        a: 'Yes. That is what makes them suitable for bar counters, washroom features and pooja rooms.',
      },
      {
        q: 'How many designs can I choose from?',
        a: 'More than 100 designs are available. Visit the Begur Road showroom in Bommanahalli to see them lit, which is the only honest way to judge a translucent material.',
      },
    ],
    plate: 'alabaster',
    gallery: [
      { plate: 'alabaster', caption: 'Veined translucent sheet, backlit' },
      { plate: 'alabaster-lit', caption: 'Diffused light across a ceiling plane' },
      { plate: 'alabaster-edge', caption: 'Panel edge and thickness detail' },
    ],
    seoTitle:
      'Alabaster Sheets in Bangalore | T3 Media Corp',
    seoDescription:
      'Translucent alabaster sheets in Bangalore. 100+ designs, 2mm to 10mm, waterproof — for backlit ceilings, pooja rooms and bar counters.',
    featured: true,
  },

  {
    name: 'Acrylic Laminates',
    slug: 'acrylic-laminates',
    category: 'Surfaces',
    shortDescription:
      'High-gloss surfacing for cabinetry, with a mirror-flat finish that holds up to daily use.',
    positioning:
      'The finish clients ask for by pointing at a photograph — depth, reflection and no visible grain.',
    overview: [
      'High-gloss acrylic laminates give cabinetry a seamless, reflective face with far more depth than a printed high-gloss foil. The surface reads flat under raking light, which is what separates a considered kitchen from an ordinary one.',
      'T3 Media Corp supplies acrylic laminates made with high-quality raw material and built to last, with customisation options so the design can be matched to the rest of the interior rather than compromised to fit stock.',
    ],
    features: [
      {
        title: 'Mirror-flat gloss',
        body: 'Reflects cleanly without the orange-peel texture cheaper gloss surfaces show under downlights.',
      },
      {
        title: 'Built to last',
        body: 'Made with quality materials and designed to withstand the test of time — specified for surfaces that get opened a dozen times a day.',
      },
      {
        title: 'Matched to your scheme',
        body: 'Customisation options mean the design follows the interior, rather than the interior following the catalogue.',
      },
    ],
    applications: [
      'Kitchen cabinets and shutters',
      'Bedroom wardrobes',
      'Reception desks',
      'Modular furniture',
      'Retail display joinery',
      'Office storage',
    ],
    specifications: [{ label: 'Finish', value: 'High gloss' }],
    specNote: ENQUIRE_SPEC_NOTE,
    faq: [
      {
        q: 'Where are acrylic laminates typically used?',
        a: 'Kitchen cabinets, bedroom wardrobes and reception desks are the most common applications — anywhere a high-gloss, high-traffic surface is wanted.',
      },
      {
        q: 'Can the design be customised?',
        a: 'Yes. T3 Media Corp offers customisation options so you can pick a design that matches the interior.',
      },
    ],
    plate: 'acrylic-gloss',
    gallery: [
      { plate: 'acrylic-gloss', caption: 'High-gloss acrylic face' },
      { plate: 'acrylic-gloss-dark', caption: 'Deep tone under directional light' },
      { plate: 'acrylic-gloss-edge', caption: 'Shutter edge detail' },
    ],
    seoTitle:
      'Acrylic Laminates in Bangalore | T3 Media Corp',
    seoDescription:
      'High-gloss acrylic laminates in Bangalore for kitchen cabinets, wardrobes and reception desks. Customisable designs. Enquire with T3 Media Corp.',
    featured: true,
  },

  {
    name: 'WPC Doors',
    slug: 'wpc-doors',
    category: 'Doors & Frames',
    shortDescription:
      'Wood composite doors that are waterproof and termite proof — built for bathrooms, balconies and wet zones.',
    positioning:
      'A door that does not swell, warp or feed termites. Specified where timber has already failed once.',
    overview: [
      'WPC — wood plastic composite — behaves like timber on site and like plastic in water. Doors and frames cut, drill and fix with ordinary carpentry tools, but they are completely waterproof and termite proof.',
      'That combination makes WPC the default for bathrooms, utility areas, balconies and any opening exposed to weather. T3 Media Corp supplies high-density WPC doors and frames that withstand all kinds of weather conditions and install quickly.',
    ],
    features: [
      {
        title: 'Completely waterproof',
        body: 'No swelling at the bottom rail — the failure that ends most bathroom doors.',
      },
      {
        title: 'Termite proof',
        body: 'Nothing in the composite for termites to feed on.',
      },
      {
        title: 'High density',
        body: 'Holds screws, hinges and hardware the way a solid timber door does.',
      },
      {
        title: 'Easy to cut and install',
        body: 'Worked with standard tools, so site teams need no new skills or special fixings.',
      },
    ],
    applications: [
      'Bathroom and washroom doors',
      'Utility and balcony doors',
      'Residential interiors',
      'Commercial and office interiors',
      'Exterior-facing openings',
    ],
    specifications: [
      { label: 'Material', value: 'High-density wood plastic composite' },
      { label: 'Water resistance', value: 'Completely waterproof' },
      { label: 'Termite resistance', value: 'Termite proof' },
      { label: 'Use', value: 'Indoor and outdoor' },
    ],
    specNote: ENQUIRE_SPEC_NOTE,
    faq: [
      {
        q: 'Are WPC doors suitable for bathrooms?',
        a: 'Yes — being completely waterproof and termite proof is exactly why WPC is specified for bathrooms, utility areas and balconies.',
      },
      {
        q: 'Can WPC doors be used outdoors?',
        a: 'Yes. WPC doors and frames withstand all kinds of weather conditions and are suited to both indoor and outdoor use.',
      },
      {
        q: 'Is installation different from a timber door?',
        a: 'No. WPC is easy to cut and install using standard carpentry tools and fixings.',
      },
    ],
    plate: 'wpc-door',
    gallery: [
      { plate: 'wpc-door', caption: 'WPC door leaf' },
      { plate: 'wpc-frame', caption: 'High-density frame section' },
      { plate: 'wpc-texture', caption: 'Surface and edge detail' },
    ],
    seoTitle:
      'WPC Doors in Bangalore | T3 Media Corp',
    seoDescription:
      'Waterproof, termite-proof WPC doors and frames in Bangalore for bathrooms, balconies and exterior openings. High density and easy to install.',
    featured: true,
  },

  {
    name: 'Acrylic Mirror Sheets',
    slug: 'acrylic-mirror-sheets',
    category: 'Glass & Acrylic',
    shortDescription:
      'A lightweight, shatter-resistant alternative to glass mirror — cut to any size or shape.',
    positioning:
      'Mirror finish without the weight, the breakage risk or the fabrication delay.',
    overview: [
      'Acrylic mirror is a versatile and cost-effective alternative to traditional glass mirror. It is lightweight and shatter-resistant, which changes what is possible: large mirrored ceilings, wardrobe shutters and retail displays become practical where glass would be too heavy or too risky.',
      'Sheets run from 2mm to 5mm and can be cut to the size and shape you need, with a range of colour options — so a mirrored panel can be a shape from a drawing rather than a rectangle from stock.',
    ],
    features: [
      {
        title: 'Shatter-resistant',
        body: 'Safer in circulation areas, kids’ rooms and retail than a glass mirror of the same size.',
      },
      {
        title: 'Lightweight',
        body: 'Easy to handle and install, and viable on surfaces that would not carry glass.',
      },
      {
        title: 'Cut to shape',
        body: 'Supplied in the size and shape required, not just standard rectangles.',
      },
      {
        title: 'Colour options',
        body: 'A range of mirror tints beyond plain silver.',
      },
    ],
    applications: [
      'Wardrobe shutters',
      'Mirrored wall panels and ceilings',
      'Retail displays and signage',
      'Residential interiors',
      'Furniture inlays',
    ],
    specifications: [
      { label: 'Thickness', value: '2mm – 5mm' },
      { label: 'Cutting', value: 'Cut to required size and shape' },
      { label: 'Colours', value: 'Multiple options available' },
      { label: 'Impact', value: 'Shatter-resistant' },
    ],
    specNote: ENQUIRE_SPEC_NOTE,
    faq: [
      {
        q: 'How is acrylic mirror different from glass mirror?',
        a: 'It is lighter, shatter-resistant and more cost-effective, and it can be cut into shapes that would be impractical in glass.',
      },
      {
        q: 'What thicknesses are stocked?',
        a: 'Acrylic mirror sheets are available from 2mm to 5mm.',
      },
      {
        q: 'Can sheets be cut to a custom shape?',
        a: 'Yes — sheets are cut to the desired size and shape, and T3 Media Corp also offers CNC cutting.',
      },
    ],
    plate: 'mirror',
    gallery: [
      { plate: 'mirror', caption: 'Silver acrylic mirror' },
      { plate: 'mirror-tint', caption: 'Tinted mirror option' },
      { plate: 'mirror-cut', caption: 'Cut-to-shape panel' },
    ],
    seoTitle:
      'Acrylic Mirror Sheets in Bangalore | T3 Media Corp',
    seoDescription:
      'Lightweight, shatter-resistant acrylic mirror sheets in Bangalore. 2mm to 5mm, cut to any size or shape, multiple colours. Enquire with T3 Media Corp.',
  },

  {
    name: 'Acrylic / Plexiglass Sheets',
    slug: 'acrylic-plexiglass-sheets',
    category: 'Glass & Acrylic',
    shortDescription:
      'Clear and coloured acrylic sheet for partitions, signage, fixtures and backlit detail.',
    positioning:
      'The workhorse sheet — clear, colourfast, easy to fabricate and far lighter than glass.',
    overview: [
      'Acrylic sheet, also sold as plexiglass, is used wherever a clear or coloured rigid panel is needed without the weight and fragility of glass. It cuts, drills and routs cleanly, which makes it the natural choice for fabricated fixtures and signage.',
      'T3 Media Corp supplies acrylic sheet alongside backlit acrylic for illuminated applications, and can CNC cut panels to your drawing rather than leaving cutting to site.',
    ],
    features: [
      {
        title: 'Lightweight and rigid',
        body: 'Handles and fixes far more easily than glass at the same panel size.',
      },
      {
        title: 'Clean fabrication',
        body: 'Cuts, drills and routs without chipping — and can be CNC cut in-house.',
      },
      {
        title: 'Backlit-ready',
        body: 'Backlit acrylic is available for illuminated signage, counters and feature panels.',
      },
    ],
    applications: [
      'Partitions and screens',
      'Signage and lettering',
      'Backlit panels and counters',
      'Light fixtures and diffusers',
      'Display and retail fixtures',
      'Furniture components',
    ],
    specifications: [],
    specNote:
      'PLACEHOLDER — the existing website does not publish a thickness or sheet-size table for this category. Stocked gauges, sheet sizes and colours are confirmed on enquiry.',
    faq: [
      {
        q: 'Is acrylic the same as plexiglass?',
        a: 'Yes — plexiglass is a common trade name for acrylic sheet. They are the same material.',
      },
      {
        q: 'Can T3 cut acrylic sheet to size?',
        a: 'Yes. CNC cutting is offered in-house, so panels can be supplied finished to your drawing.',
      },
      {
        q: 'Do you stock backlit acrylic?',
        a: 'Yes — backlit acrylic is part of the range for illuminated signage and feature panels.',
      },
    ],
    plate: 'plexi',
    gallery: [
      { plate: 'plexi', caption: 'Clear acrylic sheet' },
      { plate: 'plexi-colour', caption: 'Coloured acrylic' },
      { plate: 'plexi-backlit', caption: 'Backlit acrylic panel' },
    ],
    seoTitle:
      'Acrylic & Plexiglass Sheets Bangalore | T3 Media Corp',
    seoDescription:
      'Acrylic and plexiglass sheets in Bangalore for partitions, signage, backlit panels and fixtures. CNC cutting available from T3 Media Corp.',
  },

  {
    name: 'Digital Glass',
    slug: 'digital-glass',
    category: 'Glass & Acrylic',
    shortDescription:
      'Designer printed glass for backsplashes, table tops, wardrobes and partitions — 100+ designs.',
    positioning:
      'A wipeable, seamless surface that carries a design instead of a joint line.',
    overview: [
      'Digital glass, also called backsplash glass, is designer glass printed with a pattern or image. Behind a hob it gives a single wipeable plane with no grout to discolour; on a wardrobe or partition it carries a graphic that no laminate can match.',
      'T3 Media Corp offers more than 100 designs across the range, covering kitchen backsplashes, temples, table tops, wardrobes and partition glass.',
    ],
    features: [
      {
        title: '100+ designs',
        body: 'A catalogue wide enough to match the scheme rather than settle for the nearest pattern.',
      },
      {
        title: 'Seamless and wipeable',
        body: 'One continuous surface behind the hob — no grout lines to stain.',
      },
      {
        title: 'Multiple applications',
        body: 'The same material works for backsplashes, table tops, wardrobe shutters and partitions.',
      },
    ],
    applications: [
      'Kitchen backsplashes',
      'Temples and pooja units',
      'Table tops',
      'Wardrobe shutters',
      'Partition glass',
    ],
    specifications: [{ label: 'Designs', value: '100+' }],
    specNote: ENQUIRE_SPEC_NOTE,
    faq: [
      {
        q: 'What is digital glass used for?',
        a: 'Kitchen backsplashes, temples, table tops, wardrobes and partition glass are the main applications.',
      },
      {
        q: 'How many designs are available?',
        a: 'More than 100 designs are available to choose from.',
      },
    ],
    plate: 'digital-glass',
    gallery: [
      { plate: 'digital-glass', caption: 'Printed backsplash glass' },
      { plate: 'digital-glass-motif', caption: 'Patterned partition panel' },
      { plate: 'digital-glass-tone', caption: 'Tonal design option' },
    ],
    seoTitle:
      'Digital Glass in Bangalore | T3 Media Corp',
    seoDescription:
      'Digital printed glass in Bangalore for kitchen backsplashes, temples, table tops, wardrobes and partitions. 100+ designs from T3 Media Corp.',
  },

  {
    name: 'Wallpapers',
    slug: 'wallpapers',
    category: 'Surfaces',
    shortDescription:
      'Wall coverings that change a room in a day, without the wet trades.',
    positioning:
      'The fastest way to give a wall a point of view.',
    overview: [
      'Wallpaper remains the quickest route to a finished wall: no curing time, no repainting, and a pattern range that texture paint cannot approach. It suits bedrooms, feature walls, offices and retail fit-outs where the programme is tight.',
      'T3 Media Corp stocks wallpapers alongside the rest of the interior materials range, including eco-friendly options, so a wall finish can be specified at the same time as the joinery surfaces.',
    ],
    features: [
      {
        title: 'Fast to install',
        body: 'A wall is finished in hours, not across a paint-and-cure cycle.',
      },
      {
        title: 'Eco-friendly options',
        body: 'Eco-friendly wallpapers are part of the range.',
      },
      {
        title: 'Specified alongside the rest',
        body: 'Chosen next to the laminates and glass that share the room, not in isolation.',
      },
    ],
    applications: [
      'Bedroom feature walls',
      'Living rooms',
      'Offices and meeting rooms',
      'Retail and hospitality interiors',
      'Reception areas',
    ],
    specifications: [],
    specNote:
      'PLACEHOLDER — the existing website does not publish a roll-size or design-count table for wallpapers. Available collections and sizes are confirmed on enquiry.',
    faq: [
      {
        q: 'Do you stock eco-friendly wallpapers?',
        a: 'Yes — eco-friendly wallpapers are part of the range T3 Media Corp carries.',
      },
      {
        q: 'Can I see the designs before ordering?',
        a: 'Yes. The Begur Road showroom in Bommanahalli is open Monday to Saturday, 10:00 AM to 7:00 PM.',
      },
    ],
    plate: 'wallpaper',
    gallery: [
      { plate: 'wallpaper', caption: 'Textured wall covering' },
      { plate: 'wallpaper-motif', caption: 'Patterned design' },
      { plate: 'wallpaper-plain', caption: 'Tonal plain option' },
    ],
    seoTitle:
      'Wallpapers in Bangalore | T3 Media Corp',
    seoDescription:
      'Wallpapers in Bangalore for homes, offices and retail interiors, including eco-friendly options. Enquire with T3 Media Corp, Bommanahalli.',
  },

  {
    name: 'PVC Ply Sheets',
    slug: 'pvc-ply-sheets',
    category: 'Panels & Boards',
    shortDescription:
      'A board substrate for wet areas, where plywood is the weak point rather than the finish.',
    positioning:
      'The carcass material for kitchens, vanities and utility joinery that sit in water.',
    overview: [
      'PVC ply is used where the finish will outlast the board beneath it. In kitchens, vanity units and utility joinery, it is usually the substrate that fails first — and PVC sheet removes that failure mode.',
      'T3 Media Corp supplies PVC sheets alongside the surfacing range, so the board and its finish can be specified together in one conversation.',
    ],
    features: [
      {
        title: 'Built for wet areas',
        body: 'Specified where kitchen and vanity carcasses sit in daily contact with water.',
      },
      {
        title: 'Takes a finish',
        body: 'Pairs with the acrylic laminates and surfacing supplied from the same counter.',
      },
      {
        title: 'Supplied with the surface',
        body: 'Board and finish sourced together, so compatibility is not left to site.',
      },
    ],
    applications: [
      'Kitchen carcasses',
      'Bathroom vanity units',
      'Utility and service areas',
      'Wardrobe internals',
      'Modular furniture substrates',
    ],
    specifications: [],
    specNote:
      'PLACEHOLDER — the existing website does not publish a thickness, density or sheet-size table for PVC ply. Stocked gauges and sizes are confirmed on enquiry.',
    faq: [
      {
        q: 'Where is PVC ply used instead of plywood?',
        a: 'Mainly in wet and humid areas — kitchen carcasses, bathroom vanities and utility joinery — where the substrate is the part that fails.',
      },
      {
        q: 'What thicknesses do you stock?',
        a: 'Stocked thicknesses and sheet sizes are confirmed on enquiry. Call or send a WhatsApp message with your requirement and the team will revert.',
      },
    ],
    plate: 'pvc-ply',
    gallery: [
      { plate: 'pvc-ply', caption: 'PVC sheet face' },
      { plate: 'pvc-ply-edge', caption: 'Board edge and section' },
      { plate: 'pvc-ply-stack', caption: 'Stacked sheet stock' },
    ],
    seoTitle:
      'PVC Ply Sheets in Bangalore | T3 Media Corp',
    seoDescription:
      'PVC ply sheets in Bangalore for kitchen carcasses, bathroom vanities and utility joinery. Enquire with T3 Media Corp, Begur Road, Bommanahalli.',
  },

  {
    name: 'WPC Vascal Frames',
    slug: 'wpc-vascal-frames',
    category: 'Doors & Frames',
    shortDescription:
      'High-density WPC door frames — waterproof, termite proof and quick to fix on site.',
    positioning:
      'The frame that outlasts the door, in the openings where timber frames rot first.',
    overview: [
      'A door frame sits in the wall for the life of the building, which is why a rotting or termite-eaten frame is a far bigger problem than a failed shutter. WPC vascal frames remove both risks.',
      'These are high-density wood composite frames that are completely waterproof and termite proof, suited to indoor and outdoor use. They withstand all kinds of weather conditions and are easy to cut and install, so site teams fix them exactly as they would timber.',
    ],
    features: [
      {
        title: 'Completely waterproof',
        body: 'No rot at the floor junction, where timber frames go first.',
      },
      {
        title: 'Termite proof',
        body: 'Nothing in the composite for termites to attack.',
      },
      {
        title: 'High density',
        body: 'Holds hinges, strike plates and fixings under daily load.',
      },
      {
        title: 'Weather resistant',
        body: 'Withstands all kinds of weather conditions, indoors or out.',
      },
      {
        title: 'Easy to cut and install',
        body: 'Fixed with standard tools and methods — no retraining, no special fixings.',
      },
    ],
    applications: [
      'Bathroom and washroom frames',
      'Balcony and utility openings',
      'Residential doorsets',
      'Commercial interiors',
      'Exterior-facing openings',
    ],
    specifications: [
      { label: 'Material', value: 'High-density wood plastic composite' },
      { label: 'Water resistance', value: 'Completely waterproof' },
      { label: 'Termite resistance', value: 'Termite proof' },
      { label: 'Use', value: 'Indoor and outdoor' },
      { label: 'Installation', value: 'Easy to cut and install' },
    ],
    specNote: ENQUIRE_SPEC_NOTE,
    faq: [
      {
        q: 'Can WPC frames be used outdoors?',
        a: 'Yes. They withstand all kinds of weather conditions and are suited to both indoor and outdoor openings.',
      },
      {
        q: 'Do WPC frames need special installation?',
        a: 'No — they are easy to cut and install using ordinary carpentry tools.',
      },
    ],
    plate: 'wpc-frame',
    gallery: [
      { plate: 'wpc-frame', caption: 'Frame profile' },
      { plate: 'wpc-texture', caption: 'Composite surface detail' },
      { plate: 'wpc-door', caption: 'Frame with matching WPC door' },
    ],
    seoTitle:
      'WPC Vascal Frames in Bangalore | T3 Media Corp',
    seoDescription:
      'High-density WPC vascal door frames in Bangalore — waterproof, termite proof, weather resistant and easy to install. From T3 Media Corp.',
  },

  {
    name: 'ACP',
    slug: 'acp',
    category: 'Panels & Boards',
    shortDescription:
      'Aluminium composite panels for exterior cladding and interior linings — light, durable, low maintenance.',
    positioning:
      'One panel system that handles a weather-facing facade and an office ceiling with equal ease.',
    overview: [
      'ACP — aluminium composite panel — is a lightweight sheet with a metal face, used both outside and in. Its appeal is consistency: a large area reads as one flat, modern plane, and it stays that way with almost no maintenance.',
      'Exterior ACP is used for weather-resistant architectural applications, where its lightweight construction and range of finishes and colours make large facades practical. Interior ACP is used across offices, home ceilings, wardrobes and other interior spaces.',
      'T3 Media Corp supplies both, so a project can run the same finish language from the elevation through to the reception ceiling.',
    ],
    features: [
      {
        title: 'Lightweight',
        body: 'Large panels without the structural load a solid sheet would impose.',
      },
      {
        title: 'Weather resistant',
        body: 'Exterior grades are made for weather-facing architectural applications.',
      },
      {
        title: 'Multiple finishes and colours',
        body: 'A range wide enough to carry a facade design rather than constrain it.',
      },
      {
        title: 'Durable and low maintenance',
        body: 'Holds its appearance with minimal upkeep across large areas.',
      },
      {
        title: 'Versatile',
        body: 'The same system works for cladding, ceilings, wardrobes and interior linings.',
      },
    ],
    applications: [
      'Exterior facades and cladding',
      'Signage and fascias',
      'Office interiors',
      'Home ceilings',
      'Wardrobes',
      'Interior wall linings',
    ],
    specifications: [
      { label: 'Grades', value: 'Exterior and interior' },
      { label: 'Exterior use', value: 'Weather-resistant architectural applications' },
      { label: 'Construction', value: 'Lightweight' },
      { label: 'Finishes', value: 'Multiple finishes and colours' },
    ],
    specNote: ENQUIRE_SPEC_NOTE,
    faq: [
      {
        q: 'What is the difference between exterior and interior ACP?',
        a: 'Exterior ACP is made for weather-resistant architectural applications such as facades and cladding. Interior ACP is used for offices, home ceilings, wardrobes and other interior spaces.',
      },
      {
        q: 'Is ACP hard to maintain?',
        a: 'No — ease of maintenance is one of the main reasons it is specified over large areas.',
      },
      {
        q: 'What finishes are available?',
        a: 'Multiple finishes and colours are available. Contact the team with your elevation or interior scheme for current options.',
      },
    ],
    plate: 'acp',
    gallery: [
      { plate: 'acp', caption: 'Brushed metal face' },
      { plate: 'acp-facade', caption: 'Exterior cladding panels' },
      { plate: 'acp-interior', caption: 'Interior lining application' },
    ],
    seoTitle:
      'ACP Sheets in Bangalore | T3 Media Corp',
    seoDescription:
      'Exterior and interior ACP in Bangalore for facades, cladding, office interiors, ceilings and wardrobes. Lightweight, durable, multiple finishes.',
  },

  {
    name: 'CNC Cutting',
    slug: 'cnc-cutting',
    category: 'Services',
    shortDescription:
      'Precision cutting that turns sheet stock into finished components, cut to your drawing.',
    positioning:
      'The difference between buying a sheet and receiving a part.',
    overview: [
      'CNC cutting takes the fabrication off site. Panels, jaalis, screens, lettering and shaped components come back cut to the drawing, with repeatable edges across every piece in a run.',
      'Because T3 Media Corp cuts the material it supplies, precision finishing is part of the same order rather than a separate vendor, a separate lead time and a separate conversation about who is responsible for a bad edge.',
    ],
    features: [
      {
        title: 'Cut to your drawing',
        body: 'Supply the file; take delivery of components, not raw sheets.',
      },
      {
        title: 'Repeatable across a run',
        body: 'The hundredth piece matches the first — which matters on a screen or a jaali.',
      },
      {
        title: 'One supplier',
        body: 'Material and cutting from the same counter, so the edge quality is on one invoice.',
      },
    ],
    applications: [
      'Decorative jaalis and screens',
      'Signage and lettering',
      'Shaped acrylic and mirror panels',
      'Furniture components',
      'Partition and ceiling detail',
    ],
    specifications: [],
    specNote:
      'PLACEHOLDER — the existing website does not publish bed sizes, tolerances or accepted file formats. Share your drawing and the team will confirm what can be cut and in which materials.',
    faq: [
      {
        q: 'Which materials can be CNC cut?',
        a: 'Send your drawing along with the material you have in mind and the team will confirm what can be cut. CNC cutting is offered across the sheet materials T3 Media Corp supplies.',
      },
      {
        q: 'Do I need to buy the material from T3?',
        a: 'CNC cutting is offered as part of the material supply, so the cut and the sheet come from the same order. Contact the team to discuss your specific requirement.',
      },
    ],
    plate: 'cnc',
    gallery: [
      { plate: 'cnc', caption: 'CNC-cut jaali pattern' },
      { plate: 'cnc-detail', caption: 'Cut edge detail' },
      { plate: 'cnc-screen', caption: 'Screen component' },
    ],
    seoTitle:
      'CNC Cutting in Bangalore | T3 Media Corp',
    seoDescription:
      'CNC cutting in Bangalore for jaalis, screens, signage and shaped panels, cut to your drawing. Precision finishing from T3 Media Corp.',
  },
];

export const productCategories = [
  'Surfaces',
  'Panels & Boards',
  'Doors & Frames',
  'Glass & Acrylic',
  'Services',
] as const;

export const getProduct = (slug: string) => products.find((p) => p.slug === slug);

export const featuredProducts = products.filter((p) => p.featured);
