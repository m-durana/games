import type { IntroSlide, IntroImage } from './Intro.svelte';
import bundledOverrides from '../data/intro-images.json';

const BUNDLED: Record<string, string> = bundledOverrides as Record<string, string>;

export type IntroKey =
  | 'aircraftIdentify'
  | 'militaryIdentify'
  | 'atcDecode'
  | 'atcCompose'
  | 'atcCleared'
  | 'atcIntercept'
  | 'radarConflict'
  | 'radarDirect'
  | 'radarVector'
  | 'radarSequence'
  | 'radarResolve'
  | 'radarDepart';

const A320 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/30/Avi%C3%B3n_de_PeninsulyFly.jpg/1280px-Avi%C3%B3n_de_PeninsulyFly.jpg';
const A330 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Turkish_Airlines%2C_Airbus_A330-300_TC-JNL_NRT_%2823708073592%29.jpg/1280px-Turkish_Airlines%2C_Airbus_A330-300_TC-JNL_NRT_%2823708073592%29.jpg';
const A350 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Qatar_Airways_Airbus_A350-941_A7-ALA_15.Jan.2015_First_commercial_service_Doha-Frankfurt_%2816260395846%29.jpg/1280px-Qatar_Airways_Airbus_A350-941_A7-ALA_15.Jan.2015_First_commercial_service_Doha-Frankfurt_%2816260395846%29.jpg';
const A380 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/A6-EDY_A380_Emirates_31_jan_2013_jfk_%288442269364%29_%28cropped%29.jpg/1280px-A6-EDY_A380_Emirates_31_jan_2013_jfk_%288442269364%29_%28cropped%29.jpg';
const A220 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Air_Canada_Airbus_A220-300_C-GROV.jpg/1280px-Air_Canada_Airbus_A220-300_C-GROV.jpg';
const B737NG = 'https://upload.wikimedia.org/wikipedia/commons/c/cb/B737_%284405228676%29.jpg';
const B737MAX = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/32/Alaska_737_Max_9.jpg/1280px-Alaska_737_Max_9.jpg';
const B747 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Air_Force_One_Experience_%2849752931207%29.jpg/1280px-Air_Force_One_Experience_%2849752931207%29.jpg';
const B777 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5b/B777-300er_de_SWISS.jpg/1280px-B777-300er_de_SWISS.jpg';
const B787 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Boeing_787_N1015B_ANA_Airlines_%2827611880663%29_%28cropped%29.jpg/1280px-Boeing_787_N1015B_ANA_Airlines_%2827611880663%29_%28cropped%29.jpg';
const B767 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Boeing_767-322-ER_United_Airlines_AN1864070.jpg/1280px-Boeing_767-322-ER_United_Airlines_AN1864070.jpg';
const ATR72 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/ATR_72-500_Firefly_%28FFM%29_F-WWEJ_-_MSN_934_-_Will_be_9M-FYH_%285408419954%29.jpg/1280px-ATR_72-500_Firefly_%28FFM%29_F-WWEJ_-_MSN_934_-_Will_be_9M-FYH_%285408419954%29.jpg';
const E190 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/KLM_Cityhopper_-_Embraer_190LR_-_AN2571563.jpg/1280px-KLM_Cityhopper_-_Embraer_190LR_-_AN2571563.jpg';
const CRJ = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Ibom_Aircraft_at_Victor_Attah_International_Airport.jpg/1280px-Ibom_Aircraft_at_Victor_Attah_International_Airport.jpg';

const F16 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/A_U.S_Air_Force_F-16_Fighting_Falcon_assigned_to_the_510th_Fighter_Squadron%2C_Aviano_Air_Base%2C_Italy%2C_takes_off_from_RAF_Lakenheath%2C_United_Kingdom%2C_Sept._1%2C_2020.jpg/1280px-thumbnail.jpg';
const F22 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/A-10Cs_%26_F-22s_fly_in_formation_%288737111%29.jpg/1280px-A-10Cs_%26_F-22s_fly_in_formation_%288737111%29.jpg';
const F35 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Dutch_F-35_fighter_at_%C3%84mari_Air_Base_%2820250401gtf1001%29.jpg/1280px-Dutch_F-35_fighter_at_%C3%84mari_Air_Base_%2820250401gtf1001%29.jpg';
const SU27 = 'https://upload.wikimedia.org/wikipedia/commons/3/3f/FLANKERs_in_Formation_by_Richard_J._Terry%2C_1986.jpg';
const B2 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/RAF_F-35B_integration_flying_training_with_USAF_B-2_30092019_-_4.jpg/1280px-RAF_F-35B_integration_flying_training_with_USAF_B-2_30092019_-_4.jpg';
const B52 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Ellsworth_AFB_Main_Gate.jpg/1280px-Ellsworth_AFB_Main_Gate.jpg';
const C130 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/A_Lockheed_C-130G_shown_parked_on_the_ice_pack_with_a_452nd_Air_Mobility_Wing_Lockheed_C-141C_Starlifter_in_the_background_during_a_resupply_mission_to_McMurdo_Station_on_Ross_Islan_-_DPLA_-_2852aa0e25b1efeb1902a1243aa8325e.jpeg/1280px-thumbnail.jpeg';
const AH64 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/AH-64_Apache_%282233201139%29.jpg/1280px-AH-64_Apache_%282233201139%29.jpg';
const MIG29 = 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/%D0%90%D0%B3%D0%B2%D0%BF_%D1%81%D1%82%D1%80%D0%B8%D0%B6%D0%B8_%D0%B1%D0%BE%D1%80%D1%82_%D0%BD%D0%B0_%D1%80%D1%83%D0%BB%D0%B5%D0%B6%D0%BA%D0%B5.jpg/1280px-%D0%90%D0%B3%D0%B2%D0%BF_%D1%81%D1%82%D1%80%D0%B8%D0%B6%D0%B8_%D0%B1%D0%BE%D1%80%D1%82_%D0%BD%D0%B0_%D1%80%D1%83%D0%BB%D0%B5%D0%B6%D0%BA%D0%B5.jpg';

const aircraftIdentify: IntroSlide[] = [
  {
    title: 'Welcome - what you are looking at',
    body: 'Almost every passenger plane you see at an airport was built by one of two companies: <strong>Boeing</strong> (American) or <strong>Airbus</strong> (European). Together they make up the vast majority of airliners flying today. There are a few smaller makers (Embraer from Brazil, ATR from France/Italy, Bombardier from Canada) that build the smaller regional planes, but the giants are Boeing and Airbus. The first thing to learn is how to tell those two apart.',
  },
  {
    title: 'Boeing vs Airbus: the nose',
    body: 'Look at the very front of the plane. <strong>Boeing</strong> noses come to a noticeable <em>point</em>, like a pencil tip. <strong>Airbus</strong> noses are <em>rounded</em>, like the front of a bullet train. Once you have looked at a few examples, this becomes the fastest way to tell them apart from a side photo.',
    images: [
      { id: 'ai-nose-boeing', src: B777, caption: 'Boeing 777 - pointed nose', spec: 'Front 3/4 view of a Boeing (737/747/777/787). Nose must be clearly visible and pointed toward the camera. Cockpit windows visible. Plane on ground or low altitude OK.', poolKind: 'aircraft', pool: ['b737-800', 'b737max8', 'b747-400', 'b777-300er', 'b787-9', 'b757-200', 'b767-300er'] },
      { id: 'ai-nose-airbus', src: A350, caption: 'Airbus A350 - rounded nose', spec: 'Front 3/4 view of an Airbus (A320/A330/A350/A380). Rounded nose must be clearly visible. Cockpit windows visible (the panda-eye black mask is a bonus).', poolKind: 'aircraft', pool: ['a320ceo', 'a321ceo', 'a319', 'a318', 'a330-300', 'a350-900', 'a380', 'a220-300'] },
    ],
  },
  {
    title: 'Boeing vs Airbus: the cockpit windows',
    body: 'The windows the pilots look out of are another giveaway. <strong>Boeing</strong> cockpit windows have hard, angular edges, often with a small pointed window at the bottom. <strong>Airbus</strong> cockpit windows are arranged as four panes that meet at a soft V-shape at the bottom. The A350 even has a black painted band around the windows that looks like sunglasses or "panda eyes" - that mask alone tells you it is an A350.',
    images: [
      { id: 'ai-windows-boeing', src: B777, caption: 'Boeing - angular cockpit, sharp lower edge', spec: 'Close-up or front-quarter view of a Boeing cockpit. Cockpit windows must be the focus - angular edges and lower pointed window visible.', poolKind: 'aircraft', pool: ['b737-800', 'b737max8', 'b747-400', 'b777-300er', 'b787-9', 'b757-200', 'b767-300er'] },
      { id: 'ai-windows-airbus', src: A350, caption: 'Airbus A350 - black "panda eye" window mask', spec: 'Close-up or front-quarter view of an Airbus A350 cockpit, showing the black "panda eye" paint mask around the windows clearly.', poolKind: 'aircraft', pool: ['a350-900', 'a330-300', 'a320ceo', 'a321ceo', 'a380'] },
    ],
  },
  {
    title: 'Narrowbody vs widebody',
    body: 'Now ignore the brand and look at the <em>size</em>. The body of a plane (the tube where the passengers sit) is called the <strong>fuselage</strong>. <strong>Narrowbody</strong> planes have ONE aisle inside - they are smaller, used for short and medium flights. Examples: Boeing 737, Airbus A320. <strong>Widebody</strong> planes have TWO aisles - they are noticeably bigger, used for long international flights. Examples: Boeing 777, Airbus A350. The Airbus <strong>A380</strong> is in a class by itself: it is the only airliner with TWO full passenger decks stacked on top of each other.',
    images: [
      { id: 'ai-narrow', src: A320, caption: 'A320 - narrowbody (1 aisle)', spec: 'Side or 3/4 view of any narrowbody (A320 family or 737). Whole plane in frame so its slimness is obvious.', poolKind: 'aircraft', pool: ['a320ceo', 'a321ceo', 'a319', 'b737-800', 'b737max8', 'a220-300', 'e190', 'b757-200'] },
      { id: 'ai-wide', src: B777, caption: '777 - widebody (2 aisles)', spec: 'Side or 3/4 view of any widebody (777, A350, 787, A330). Whole plane in frame so the wider body is obvious.', poolKind: 'aircraft', pool: ['b777-300er', 'b787-9', 'a330-300', 'a350-900', 'b767-300er', 'a330-900', 'b777-9'] },
      { id: 'ai-double', src: A380, caption: 'A380 - double-decker', spec: 'Side view of an A380, ideally on the ground. Both passenger decks must be clearly visible (full-length windows on top AND bottom).', poolKind: 'aircraft', pool: ['a380'] },
    ],
  },
  {
    title: 'How many engines?',
    body: 'Engines are the round tubes hanging under the wings (or sometimes near the tail). Count them. Almost all modern airliners have <strong>two engines</strong>. The big exceptions are the <strong>Boeing 747</strong> and the <strong>Airbus A380</strong>, which both have <strong>four engines</strong> (two under each wing). Older Airbus A340s also had four engines but you rarely see them anymore. If you see four engines and a partial bump on top of the front of the plane, it is a 747. If you see four engines and a full double-deck, it is an A380.',
    images: [
      { id: 'ai-747-hump', src: B747, caption: '747 - four engines + hump on top of nose', spec: 'Side view of a 747. The partial upper-deck hump on the front of the fuselage must be clearly visible. All four engines visible if possible.', poolKind: 'aircraft', pool: ['b747-400'] },
      { id: 'ai-a380-quad', src: A380, caption: 'A380 - four engines + full double-deck', spec: 'Side view of an A380 showing all four engines clearly under the wings, plus the full-length double deck.', poolKind: 'aircraft', pool: ['a380'] },
    ],
  },
  {
    title: 'A note about winglets',
    body: 'You may read elsewhere that "winglet shape" is a great way to tell aircraft apart. Be careful: <strong>winglets are often retrofitted</strong> after the plane was built. A 737 NG can fly with the original simple curved winglet OR an aftermarket split-feather one (looks just like a 737 MAX winglet) - it depends on the airline. Same shape, two different aircraft. So treat winglets as a hint, not a proof. The reliable tells are <em>structural</em>: nose shape, cockpit window pattern, engine size and placement, fuselage proportions.',
  },
  {
    title: 'The Airbus A320 family up close',
    body: 'The <strong>A320 family</strong> is the most common Airbus narrowbody you will see. The whole family looks the same from a distance, but there are four sizes: A318 (shortest, rare), A319 (short), A320 (medium), A321 (longest). To tell them apart, count the small <strong>overwing exits</strong> - the extra emergency doors above the wing. The <strong>A321</strong> has TWO pairs of overwing exits (one in front of the wing, one behind). The A319 and A320 have only ONE pair. The A220 is a separate, smaller Airbus family with disproportionately big engines hanging below a slim body.',
    images: [
      { id: 'ai-a320', src: A320, caption: 'A320 - one pair of overwing exits', spec: 'Side view of an A320. Overwing emergency exits over the wing should be visible. Whole fuselage in frame.', poolKind: 'aircraft', pool: ['a320ceo', 'a321ceo', 'a319', 'a318'] },
      { id: 'ai-a220', src: A220, caption: 'A220 - slim body, oversized engines', spec: 'Side or 3/4 view of an A220. The disproportionately large engines under a slim fuselage must be the visual focus.', poolKind: 'aircraft', pool: ['a220-300'] },
    ],
  },
  {
    title: 'The Boeing 737 family up close',
    body: 'All Boeing 737s sit very <strong>low</strong> to the ground - so low that the bottom of the engine intake is almost flat (the gap to the ground isn\'t big enough for a perfect circle). That alone separates a 737 from an Airbus A320, which sits noticeably higher. To tell the newest <strong>737 MAX</strong> from the older <strong>737 NG</strong>, look at the engine, not the winglet:<br><br>• <strong>Engine size</strong>: the MAX engine (LEAP-1B) is visibly larger and mounted further forward than the NG engine (CFM56). The cowling on the MAX has a noticeably <em>flat-topped</em> front.<br>• <strong>Engine exhaust</strong>: the MAX has <em>chevrons</em> - sawtooth zig-zag edges - on the back of the engine nacelle. The NG has a smooth circular exhaust. This is the most reliable single tell.<br>• <strong>Tail cone</strong>: MAX has a long, sleek tapered tail cone. NG has a shorter, blunter one.',
    images: [
      { id: 'ai-737ng', src: B737NG, caption: '737 NG - smooth engine exhaust, smaller engine', spec: 'Side or 3/4 view of a 737 NG with the engine clearly visible. The smooth (no chevrons) circular exhaust at the back of the engine should be visible if possible. Avoid retrofitted aircraft if the focus is the rear of the engine.', poolKind: 'aircraft', pool: ['b737-800', 'b737-700', 'b737-900er'] },
      { id: 'ai-737max', src: B737MAX, caption: '737 MAX - chevron exhaust, larger engine, flat-top cowling', spec: 'Side or 3/4 view of a 737 MAX. The CHEVRONS (sawtooth zig-zag edges) on the back of the engine nacelle should be clearly visible. The flat-topped front of the engine cowling is a bonus.', poolKind: 'aircraft', pool: ['b737max8'] },
    ],
  },
  {
    title: 'Airbus widebodies up close',
    body: '<strong>A330</strong>: a twin-aisle Airbus with two engines, very common on transatlantic flights. Looks like a smaller, less-modern A350. The fuselage cross-section is round and slightly more upright than the A350\'s squarer shape.<br><br><strong>A350</strong>: the unmistakable Airbus widebody. The signature is the dark <em>"panda eye"</em> paint mask around the cockpit windows, which no other Airbus has. The wing curves smoothly upward at the tip with no separate winglet.<br><br><strong>A380</strong>: full-length double-decker, four engines. Impossible to confuse with anything else.',
    images: [
      { id: 'ai-a330', src: A330, caption: 'A330 - twin-engine Airbus widebody', spec: 'Side or 3/4 view of an A330. Whole plane in frame. The Airbus rounded nose and twin engines should be clearly visible. Tail and fuselage proportions matter more than the wingtip.', poolKind: 'aircraft', pool: ['a330-300', 'a330-200', 'a330-900'] },
      { id: 'ai-a350', src: A350, caption: 'A350 - "panda eye" cockpit mask is unmistakable', spec: 'Front or front-quarter view of an A350 with the dark "panda eye" paint mask around the cockpit windows clearly visible. That mask alone is the giveaway.', poolKind: 'aircraft', pool: ['a350-900', 'a350-1000'] },
      { id: 'ai-a380', src: A380, caption: 'A380 - double deck, 4 engines', spec: 'Side view of an A380, full plane visible, all four engines and both decks clearly shown.', poolKind: 'aircraft', pool: ['a380'] },
    ],
  },
  {
    title: 'Boeing widebodies up close',
    body: '<strong>747</strong>: the iconic "Jumbo Jet". Four engines and a partial hump on top of the front of the fuselage (because the upper deck is short, only at the front).<br><br><strong>767</strong>: an older, smaller twin widebody. Plain look, twin engines.<br><br><strong>777</strong>: large twin-engine widebody. The dead giveaway is its <em>six-wheel main landing gear bogies</em> - three pairs of wheels on each side, where every other airliner has just two pairs (four wheels). On the ground or just after takeoff it\'s unmistakable.<br><br><strong>787 Dreamliner</strong>: a newer twin made mostly of carbon fiber. The wings <em>flex visibly upward</em> in flight. The cockpit window has a sleek four-pane shape with no eyebrow windows above.',
    images: [
      { id: 'ai-747', src: B747, caption: '747 - hump on front of fuselage', spec: 'Side view of a 747 in flight or on ground. Distinctive hump on the front of the fuselage must be clearly visible.', poolKind: 'aircraft', pool: ['b747-400'] },
      { id: 'ai-767', src: B767, caption: '767 - older twin widebody', spec: 'Side or 3/4 view of a 767. Whole plane visible, twin engines obvious.', poolKind: 'aircraft', pool: ['b767-300er'] },
      { id: 'ai-777', src: B777, caption: '777 - six-wheel main gear is the giveaway', spec: 'Side or 3/4 view of a 777, ideally on the ground or shortly after takeoff with the landing gear still down. The SIX-WHEEL main gear bogies (three pairs of wheels per side) must be clearly visible - that\'s the unique 777 tell.', poolKind: 'aircraft', pool: ['b777-300er', 'b777-200er', 'b777-9'] },
      { id: 'ai-787', src: B787, caption: '787 - flexing carbon-fiber wings', spec: 'A 787 in flight, ideally with wings flexed visibly upward against the sky.', poolKind: 'aircraft', pool: ['b787-9'] },
    ],
  },
  {
    title: 'Smaller and propeller planes',
    body: 'On shorter regional routes you may see different-looking planes:<br><br><strong>Embraer E170/E190</strong> (from Brazil): looks like a small jet, four overwing exits, smaller than an A320.<br><br><strong>CRJ (Canadair Regional Jet)</strong>: very small, sits very low, engines mounted on the rear of the fuselage instead of under the wings.<br><br><strong>ATR 72 / Dash 8</strong>: high wing (mounted on top of the fuselage instead of underneath) and propellers instead of jet engines. If you see propellers, it is one of these.',
    images: [
      { id: 'ai-e190', src: E190, caption: 'Embraer E190 - small jet', spec: 'Side or 3/4 view of an Embraer E170/E190. Whole plane visible.', poolKind: 'aircraft', pool: ['e190', 'e170', 'e175', 'e195-e2'] },
      { id: 'ai-crj', src: CRJ, caption: 'CRJ - rear engines, very low', spec: 'Side view of a CRJ regional jet. Engines mounted on the rear of the fuselage (not under wings) must be clearly visible.', poolKind: 'aircraft', pool: ['crj900', 'crj700', 'crj1000', 'crj200'] },
      { id: 'ai-atr', src: ATR72, caption: 'ATR 72 - high wing + propellers', spec: 'Side or 3/4 view of an ATR 72 or Dash 8. Both the high wing (above the fuselage) and propellers must be clearly visible.', poolKind: 'aircraft', pool: ['atr72', 'atr42', 'dash8-q400', 'dash8-300'] },
    ],
  },
  {
    title: 'How to approach the photo',
    body: 'When the round starts, work through these questions in order:<br><br>1. Are there <strong>propellers</strong>? If yes, it is a turboprop (ATR or Dash 8).<br>2. How many <strong>engines</strong>? Two means modern, four means 747 or A380.<br>3. Is it <strong>narrowbody</strong> (small, single-aisle look) or <strong>widebody</strong> (big and tall)?<br>4. Look at the <strong>nose</strong> and cockpit windows: pointed = Boeing, rounded = Airbus.<br>5. Look for <em>structural</em> tells - engine size, fuselage proportions, six-wheel landing gear (777), partial upper-deck hump (747), the panda-eye mask (A350). Avoid relying on winglets alone.<br><br>If you are stuck, the game gives you progressive hints. Don\'t worry - this gets easier with practice.',
  },
];

const militaryIdentify: IntroSlide[] = [
  {
    title: 'Welcome - what you are looking at',
    body: 'Military aircraft come in many shapes because they all have very different jobs. The first step is to figure out the <strong>job</strong> (called the role) - that alone narrows things down a lot. The most common roles are:<br><br>• <strong>Fighter</strong>: small, fast, very maneuverable. Used for air combat.<br>• <strong>Bomber</strong>: large, long range, carries heavy weapons.<br>• <strong>Transport</strong>: cargo plane, moves troops and equipment.<br>• <strong>Helicopter</strong>: rotor blades on top instead of wings.<br>• <strong>Drone (UAV)</strong>: no pilot, no cockpit windows.',
    images: [
      { id: 'mi-fighter', src: F16, caption: 'F-16 - fighter (small, fast)', spec: 'Side or 3/4 view of an F-16 in flight. Whole plane in frame; sleek single-engine fighter shape clearly visible.', poolKind: 'military', pool: ['f16', 'f15c', 'f15e', 'fa18', 'typhoon', 'rafale', 'gripen'] },
      { id: 'mi-bomber', src: B2, caption: 'B-2 - bomber (large, stealth)', spec: 'Top-down or 3/4 view of a B-2 in flight. Pure flying-wing shape (no tail) must be clearly visible.', poolKind: 'military', pool: ['b2', 'b52', 'b1b', 'tu95', 'tu160'] },
      { id: 'mi-transport', src: C130, caption: 'C-130 - transport (high wing, fat body)', spec: 'Side or 3/4 view of a C-130 on ground or in flight. High wing and fat fuselage clearly visible.', poolKind: 'military', pool: ['c130', 'c17', 'a400m'] },
      { id: 'mi-helo', src: AH64, caption: 'AH-64 Apache - helicopter', spec: 'Side or 3/4 view of an AH-64 Apache. Rotor blades on top must be visible.', poolKind: 'military', pool: ['ah64', 'uh60', 'ch47', 'mi24'] },
    ],
  },
  {
    title: 'How fighters are grouped: generations',
    body: 'Fighter jets are loosely sorted by <strong>generation</strong>, like phones. Each generation is more advanced than the last:<br><br>• <strong>4th generation</strong> (1970s to today): jets you have probably heard of - F-16, F-15, F/A-18, Eurofighter, Su-27, MiG-29. They look "normal": clearly visible engines, sharp shapes, weapons hanging visibly under the wings.<br><br>• <strong>5th generation</strong> (newer): designed to be hard for radar to detect. They look strange and faceted, with flat panels instead of curves. Weapons are usually <em>hidden inside</em> the fuselage. Examples: F-22, F-35, China\'s J-20, Russia\'s Su-57.',
    images: [
      { id: 'mi-4gen', src: F16, caption: 'F-16 - 4th gen, single engine', spec: 'F-16 in flight, weapons or pylons visible under wings if possible.', poolKind: 'military', pool: ['f16', 'f15c', 'fa18', 'typhoon', 'rafale', 'gripen', 'mig29', 'su27'] },
      { id: 'mi-f22', src: F22, caption: 'F-22 - 5th gen, twin tail, stealth', spec: 'F-22 in flight or on ground. Twin canted tail fins and faceted stealth shape clearly visible.', poolKind: 'military', pool: ['f22'] },
      { id: 'mi-f35', src: F35, caption: 'F-35 - 5th gen, single engine, chubby', spec: 'F-35 in flight. Single engine and chubbier-than-F22 fuselage clearly visible.', poolKind: 'military', pool: ['f35'] },
    ],
  },
  {
    title: 'Telling F-22 and F-35 apart',
    body: 'Both are American 5th-generation stealth fighters, but they are different sizes and have a different number of engines.<br><br>• <strong>F-22 Raptor</strong>: bigger, <strong>two engines</strong>, twin tail fins angled outward. Pure air-superiority fighter.<br><br>• <strong>F-35 Lightning II</strong>: smaller, <strong>one engine</strong>, chubbier fuselage (because it can carry a lot of fuel and weapons internally). It comes in three versions used by air forces, marines, and navies around the world.',
    images: [
      { id: 'mi-f22-rear', src: F22, caption: 'F-22 - two engines, sleek', spec: 'Rear or 3/4-rear view of an F-22 showing the TWO rectangular engine nozzles clearly.', poolKind: 'military', pool: ['f22'] },
      { id: 'mi-f35-rear', src: F35, caption: 'F-35 - one engine, chubby', spec: 'Rear or 3/4-rear view of an F-35 showing the SINGLE round engine nozzle clearly.', poolKind: 'military', pool: ['f35'] },
    ],
  },
  {
    title: 'Russian / Soviet fighters',
    body: 'Russian fighters often look more dramatic than Western ones because they were designed differently. The most common families:<br><br>• <strong>Sukhoi family (Su-27, Su-30, Su-35)</strong>, nicknamed "Flanker": big twin-engine fighters with the engines mounted far apart and a flat lifting body in between them. Long, sleek silhouette.<br><br>• <strong>MiG-29 "Fulcrum"</strong>: smaller cousin of the Flanker, similar overall shape but more compact.<br><br>If you see a fighter with two engines spaced wide apart and twin tails, it is likely a Flanker.',
    images: [
      { id: 'mi-su27', src: SU27, caption: 'Su-27 Flanker - widely-spaced engines', spec: 'Side or 3/4 view of an Su-27/30/35. Widely-spaced engines with the flat lifting body between them must be clearly visible.', poolKind: 'military', pool: ['su27', 'su30', 'su35'] },
      { id: 'mi-mig29', src: MIG29, caption: 'MiG-29 - smaller Flanker-like shape', spec: 'Side or 3/4 view of a MiG-29. Twin tail and twin engines visible.', poolKind: 'military', pool: ['mig29'] },
    ],
  },
  {
    title: 'Bombers',
    body: 'Bombers are large planes built to carry heavy weapons over long distances. The famous ones look very different from each other:<br><br>• <strong>B-52 Stratofortress</strong>: very old design (1950s, still flying). Eight engines arranged in four pairs, one pair under each wing. Long, slightly drooping fuselage.<br><br>• <strong>B-1 Lancer</strong>: sleek, can sweep its wings back for high-speed flight.<br><br>• <strong>B-2 Spirit</strong>: a "flying wing" with no tail fin and no fuselage to speak of - just a wing shape. Stealth bomber.<br><br>• <strong>Tu-95 "Bear"</strong> (Russian): the only swept-wing bomber that uses propellers (turboprops with two propellers spinning in opposite directions on each engine).',
    images: [
      { id: 'mi-b52', src: B52, caption: 'B-52 - eight engines in four pairs', spec: 'Side view of a B-52 in flight. All eight engines (in four under-wing pairs) must be visible.', poolKind: 'military', pool: ['b52'] },
      { id: 'mi-b2', src: B2, caption: 'B-2 - flying wing, no tail', spec: 'Top-down or front 3/4 view of a B-2. Pure flying-wing shape, no tail, must be unmistakable.', poolKind: 'military', pool: ['b2'] },
    ],
  },
  {
    title: 'Transports and helicopters',
    body: '<strong>Transport planes</strong> usually have a <em>high-mounted wing</em> (wings on top of the fuselage instead of underneath) and a wide, fat body so they can carry trucks and tanks. They almost always have a ramp at the back that opens for loading. The C-130 Hercules is the classic example.<br><br><strong>Helicopters</strong> are obvious from the rotor blades on top. Attack helicopters (like the AH-64 Apache) are slim with weapons on stub-wings. Transport helicopters are big and bulky.',
    images: [
      { id: 'mi-c130', src: C130, caption: 'C-130 - high wing, rear ramp', spec: 'Side or rear view of a C-130. High wing AND rear cargo ramp visible if possible.', poolKind: 'military', pool: ['c130', 'c17', 'a400m'] },
      { id: 'mi-apache', src: AH64, caption: 'AH-64 Apache - attack helo', spec: 'Side or 3/4 view of an AH-64 Apache. Slim attack-helicopter silhouette with stub wings and weapons visible.', poolKind: 'military', pool: ['ah64'] },
    ],
  },
  {
    title: 'How to approach the photo',
    body: 'Work through these in order:<br><br>1. Are there <strong>rotor blades</strong> on top? Helicopter.<br>2. Is the wing on TOP of the fuselage with a fat body? Transport plane.<br>3. Does it look <strong>flat-paneled and faceted</strong> with hidden weapons? 5th-generation stealth fighter (F-22, F-35, J-20).<br>4. Big plane with many engines or a flying-wing shape? Bomber.<br>5. Otherwise it is probably a 4th-generation fighter - count engines, look at the tail, and check the country hint to narrow it down.<br><br>The hints in the game progressively reveal the country, role, and other clues if you need them.',
  },
];

const atcDecode: IntroSlide[] = [
  {
    title: 'What is ATC?',
    body: '<strong>ATC</strong> stands for <em>Air Traffic Control</em> - the people on the ground who tell pilots where to go, what altitude to fly at, and what speed to hold. They communicate by radio in short, standardized phrases so there is no confusion. This game shows you those phrases and asks what they mean.',
  },
  {
    title: 'How a controller transmission is built',
    body: 'A typical instruction has three parts in this order:<br><br>1. <strong>Callsign</strong> - which plane the controller is talking to.<br>2. <strong>Instruction</strong> - what to do (climb, descend, turn).<br>3. <strong>Parameter</strong> - the value (the altitude, heading, or speed).<br><br>Example: <em>"United 28, climb and maintain flight level 350."</em><br><br>Callsign = "United 28" (United Airlines flight 28). Instruction = "climb and maintain". Parameter = "flight level 350".',
  },
  {
    title: 'Altitudes',
    body: 'Altitude in aviation is measured in feet, not meters. There are two ways to say it:<br><br>• Below 18,000 feet (in the US), altitudes are spoken in thousands. <em>"Climb and maintain six thousand"</em> means 6,000 feet.<br>• At or above 18,000 feet, altitudes are called <strong>flight levels</strong>. <em>"FL350"</em> (spoken "flight level three five zero") means 35,000 feet. Just chop off the last two zeroes from the altitude in feet.<br><br>"Maintain" means: stop climbing or descending when you reach that altitude and hold it.',
  },
  {
    title: 'Headings (which direction to fly)',
    body: 'Pilots fly using a <strong>heading</strong> - a number from 000 to 360 that tells them which compass direction to point. Think of a clock face flattened into a circle:<br><br>• 360 (or 000) = north<br>• 090 = east<br>• 180 = south<br>• 270 = west<br><br><em>"Turn right heading 270"</em> means: turn to face west. The numbers are always spoken digit by digit: "two seven zero".',
  },
  {
    title: 'Speed and direct routing',
    body: '<strong>Speed</strong> is given in knots (nautical miles per hour). <em>"Reduce speed to 250"</em> means slow down to 250 knots. Below 10,000 feet there is a legal limit of 250 knots.<br><br><strong>Direct</strong> means "fly straight to this point on the map". Air routes have named points (called <em>fixes</em>) with five-letter codes like ABCDE or BOSOX. <em>"United 28, direct BOSOX"</em> means: skip the rest of the route, fly straight to BOSOX.',
  },
  {
    title: 'Approach and landing words',
    body: 'When a plane is near the airport, special phrases come into play:<br><br>• <strong>"Cleared ILS RWY 27L"</strong> - you are allowed to fly the published instrument approach to runway 27L (the runway pointing roughly 270°, the left one of a parallel pair).<br>• <strong>"Cleared to land"</strong> - actually allowed to touch down. This is different from "cleared approach"!<br>• <strong>"Go around"</strong> - abort the landing, climb back up, try again.<br>• <strong>"Cleared visual approach"</strong> - you have the airport in sight, fly to it visually instead of by instruments.',
  },
  {
    title: 'How the question works',
    body: 'You will see one ATC phrase and several possible meanings. Pick the one that matches both the <strong>instruction</strong> AND the <strong>parameter</strong>. Common traps:<br><br>• "Climb and maintain" vs "climb via SID" (different things).<br>• "Heading 270" vs "turn left/right heading 270" (the second specifies which way to turn).<br>• "Cleared approach" vs "cleared to land" (one lets you fly toward the runway, the other lets you actually land).<br><br>Take your time to read the whole phrase before answering.',
  },
];

const atcCompose: IntroSlide[] = [
  {
    title: 'What is a readback?',
    body: 'When ATC tells a pilot to do something, the pilot must repeat back the important parts to confirm they heard it correctly. This is called a <strong>readback</strong>. If a pilot misheard the altitude, the controller catches it from the readback. This game asks you to build the correct readback by tapping word chips in order.',
  },
  {
    title: 'How to structure a readback',
    body: 'A readback echoes the controller\'s <strong>parameters</strong> (the values), then ends with the plane\'s <strong>callsign</strong>. The order is:<br><br><em>action, value, (more action, more value...), callsign at the end</em><br><br>Example: ATC says <em>"United 28, descend and maintain flight level 240, slow to 280 knots."</em><br>Correct readback: <em>"Descend and maintain FL240, slow to 280, United 28."</em><br><br>Notice how the callsign moves to the end in the readback - that\'s the convention.',
  },
  {
    title: 'What you must read back',
    body: 'You always read back any of these the controller gave you:<br><br>• <strong>Altitude</strong> assignments (e.g. "maintain 6,000")<br>• <strong>Heading</strong> assignments (e.g. "heading 270")<br>• <strong>Speed</strong> restrictions (e.g. "slow to 250")<br>• <strong>Route</strong> changes (e.g. "direct BOSOX")<br>• <strong>Frequency</strong> changes (e.g. "contact tower 118.5")<br>• <strong>Runway</strong> assignments (e.g. "cleared to land 27L")<br><br>The callsign always closes the transmission.',
  },
  {
    title: 'Watch for trap chips',
    body: 'Some chips on the screen are <strong>decoys</strong> - they don\'t belong in the correct readback. Common decoys:<br><br>• A wrong altitude (e.g. FL240 vs FL340)<br>• A wrong heading direction (left vs right)<br>• A different callsign or wrong flight number<br>• Extra phrases the controller never said<br><br>Tap chips in order: instruction → value → (next instruction → next value) → callsign. If a chip doesn\'t match what you heard, leave it.',
  },
];

const atcCleared: IntroSlide[] = [
  {
    title: 'What "direct" means',
    body: 'When ATC says <em>"cleared direct ABCDE"</em>, they are telling the pilot to fly in a straight line from where they are now to a fixed point called ABCDE. This game shows you a map with your plane, the destination point, and asks you to choose the correct heading (compass direction) to fly.',
  },
  {
    title: 'Compass headings: the basics',
    body: 'A heading is a number from 000 to 360 that tells the pilot which way to point the plane. It works like a clock face:<br><br>• <strong>000 (or 360) = north</strong> (12 o\'clock)<br>• <strong>090 = east</strong> (3 o\'clock)<br>• <strong>180 = south</strong> (6 o\'clock)<br>• <strong>270 = west</strong> (9 o\'clock)<br><br>And the values in between: 045 is northeast, 135 is southeast, 225 is southwest, 315 is northwest. To pick the right heading, look at where your plane is and where the point is, then estimate which compass direction connects them.',
  },
  {
    title: 'Reading the map',
    body: 'The map is drawn with <strong>north pointing up</strong>. To estimate a heading:<br><br>1. Find your plane on the map.<br>2. Look at the point you have to fly to (the "fix" - it has a five-letter code).<br>3. Imagine an arrow from your plane to the fix.<br>4. Match that arrow to the compass: straight up = 360, right = 090, down = 180, left = 270, and the angles in between.<br><br>The game gives you several heading options - pick the one that matches the direction of the arrow.',
    scene: 'cleared-bearing',
    sceneCaption: 'You are the blip in the centre. The highlighted fix BOSOX is up and to the right - that\'s about 050°.',
  },
  {
    title: 'The compass on the scope',
    body: 'Here is the same scope with four reference fixes at each cardinal direction. Use this as a mental ruler when judging where a fix is from your plane.',
    scene: 'cleared-clock',
    sceneCaption: 'North = 360 (up), east = 090 (right), south = 180 (down), west = 270 (left).',
  },
  {
    title: 'Wind correction: crabbing',
    body: 'On <strong>medium and hard rounds</strong> the air is moving, so flying the obvious heading no longer works - the wind pushes you off course. The fix is to point the nose slightly INTO the wind so your <em>track over the ground</em> still hits the fix. This is called <em>crabbing</em>.<br><br><strong>The rule:</strong> point the nose toward the side the wind is coming from.<br>• Wind from your LEFT → heading a few degrees LEFT of the bearing.<br>• Wind from your RIGHT → heading a few degrees RIGHT of the bearing.<br><br><strong>Worked example.</strong> The fix bears 030° from you. Wind is 298/31 (from the northwest, ~31 kt) - that\'s a left quartering headwind. To hold a 030° track you point ~10° left, giving heading <strong>020°</strong>. Pick the heading that\'s offset toward the wind, not the one that matches the bearing.<br><br>On easy rounds the wind is calm and you can ignore this entirely.',
    scene: 'cleared-wind',
    sceneCaption: 'The wind tag (top-left of the scope) shows where the wind is FROM. Crab a few degrees TOWARD it.',
  },
];

const atcIntercept: IntroSlide[] = [
  {
    title: 'What is an instrument approach?',
    body: 'When the weather is bad, pilots can\'t see the runway from far away. Instead they follow a radio beam called the <strong>ILS</strong> (Instrument Landing System) that points them straight at the runway and tells them how steep to descend. This game asks you to judge whether a plane on an ILS approach is safe to keep going - or whether it needs to abort and try again.',
  },
  {
    title: 'The two ILS beams',
    body: 'The ILS gives the pilot two pieces of guidance:<br><br>• <strong>Localizer</strong>: a horizontal beam that says "you are left/right of the runway centerline". The pilot intercepts it from the side and follows it straight in.<br><br>• <strong>Glideslope</strong>: a vertical beam that says "you are above/below the correct descent path". A normal glideslope is about 3° steep - that\'s the right speed of descent.<br><br>To land safely the plane must be ON both beams, at the right speed, lined up with the runway.',
    scene: 'intercept-localizer',
    sceneCaption: 'Top-down view: the dashed line is the extended runway centerline (the localizer). The aircraft is intercepting it from the side at about 30°.',
  },
  {
    title: 'The glideslope (side view)',
    body: 'Imagine slicing the airspace vertically along the runway centerline. The correct descent path is a straight line at about <strong>3°</strong>. Above that line = "high", below it = "low". The game asks you to judge which side of this line the plane is on.',
    scene: 'intercept-glideslope-side',
    sceneCaption: 'The green dashed line is the correct 3° glideslope. The orange lines show the high and low cases.',
  },
  {
    title: 'High, low, fast, slow',
    body: 'These are the four common problems:<br><br>• <strong>High</strong>: above the glideslope. The plane is too high to land normally - it would have to dive steeply.<br>• <strong>Low</strong>: below the glideslope. Dangerous - too close to the ground too early. The controller will say "maintain altitude until established".<br>• <strong>Fast</strong>: above the safe approach speed. Flaps cannot be extended at high speeds, so the plane can\'t slow down quickly enough.<br>• <strong>Slow</strong>: below safe approach speed. The plane is at risk of stalling (losing lift). Must add power.',
  },
  {
    title: 'Wind problems',
    body: 'Wind affects whether you can land safely:<br><br>• <strong>Crosswind</strong> (wind from the side): the plane has to crab into the wind to track straight. Each runway has a maximum crosswind limit; over the limit, you can\'t land.<br><br>• <strong>Tailwind</strong> (wind blowing from behind on final approach): bad - groundspeed is too high, and you eat up runway fast. Most airliners limit tailwind on landing to 10 knots. A tailwind on final usually means going around.',
  },
  {
    title: 'What to choose',
    body: 'For each scenario you pick one of three actions:<br><br>• <strong>Continue</strong>: everything is within limits or close enough that the plane will stabilize before landing. Land normally.<br>• <strong>Correct</strong>: one parameter is slightly off and a single fix (slow down, lose altitude) will recover the approach. Adjust and continue.<br>• <strong>Go around</strong>: too many things wrong, or one thing badly wrong. Abort the landing, climb back up, try again. This is always the safe choice when in doubt.<br><br>The game gives you snapshot numbers (altitude, speed, wind, distance to runway) and asks for your call.',
  },
];

// Shared intro slide #1 used by every Radar mode - the "what is a scope" basics.
const radarBasicsScope: IntroSlide = {
  title: 'What is a radar scope?',
  body: 'A <strong>radar scope</strong> is the round screen ATC controllers stare at all day. It shows every aircraft in their airspace as a small <em>blip</em> with a label (the callsign + altitude + speed). Distance is shown by concentric range rings, north is up, and the controller has to keep all those blips safely separated from each other.',
  scene: 'cleared-clock',
  sceneCaption: 'A typical scope. North = up. Range rings show distance from the centre (10, 20 nm).',
};
const radarBasicsBlip: IntroSlide = {
  title: 'Reading a blip',
  body: 'Each aircraft has a small label next to it (the "data block") that shows callsign, altitude in hundreds of feet, and speed in knots. The line projecting from each blip is the <strong>speed vector</strong> - it shows where the aircraft will be in N minutes at current speed. You can toggle the vector length (off / 1 / 2 / 3 min) with the <strong>V</strong> button at the bottom-left of the scope.',
  scene: 'radar-traffic',
  sceneCaption: 'Two aircraft. Each has a callsign tag and a speed vector showing predicted position.',
};

const radarConflict: IntroSlide[] = [
  radarBasicsScope,
  radarBasicsBlip,
  {
    title: 'Crossing tracks at the same level',
    body: 'A <strong>conflict</strong> is when two aircraft will lose separation: less than <strong>5 nm horizontally</strong> AND less than <strong>1,000 ft vertically</strong> at the same instant. Look for blips at similar altitudes whose speed vectors cross.',
    scene: 'radar-traffic',
    sceneCaption: 'AAL123 and DAL456 - both at FL110, vectors crossing in the centre. That\'s the pair.',
  },
  {
    title: 'Read altitudes before you commit',
    body: 'Most blips on the scope are NOT in conflict, even when their tracks look threatening. The data tag\'s third number is the altitude in hundreds of feet. Two aircraft at FL230 and FL060 may have crossing vectors but they\'ll pass with 17,000 ft to spare.',
    scene: 'radar-conflict-altitudes',
    sceneCaption: 'AAL123 ↔ DAL456 are the conflict (both 110). The other three are safe - read the altitudes.',
  },
  {
    title: 'Your job',
    body: 'Tap the <strong>two aircraft</strong> on a collision course. The wrong pair scores zero, so check every aircraft on the scope - the data tag tells you the altitude, the vector tells you the track. Use the <strong>V</strong> button at the bottom-left to extend the speed vectors and see where the tracks meet.',
  },
];

const radarDirect: IntroSlide[] = [
  radarBasicsScope,
  radarBasicsBlip,
  {
    title: 'When the shortcut is clear',
    body: 'Pilots ask ATC to skip a waypoint and fly straight to a later fix to save time and fuel. The radio call sounds like: <em>"BAW42, request direct KELOR."</em> If the proposed track is clear of conflicting traffic, ATC approves.',
    scene: 'radar-direct-clear',
    sceneCaption: 'BAW42 wants direct KELOR (highlighted). Only one other aircraft - DLH9 at FL350 - and it\'s 11,000 ft above. APPROVE.',
  },
  {
    title: 'When the shortcut would conflict',
    body: 'If the shortcut would put the requester on a converging track with another aircraft at the same level, ATC denies (or approves after the conflict clears). The whole point is to spot the blocker before saying yes.',
    scene: 'radar-direct-blocked',
    sceneCaption: 'Same request, but IBE7 is at the same FL on a head-on heading along the proposed track. DENY.',
  },
  {
    title: 'Your job',
    body: 'A pilot calls in - their callsign and the destination fix appear in the radio bubble. Find that callsign on the scope, mentally extend a line to the destination, then check whether any other blip would cross that line at the same altitude. <strong>Approve</strong>, <strong>Approve after [blocker]</strong>, or <strong>Deny</strong>.',
  },
];

const radarVector: IntroSlide[] = [
  radarBasicsScope,
  radarBasicsBlip,
  {
    title: 'The problem: trailer is faster than leader',
    body: 'Two aircraft inbound to the same runway must stay at least <strong>3 nm apart</strong> (radar separation, more for wake). When the trailer is going faster than the leader, the gap closes. Without action, they\'ll be too close at the threshold.',
    scene: 'radar-vector-final',
    sceneCaption: 'SWR321 leads at 5 nm and 160 kt. KLM77 trails at 7 nm but 190 kt - 30 kt closing rate. By the threshold the gap is < 3 nm.',
  },
  {
    title: 'The fix: turn the trailer off centerline',
    body: 'ATC turns the trailer 20-30° off the final approach course for a few minutes. The longer ground track buys spacing without changing speed. When the gap is right, turn it back onto final.',
    scene: 'radar-vector-deflected',
    sceneCaption: 'Same scenario after a 30° right turn. Extra path length = extra spacing.',
  },
  {
    title: 'Your job',
    body: 'You\'ll see the leader and trailer (trailer highlighted yellow). Pick the smallest deflection that opens enough spacing: <strong>No change</strong>, <strong>Left/Right 10°</strong>, <strong>20°</strong>, or <strong>30°</strong>. On Hard a third aircraft blocks one side - you have to use the other.',
  },
];

const radarSequence: IntroSlide[] = [
  radarBasicsScope,
  radarBasicsBlip,
  {
    title: 'Multiple inbounds, one runway',
    body: 'In an arrival push, several aircraft converge on the same runway from different directions. The approach controller decides the landing order. The rule is: <strong>whoever crosses the threshold first lands first</strong>. You read that off the scope - bearings, speeds, and the speed vectors that project where each blip will be in the next minute or two.',
    scene: 'radar-sequence-fan',
    sceneCaption: 'Three inbounds for runway 27. The blip closest to the threshold isn\'t always the one landing first - check the speeds and vectors.',
  },
  {
    title: 'Your job',
    body: 'You\'ll see 3 inbounds (Easy/Medium) or 4 (Hard) on the scope. <strong>Tap the blips on the scope in landing order</strong> - first tap = lands first, etc. There are no strip numbers; the scope is the only data source.<br><br>Use the <strong>V</strong> button at the bottom-left of the scope to extend the speed vectors when you need to project further ahead. Easy starts vectors at 2 min; Hard starts them off. If you mistap, hit <strong>Reset</strong>.',
  },
];

const radarResolve: IntroSlide[] = [
  radarBasicsScope,
  radarBasicsBlip,
  {
    title: 'STCA: pair already flagged',
    body: 'The Short-Term Conflict Alert system has fired on a converging pair: two aircraft predicted to lose 5 nm of lateral separation at the same altitude within ~4 minutes. Both blips are highlighted on the scope. The pair is given - your job is to pick the resolution.',
  },
  {
    title: 'Four resolutions, two axes',
    body: 'You always have the same four options:<br><br>• <strong>Climb leader 2,000 ft</strong> or <strong>Descend trailer 2,000 ft</strong> (vertical)<br>• <strong>Vector leader left 30°</strong> or <strong>Vector trailer right 30°</strong> (lateral)<br><br>Other traffic on the scope can make one or two of these illegal. A third aircraft 1,500 ft above the leader blocks the climb. An aircraft on the leader\'s left-30° projected track blocks the left vector.',
  },
  {
    title: 'Your job',
    body: 'Read the scope: at the conflict pair\'s altitude, who else is around? Tracks crossing? Co-altitude blockers? Pick the option that opens spacing AND stays clear of other traffic.<br><br>Easy outlines the correct option green. Medium has one blocker. Hard has two of the four blocked - you must choose between the two remaining.',
  },
];

const radarDepart: IntroSlide[] = [
  radarBasicsScope,
  radarBasicsBlip,
  {
    title: 'Tower: who goes next?',
    body: 'You\'re tower at a single-runway airport. Two or three aircraft are holding short, ready to depart on different SIDs (different initial headings off the runway). Inbound traffic is on final. You pick which to release first - or hold them all.',
  },
  {
    title: 'The two checks',
    body: '<strong>Check 1: is the next inbound too close?</strong> If the closest inbound is inside ~2 nm, no departure has time to roll, rotate, and clear before the inbound\'s threshold. Hold all.<br><br><strong>Check 2: which initial heading is safest?</strong> Each holding-short blip shows its initial departure heading as a small vector. A heading that diverges sharply from final is safest. A heading that points back at the inbound\'s track is risky when the inbound is close.',
  },
  {
    title: 'Your job',
    body: 'Pick one of the candidates - or "Hold all - inbound too close" when the geometry says wait.<br><br>Easy: 2 candidates, 1 inbound. Medium: 3 candidates, 1 inbound. Hard: 3 candidates, 2 inbounds, "hold all" sometimes correct because the closest inbound is genuinely inside the release minimum.',
  },
];

const SLIDES: Record<IntroKey, IntroSlide[]> = {
  aircraftIdentify,
  militaryIdentify,
  atcDecode,
  atcCompose,
  atcCleared,
  atcIntercept,
  radarConflict,
  radarDirect,
  radarVector,
  radarSequence,
  radarResolve,
  radarDepart,
};

export const INTRO_LABELS: Record<IntroKey, string> = {
  aircraftIdentify: 'Aircraft Identify',
  militaryIdentify: 'Military Identify',
  atcDecode: 'Decode ATC',
  atcCompose: 'Readback Builder',
  atcCleared: 'Cleared Direct',
  atcIntercept: 'Radar Intercepts',
  radarConflict: 'Conflict Spot',
  radarDirect: 'Direct Request',
  radarVector: 'Vectoring',
  radarSequence: 'Sequencing',
  radarResolve: 'Conflict Resolution',
  radarDepart: 'Departure Release',
};

export const ALL_INTRO_KEYS: IntroKey[] = [
  'aircraftIdentify',
  'militaryIdentify',
  'atcDecode',
  'atcCompose',
  'atcCleared',
  'atcIntercept',
  'radarConflict',
  'radarDirect',
  'radarVector',
  'radarSequence',
  'radarResolve',
  'radarDepart',
];

const OVERRIDE_KEY = 'intro-image-overrides';

export function loadIntroOverrides(): Record<string, string> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
  } catch {}
  return {};
}

export function saveIntroOverrides(o: Record<string, string>): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(o));
}

function applyOverrides(slides: IntroSlide[], overrides: Record<string, string>): IntroSlide[] {
  return slides.map((s) => {
    if (!s.images) return s;
    const next: IntroImage[] = s.images.map((img) => {
      if (img.id && overrides[img.id]) return { ...img, src: overrides[img.id] };
      return img;
    });
    return { ...s, images: next };
  });
}

export function getIntro(key: IntroKey): IntroSlide[] {
  // Resolution order: hardcoded src in intros.ts < bundled JSON < localStorage.
  const merged: Record<string, string> = { ...BUNDLED, ...loadIntroOverrides() };
  return applyOverrides(SLIDES[key], merged);
}

export function getRawIntro(key: IntroKey): IntroSlide[] {
  return SLIDES[key];
}

export interface IntroImageSlot {
  introKey: IntroKey;
  slideIndex: number;
  slideTitle: string;
  imageIndex: number;
  id: string;
  defaultSrc: string;
  caption: string;
  spec: string;
  poolKind?: 'aircraft' | 'military';
  pool?: string[];
}

export function listIntroImageSlots(): IntroImageSlot[] {
  const slots: IntroImageSlot[] = [];
  for (const key of ALL_INTRO_KEYS) {
    const slides = SLIDES[key];
    slides.forEach((slide, slideIndex) => {
      if (!slide.images) return;
      slide.images.forEach((img, imageIndex) => {
        if (!img.id) return;
        slots.push({
          introKey: key,
          slideIndex,
          slideTitle: slide.title,
          imageIndex,
          id: img.id,
          defaultSrc: BUNDLED[img.id] ?? img.src,
          caption: img.caption ?? '',
          spec: img.spec ?? '',
          poolKind: img.poolKind,
          pool: img.pool,
        });
      });
    });
  }
  return slots;
}

// Backwards-compat exports for existing App.svelte imports.
export const aircraftIdentifyIntro = aircraftIdentify;
export const militaryIdentifyIntro = militaryIdentify;
export const atcDecodeIntro = atcDecode;
export const atcComposeIntro = atcCompose;
export const atcClearedIntro = atcCleared;
export const atcInterceptIntro = atcIntercept;
export const radarConflictIntro = radarConflict;
export const radarDirectIntro = radarDirect;
export const radarVectorIntro = radarVector;
export const radarSequenceIntro = radarSequence;
export const radarResolveIntro = radarResolve;
export const radarDepartIntro = radarDepart;
