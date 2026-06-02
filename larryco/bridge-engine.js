/* ===================================================================
   BRIDGE ENGINE — shared by bridge-quiz.html and bridge-quiz-curator.html
   1m-1M Opener's Rebid (Larry Cohen 2/1)

   Exposes globals: SUITS, SUIT_SYMBOLS, SUIT_RANK, RANK_NAMES, HONOR,
   dealHand, suitQuality, computeFeatures, listFlaws, quickTricks,
   shouldOpenOneLevel, preemptScore, preemptRange, openingBid,
   isPlausibleOpening, responderBid, splinterBid, isReverseTarget,
   isJumpShiftTarget, jumpShiftBid, reverseBid, clubsDecentForRebid,
   hasStopper, suitHasRunningTop3, has54MinorsHonorInUnbidMajor,
   isPureFor5422Reverse, RULES, RULES_BY_ID, RULES_SORTED, findMatch,
   AUCTIONS, isInQuizScope, generateForRule, generateForRuleSet,
   generateRandomHand.
   =================================================================== */

const SUITS = ['S', 'H', 'D', 'C'];
const SUIT_SYMBOLS = {S: '\u2660', H: '\u2665', D: '\u2666', C: '\u2663'};
const SUIT_RANK = {C: 1, D: 2, H: 3, S: 4};
const RANK_NAMES = {14:'A', 13:'K', 12:'Q', 11:'J', 10:'T', 9:'9', 8:'8', 7:'7', 6:'6', 5:'5', 4:'4', 3:'3', 2:'2'};
const HONOR = {14:4, 13:3, 12:2, 11:1};

/* ---------- Dealing ---------- */
function dealHand() {
  const deck = [];
  for (const s of SUITS) for (let r = 2; r <= 14; r++) deck.push([s, r]);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const cards = deck.slice(0, 13);
  const hand = {S:[], H:[], D:[], C:[]};
  for (const [s, r] of cards) hand[s].push(r);
  for (const s of SUITS) hand[s].sort((a, b) => b - a);
  return hand;
}

/* ---------- Suit quality ---------- */
function suitQuality(cards) {
  if (cards.length < 5) return null;
  const set = new Set(cards);
  const top3 = [14, 13, 12].filter(r => set.has(r)).length;
  const top5 = [14, 13, 12, 11, 10].filter(r => set.has(r)).length;
  const has9 = set.has(9);
  const has10 = set.has(10);

  // Solid: AKQJ in a 5+ card suit — an extra point beyond "really good".
  if (cards.length >= 5 && set.has(14) && set.has(13) && set.has(12) && set.has(11)) return 'solid';

  // Really good: AKQ in suit, OR 4 of top 5, OR 3 of top 5 + a 9 (the 9 is a
  // separate spot — the 10 already counts as a top-5 honor, not double-duty).
  if (top3 === 3) return 'really_good';
  if (top5 >= 4) return 'really_good';
  if (top5 >= 3 && has9) return 'really_good';

  // Good (5-card): 2 of top 3 + 9 or 10, OR 3 of top 5
  if (cards.length === 5) {
    if (top3 >= 2 && (has9 || has10)) return 'good';
    if (top5 >= 3) return 'good';
    return null;
  }
  // Good (6+ card): 2 of top 3, OR 3 of top 5
  if (top3 >= 2) return 'good';
  if (top5 >= 3) return 'good';
  return null;
}

/* ---------- Features ---------- */
function computeFeatures(hand, opening, response) {
  const m = opening[1];
  const M = response[1];
  const lens = {};
  for (const s of SUITS) lens[s] = hand[s].length;
  let hcp = 0;
  for (const s of SUITS) for (const r of hand[s]) hcp += (HONOR[r] || 0);

  const sortedLens = Object.values(lens).slice().sort((a, b) => b - a);
  const shape = sortedLens.join('');
  const balanced = ['4333', '4432', '5332'].includes(shape);

  const shortness = {};
  for (const s of SUITS) {
    shortness[s] = lens[s] === 0 ? 'void'
                 : lens[s] === 1 ? 'singleton'
                 : lens[s] === 2 ? 'doubleton'
                 : null;
  }

  const quality = {};
  for (const s of SUITS) quality[s] = suitQuality(hand[s]);

  // Total points — adjustments stored as "+/-value (reason)" strings so the
  // breakdown reads as an arithmetic equation in the feedback.
  let tp = hcp;
  const adjustments = [];
  const fmt = (delta, label) => `${delta >= 0 ? '+' : '\u2212'}${Math.abs(delta)} (${label})`;

  // With a fit (4+ support), we switch to support-points methodology: count
  // shortness, not length. Long side suits are less valuable when partner has
  // their own trump suit. Without a fit, length-adjusted points are used.
  const support_len = lens[M];
  const haveFit = support_len >= 4;
  if (!haveFit) {
    for (const s of SUITS) {
      if (lens[s] >= 5 && quality[s]) {
        let base = 0.5;
        if (quality[s] === 'really_good') base = 1;
        else if (quality[s] === 'solid') base = 2;
        const extra = lens[s] - 5;
        const bonus = base + extra;
        tp += bonus;
        adjustments.push(fmt(bonus, `${SUIT_SYMBOLS[s]} ${quality[s].replace('_', ' ')} ${lens[s]}-card`));
      }
    }
  }
  // Shortness bonus when supporting partner's M
  if (haveFit) {
    for (const s of SUITS) {
      if (s === M) continue;
      if (shortness[s] === 'singleton') {
        tp += 2;
        adjustments.push(fmt(2, `${SUIT_SYMBOLS[s]} singleton with fit`));
      } else if (shortness[s] === 'void') {
        tp += 3;
        adjustments.push(fmt(3, `${SUIT_SYMBOLS[s]} void with fit`));
      }
    }
  }
  // Singleton K/Q/J penalty. Singleton J is heavily overvalued by raw HCP
  // (the J alone has almost no trick potential) so it gets a larger penalty
  // than singleton K or Q.
  for (const s of SUITS) {
    if (lens[s] === 1) {
      const card = hand[s][0];
      if (card === 13) { tp -= 0.25; adjustments.push(fmt(-0.25, `${SUIT_SYMBOLS[s]} singleton K`)); }
      else if (card === 12) { tp -= 0.25; adjustments.push(fmt(-0.25, `${SUIT_SYMBOLS[s]} singleton Q`)); }
      else if (card === 11) { tp -= 1.0;  adjustments.push(fmt(-1.0,  `${SUIT_SYMBOLS[s]} singleton J`)); }
    }
  }
  // No 10s or 9s anywhere in the hand
  let hasSpot = false;
  for (const s of SUITS) {
    if (hand[s].some(r => r === 9 || r === 10)) { hasSpot = true; break; }
  }
  if (!hasSpot) {
    tp -= 0.25;
    adjustments.push(fmt(-0.25, 'no 10s or 9s in hand'));
  }

  // Upgrade suppression: cap TP at HCP when hand has 2+ flaws
  const flaws = listFlaws(hand);
  const tpRaw = tp;
  if (flaws.length >= 2 && tp > hcp) {
    tp = hcp;
  }

  return {
    hand, opening, response, m, M,
    lens, hcp, shape, balanced,
    support_len, m_len: lens[m],
    shortness, quality, tp, tpRaw,
    adjustments, flaws,
    // True when responder bid 1NT (1C-1NT, 1D-1NT, 1H-1NT, 1S-1NT). In these
    // auctions the major-response rules (splinter, simple raise, etc.) must
    // not fire — every rule that assumes f.M is a real suit guards on this.
    isNTResponse: M === 'N'
  };
}

/* ---------- Plausibility (was this opening correct?) ---------- */
/* ---------- Opening bid (the single source of truth for what a hand opens) ----------
   Covers standard Cohen 2/1 openings: Pass, 1C, 1D, 1H, 1S, 1NT, 2C, 2NT, weak 2s,
   3-level preempts. Used to filter the 1m-opener pool for this quiz, and will be
   reused for an opening-bid quiz later.

   2C opening:
     - Balanced (incl. 5-4-2-2): 22+ HCP
     - Unbalanced: HCP + length-beyond-4 \u2265 22 (approximation of ~9 playing tricks).
       E.g., 19 HCP + 7-card suit opens 2C; 20 HCP + 6-3-2-2 opens 2C.

   Known simplifications (good enough for v1):
     - Weak 2s and preempts: shape-only, no suit-quality requirement
     - No Rule-of-20 light opening (hard floor at 12 HCP)
*/
// Hand "flaws" used to gate upgrades. Per Larry: don't bid higher than your
// raw HCP if 2+ of these are present:
//   1. Aceless
//   2. Singleton honor (K, Q, or J alone)
//   3. Two honors in a doubleton suit (excluding AK doubleton)
//   4. No 10s outside the longest suit
function listFlaws(hand) {
  const flaws = [];

  let hasAce = false;
  for (const s of SUITS) if (hand[s].includes(14)) { hasAce = true; break; }
  if (!hasAce) flaws.push('aceless');

  for (const s of SUITS) {
    if (hand[s].length === 1) {
      const r = hand[s][0];
      if (r === 13 || r === 12 || r === 11) {
        flaws.push('singleton ' + (r === 13 ? 'K' : r === 12 ? 'Q' : 'J'));
        break;
      }
    }
  }

  for (const s of SUITS) {
    if (hand[s].length === 2) {
      const [r1, r2] = hand[s];
      const isHonor = r => r >= 11 && r <= 14;
      if (isHonor(r1) && isHonor(r2) && !(r1 === 14 && r2 === 13)) {
        flaws.push('honors in doubleton');
        break;
      }
    }
  }

  // "Our suit" = longest suit (ties broken by higher rank)
  const sortedLens = SUITS.map(s => [s, hand[s].length])
    .sort((a, b) => b[1] - a[1] || SUIT_RANK[b[0]] - SUIT_RANK[a[0]]);
  const ourSuit = sortedLens[0][0];
  let has10Outside = false;
  for (const s of SUITS) {
    if (s === ourSuit) continue;
    if (hand[s].includes(10)) { has10Outside = true; break; }
  }
  if (!has10Outside) flaws.push('no 10s outside long suit');

  // Poor trumps: our (long) suit has no A/K, and either no honor at all,
  // or a lone Q/J without at least two of {10,9,8} backing it.
  const trumpSet = new Set(hand[ourSuit]);
  const trumpHasA = trumpSet.has(14);
  const trumpHasK = trumpSet.has(13);
  const trumpHasQ = trumpSet.has(12);
  const trumpHasJ = trumpSet.has(11);
  if (!trumpHasA && !trumpHasK) {
    const spotCount = (trumpSet.has(10) ? 1 : 0) + (trumpSet.has(9) ? 1 : 0) + (trumpSet.has(8) ? 1 : 0);
    let poor = false;
    if (trumpHasQ && trumpHasJ) {
      poor = false; // QJ together — two honors, not poor
    } else if (trumpHasQ || trumpHasJ) {
      poor = spotCount < 2; // lone Q or J needs 2 of {10,9,8}
    } else {
      poor = true; // no honor at all
    }
    if (poor) flaws.push('poor trumps');
  }

  return flaws;
}

// Quick tricks: A=1, AK=2, AQ=1.5, KQ=1, K-with-2+-cards=0.5. Used to
// validate that a 10-11 HCP hand has "real" defense to open at the 1-level
// (e.g., AKxx + Axxx... = 10 HCP / 3 QT = opens).
function quickTricks(hand) {
  let qt = 0;
  for (const s of SUITS) {
    const cards = hand[s];
    const set = new Set(cards);
    if (set.has(14) && set.has(13)) qt += 2;
    else if (set.has(14) && set.has(12)) qt += 1.5;
    else if (set.has(14)) qt += 1;
    else if (set.has(13) && set.has(12)) qt += 1;
    else if (set.has(13) && cards.length >= 2) qt += 0.5;
  }
  return qt;
}

// Should this hand open at all? 12 HCP always opens; 10-11 HCP opens via
// Rule of 20 (or 3+ QT). Only 3rd seat with favorable vulnerability gets
// the looser Rule of 19. Opening with sub-12 HCP is an "upgrade" —
// suppress entirely if the hand has 2+ flaws.
function shouldOpenOneLevel(hand, hcp, lens, ctx) {
  if (hcp >= 12) return true;
  if (hcp < 10) return false;
  if (listFlaws(hand).length >= 2) return false; // too flawed to upgrade
  const seat = (ctx && ctx.seat) || 1;
  const vul = (ctx && ctx.vul) || 'none';
  const weAreVul = vul === 'we' || vul === 'both';
  const theyVul = vul === 'they' || vul === 'both';
  // Rule of 19 only when 3rd seat with favorable vul (NV vs V); else Rule of 20
  const thirdFav = seat === 3 && !weAreVul && theyVul;
  const ruleN = thirdFav ? 19 : 20;
  const sorted = Object.values(lens).slice().sort((a, b) => b - a);
  if (hcp + sorted[0] + sorted[1] >= ruleN) return true;
  if (quickTricks(hand) >= 3) return true;
  return false;
}

// Combined preempt score: HCP + suit-quality bonus. Encodes the principle
// that suit quality and hand strength trade off — a really good suit
// compensates for a weaker hand, and vice versa.
function preemptScore(hcp, quality) {
  let bonus = 0;
  if (quality === 'solid') bonus = 6;
  else if (quality === 'really_good') bonus = 5;
  else if (quality === 'good') bonus = 3;
  return hcp + bonus;
}

// Acceptable preempt-score range by seat + vulnerability.
// Aggression order (most -> least): NV vs V, NV vs NV, V vs V, V vs NV.
// Seat 4 never preempts; seat 3 with favorable can preempt anything.
function preemptRange(seat, vul) {
  if (seat === 4) return null;
  const weAreVul = vul === 'we' || vul === 'both';
  const theyVul = vul === 'they' || vul === 'both';
  const favorable = !weAreVul && theyVul;
  const unfavorable = weAreVul && !theyVul;
  if (seat === 3 && favorable) return { min: 0, max: 14 };  // 3rd seat favorable: anything goes
  if (favorable) return { min: 5, max: 13 };
  if (unfavorable) return { min: 10, max: 17 };
  // Equal vulnerability: 1st/3rd seat aggressive, 2nd seat neutral
  if (seat === 1 || seat === 3) return { min: 6, max: 13 };
  return { min: 8, max: 15 };
}

/* ctx = { seat: 1|2|3|4, vul: 'none'|'we'|'they'|'both' }.
   Seat/vul affect preempt aggressiveness; default seat 1, none vul. */
function openingBid(hand, ctx) {
  ctx = ctx || {};
  const seat = ctx.seat || 1;
  const vul = ctx.vul || 'none';

  const lens = {S: hand.S.length, H: hand.H.length, D: hand.D.length, C: hand.C.length};
  let hcp = 0;
  for (const s of SUITS) for (const r of hand[s]) hcp += (HONOR[r] || 0);
  const sortedLens = Object.values(lens).slice().sort((a, b) => b - a);
  const shape = sortedLens.join('');
  const ntShape = ['4333', '4432', '5332', '5422'].includes(shape);

  // Length bonus (only counted for unbalanced/distributional shapes)
  let lengthBonus = 0;
  if (!ntShape) {
    for (const s of SUITS) lengthBonus += Math.max(0, lens[s] - 4);
  }
  const openingTP = hcp + lengthBonus;

  // 2C strong: 22+ HCP balanced, OR 22+ HCP+length unbalanced (\u22489 playing tricks)
  if (openingTP >= 22) return '2C';

  // 2NT \u2014 20-21 balanced or semi-balanced (5-4-2-2)
  if (ntShape && hcp >= 20 && hcp <= 21) return '2N';

  // 1NT \u2014 15-17 balanced/semi-balanced (4333, 4432, 5332, 5422)
  if (ntShape && hcp >= 15 && hcp <= 17) return '1N';
  // 1NT also when 6-3-2-2 with 15-17 HCP AND every suit has an honor
  // (A/K/Q/J). The "stoppers everywhere" test — when met, prefer 1NT over a
  // 1m-1M-3m auction. When it fails (e.g., ♠xx-♥Axx-♦AQ-♣AKxxxx), open the minor.
  if (shape === '6322' && hcp >= 15 && hcp <= 17) {
    const sixSuit = SUITS.find(s => lens[s] === 6);
    if (sixSuit === 'C' || sixSuit === 'D') {
      const allSuitsHaveHonor = SUITS.every(s =>
        hand[s].some(r => r >= 11 && r <= 14)
      );
      if (allSuitsHaveHonor) return '1N';
    }
  }

  // 1-level suit openings: 12+ HCP always, or 10-11 with Rule of 20/19 / 3 QT
  if (hcp <= 21 && shouldOpenOneLevel(hand, hcp, lens, ctx)) {
    if (lens.S >= 5) return '1S';
    if (lens.H >= 5) return '1H';
    if (lens.D >= 4 && lens.D >= lens.C) return '1D';
    if (lens.C >= 4) return '1C';
    return '1C';
  }

  // Weak 2s and preempts: combined HCP+suit score must fall in the context's range.
  // Range narrows in conservative contexts and widens (down to 0) in 3rd-seat favorable.
  const range = preemptRange(seat, vul);
  if (range && hcp >= 0 && hcp <= 11) {
    // Weak 2 in S/H/D (clubs uses 3C since 2C is strong)
    for (const s of ['S', 'H', 'D']) {
      if (lens[s] === 6) {
        const score = preemptScore(hcp, suitQuality(hand[s]));
        if (score >= range.min && score <= range.max) return '2' + s;
        return 'P';
      }
    }
    // 3-level preempt with 7-card suit
    for (const s of ['S', 'H', 'D', 'C']) {
      if (lens[s] === 7) {
        const score = preemptScore(hcp, suitQuality(hand[s]));
        if (score >= range.min && score <= range.max) return '3' + s;
        return 'P';
      }
    }
  }

  return 'P';
}

function isPlausibleOpening(hand, opening) {
  return openingBid(hand) === opening;
}

/* ---------- Responder's first call ----------
   Standard Cohen 2/1 responses. Covers the common cases needed to validate
   1m and 1M openings. Less-common high-strength branches and responses to
   2C / 2NT / weak 2s / preempts are marked TBD.
*/
function responderBid(hand, opening) {
  const lens = {S: hand.S.length, H: hand.H.length, D: hand.D.length, C: hand.C.length};
  let hcp = 0;
  for (const s of SUITS) for (const r of hand[s]) hcp += (HONOR[r] || 0);
  const sortedLens = Object.values(lens).slice().sort((a, b) => b - a);
  const shape = sortedLens.join('');
  const balanced = ['4333', '4432', '5332'].includes(shape);

  if (hcp < 6) return 'P';

  if (opening === '1C' || opening === '1D') {
    const m = opening[1];
    // Up-the-line: with 4+ hearts, bid 1H first (even with 4-4 majors)
    if (lens.H >= 4) return '1H';
    if (lens.S >= 4) return '1S';
    // No 4-card major — minor raise or NT response by strength
    // Inverted minor: 11+ HCP with 5+ support = GF (1m-2m); weak raise = 1m-3m, 4+ support 6-10 HCP
    if (lens[m] >= 5 && hcp >= 11) return '2' + m;
    if (lens[m] >= 5 && hcp <= 10) return '3' + m;
    if (hcp <= 10) return '1N';
    if (hcp <= 12) return '2N';
    if (hcp <= 15) return '3N';
    return null; // 16+ no major no minor fit — rare gap
  }

  if (opening === '1H' || opening === '1S') {
    const M = opening[1];
    // Major raise with 3+ support
    if (lens[M] >= 3) {
      // Jacoby 2NT: GF raise with 4+ support, 13+ HCP
      if (lens[M] >= 4 && hcp >= 13) return '2N';
      // Limit raise: 10-12 with 3+ support
      if (hcp >= 10 && hcp <= 12) return '3' + M;
      // Simple raise: 6-9 with 3+ support
      if (hcp >= 6 && hcp <= 9) return '2' + M;
      // 13+ with only 3 support: fall through to 1NT forcing or 2/1
    }
    // 1S over 1H with 4+ spades and no heart fit
    if (M === 'H' && lens.S >= 4) return '1S';
    // 2/1 game force: 13+ HCP with 5+ in a new suit lower than opener's
    if (hcp >= 13) {
      // 2C over 1H/1S, 2D over 1H/1S, 2H over 1S — pick longest non-M suit with 5+
      for (const s of ['C', 'D', 'H']) {
        if (s === M) continue;
        if (lens[s] >= 5 && SUIT_RANK[s] < SUIT_RANK[M]) return '2' + s;
      }
      return '3N'; // 13-15 balanced no fit (very rough)
    }
    // 1NT forcing: 6-12 with no fit and no 4 spades over 1H
    if (hcp <= 12) return '1N';
    return null;
  }

  // Responses to 1NT, 2C, 2NT, weak 2s, preempts: TBD
  return null;
}

/* ---------- Bid helpers ---------- */
function splinterBid(f) {
  // Find singleton/void in non-trump suit
  let shortSuit = null;
  for (const s of SUITS) {
    if (s === f.M) continue;
    if (f.shortness[s] === 'singleton' || f.shortness[s] === 'void') {
      shortSuit = s; break;
    }
  }
  if (!shortSuit) return null;
  // Level: 3 if shortSuit higher than M (spades over hearts), else 4
  const level = SUIT_RANK[shortSuit] > SUIT_RANK[f.M] ? 3 : 4;
  return level + shortSuit;
}

// A suit is a TRUE reverse target if 2-level is the lowest level (no 1-level
// bid available because suit <= M in rank) AND suit is higher than opener's first.
// Reverse targets per auction:
//   1C-1H: D only         1C-1S: D, H
//   1D-1H: (none)         1D-1S: H only
function isReverseTarget(suit, m, M) {
  if (suit === m || suit === M) return false;
  return SUIT_RANK[suit] > SUIT_RANK[m] && SUIT_RANK[suit] <= SUIT_RANK[M];
}

// A suit is a valid JUMP SHIFT target only when the natural (non-jump) rebid
// in that suit isn't itself a reverse — Larry: "no need to jump AND reverse."
// Jump shift valid if either:
//   (a) suit > M (1-level bid available; 2-level is the jump), e.g. 1m-1H-2S
//   (b) suit < m (2-level is simple non-reverse; 3-level is the jump), e.g. 1D-?-3C
// Valid jump shifts per auction:
//   1C-1H: 2S            1C-1S: (none)
//   1D-1H: 2S, 3C        1D-1S: 3C
function isJumpShiftTarget(suit, m, M) {
  if (suit === m || suit === M) return false;
  if (SUIT_RANK[suit] > SUIT_RANK[M]) return true;
  if (SUIT_RANK[suit] < SUIT_RANK[m]) return true;
  return false;
}

function jumpShiftBid(f) {
  const candidates = SUITS.filter(s => isJumpShiftTarget(s, f.m, f.M) && f.lens[s] >= 5);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => f.lens[b] - f.lens[a] || SUIT_RANK[a] - SUIT_RANK[b]);
  const suit = candidates[0];
  // Level: 2 if suit > M (only spades over 1H), else 3
  const level = SUIT_RANK[suit] > SUIT_RANK[f.M] ? 2 : 3;
  return level + suit;
}

function reverseBid(f) {
  const candidates = SUITS.filter(s => isReverseTarget(s, f.m, f.M) && f.lens[s] >= 4);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => SUIT_RANK[a] - SUIT_RANK[b]);
  return '2' + candidates[0];
}

// After 1D, with 6+ diamonds AND 4+ clubs, prefer 2C over rebidding diamonds
// unless the club suit is too weak. "Decent" = at least one of A/K/Q, OR J-10-9.
function clubsDecentForRebid(f) {
  if (f.lens.C < 4) return false;
  const set = new Set(f.hand.C);
  if (set.has(14) || set.has(13) || set.has(12)) return true; // A, K, or Q
  if (set.has(11) && set.has(10) && set.has(9)) return true;   // J-10-9
  return false;
}

// Stopper definition for the 3NT rebid: A (any length), Kx+, or Qxx+.
function hasStopper(cards) {
  const set = new Set(cards);
  if (set.has(14)) return true;
  if (set.has(13) && cards.length >= 2) return true;
  if (set.has(12) && cards.length >= 3) return true;
  return false;
}

// The opening suit, headed by AKQ / AKJ / AQJ — the "running or near-running" requirement for 3NT.
function suitHasRunningTop3(cards) {
  const set = new Set(cards);
  const A = set.has(14), K = set.has(13), Q = set.has(12), J = set.has(11);
  return (A && K && Q) || (A && K && J) || (A && Q && J);
}

// 5-4-2-2 with 5-4 in the MINORS (5 in opening minor + 4 in the other minor)
// AND at least one A/K/Q/J in the 2-card unbid major can be treated as
// balanced — the unbid-major stopper makes 1NT/2NT playable. After 1D-1M
// this overrides the natural 2C "show second suit" rebid.
function has54MinorsHonorInUnbidMajor(f) {
  if (f.shape !== '5422') return false;
  if (f.m_len !== 5) return false;
  const otherMinor = f.m === 'C' ? 'D' : 'C';
  if (f.lens[otherMinor] !== 4) return false;
  const uM = f.M === 'H' ? 'S' : 'H';
  return f.hand[uM].some(r => r >= 11);
}

// Returns the lowest-ranked suit (per the given suit order) with at least
// minLen cards in opener's hand — used for "show second suit up-the-line"
// rebids in the 1NT-response auctions.
function lowestSideSuitOf(orderedSuits, f, minLen) {
  for (const s of orderedSuits) {
    if (f.lens[s] >= minLen) return s;
  }
  return null;
}

// 5-4-2-2 is semi-balanced; reversing requires "extreme purity" — all HCP in
// the two long suits and zero in the doubletons. Scattered honors → rebid 2NT
// (in range) instead of reverse.
function isPureFor5422Reverse(f) {
  if (f.shape !== '5422') return true;
  let hcpShort = 0;
  for (const s of SUITS) {
    if (f.lens[s] === 2) {
      for (const r of f.hand[s]) hcpShort += (HONOR[r] || 0);
    }
  }
  return hcpShort === 0;
}

/* ---------- Rule table ---------- */
const RULES = [
  {
    id: 11, priority: 1.1, name: "Splinter",
    bid: f => splinterBid(f),
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp < 19 || f.tp >= 21) return false;
      if (f.support_len < 4) return false;
      // Need singleton or void in a non-M suit
      for (const s of SUITS) {
        if (s === f.M) continue;
        if (f.shortness[s] === 'singleton' || f.shortness[s] === 'void') return true;
      }
      return false;
    },
    rationale: "Splinter. You have 4+ trumps, 19-20 points, and a singleton or void to show \u2014 jump in the short suit so responder can judge slam.",
    alternates: f => [
      { bid: '4' + f.M, reason: "Jumping to game is reasonable if you don't play splinters. The splinter is more descriptive \u2014 it pinpoints the shortness so responder can judge slam." },
      { bid: '3' + f.M, reason: "Jump raise shows invitational values; this hand is closer to game-force. If you don't play splinters, jumping to game is usually better than 3M with these values." }
    ]
  },
  {
    id: 12, priority: 1.2, name: "Jump to 4M",
    bid: f => '4' + f.M,
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp < 18 || f.tp > 19) return false;
      if (f.support_len < 4) return false;
      // No singleton/void
      for (const s of SUITS) {
        if (f.shortness[s] === 'singleton' || f.shortness[s] === 'void') return false;
      }
      if (f.balanced) {
        // Balanced 18 always jumps to 3M (rule 6). A "good" balanced 19
        // (no flaws) jumps to game; a flawed 19 settles for 3M.
        if (f.tp !== 19) return false;
        if (f.flaws.length > 0) return false;
      }
      return true;
    },
    rationale: f => {
      if (f.balanced) {
        return `Jump to game. A "good" balanced 19 with 4-card support, no shortness, and no flaws produces enough playing tricks for game even opposite a minimum raise.`;
      }
      return "Jump to game. 18-19 with 4-card support and a 5-card side suit (no singleton or void) \u2014 the side-suit length supplies the playing tricks needed for game. Responder can carry on if slam looks interesting.";
    }
  },
  {
    id: 6, priority: 1.3, name: "Jump raise 3M",
    bid: f => '3' + f.M,
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.support_len < 4) return false;
      // 15-18.99 TP unbalanced
      if (f.tp >= 15 && f.tp < 19 && !f.balanced) return true;
      // Balanced 18 with 4-card support always jumps to 3M (not 4M).
      if (f.tp === 18 && f.balanced) return true;
      // Balanced 19 with 4-card support: only if flawed. A clean 19 jumps to 4M (rule 12).
      if (f.tp === 19 && f.balanced && f.flaws.length > 0) return true;
      return false;
    },
    rationale: f => {
      if (f.balanced && f.tp === 19) {
        return `Jump to 3${SUIT_SYMBOLS[f.M]}. Balanced 19 with flaws (${f.flaws.join(', ')}) \u2014 a flawed flat hand often comes up a trick short opposite a minimum raise, so settle for the invitational jump.`;
      }
      if (f.balanced && f.tp === 18) {
        return `Jump to 3${SUIT_SYMBOLS[f.M]}. Balanced 18 with 4-card support \u2014 flat hands often come up a trick short opposite a minimum raise, so jump invitationally and let responder decide.`;
      }
      return `Invitational jump. With approximately 15-18 total points and shape, jump to 3${SUIT_SYMBOLS[f.M]} so responder can pass with a minimum or push to game.`;
    }
  },
  {
    id: 2, priority: 1.4, name: "Simple raise 2M",
    bid: f => '2' + f.M,
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp >= 15) return false;
      if (f.support_len < 4) return false;
      return true;
    },
    rationale: "Minimum opener with 4-card support. Raise to 2 of responder's major right away \u2014 the fit is what matters most, so show it before anything else.",
    alternates: f => {
      if (f.tp >= 14 && !f.balanced) {
        return [{
          bid: '3' + f.M,
          reason: "With a maximum 14 TP and shape, jumping to 3M to invite game is defensible — right on the borderline."
        }];
      }
      return [];
    }
  },
  { id: 14, priority: 1.6, name: "3NT (running suit)",
    bid: () => '3N',
    matches: f => {
      if (f.tp < 18) return false;
      // 7 or 8 cards in opener's first-bid suit (works for 1m and 1M openings).
      if (f.m_len < 7 || f.m_len > 8) return false;
      // Opening suit headed by AKQ, AKJ, or AQJ — running or near-running.
      if (!suitHasRunningTop3(f.hand[f.m])) return false;
      // Not 3 or 4 card support for responder's major (skipped if responder bid 1NT).
      if (!f.isNTResponse && f.support_len >= 3) return false;
      // Stoppers in all suits not bid by either side. For 1NT response there
      // are 3 unbid suits (f.M='N' filters nothing); for 1m-1M, 2 unbid suits.
      const unbid = SUITS.filter(s => s !== f.m && s !== f.M);
      for (const s of unbid) {
        if (!hasStopper(f.hand[s])) return false;
      }
      return true;
    },
    rationale: f => {
      const unbidCount = SUITS.filter(s => s !== f.m && s !== f.M).length;
      const stopPhrase = unbidCount === 3 ? "stoppers in the three unbid suits" : "stoppers in both unbid suits";
      const sourcePhrase = (f.m === 'C' || f.m === 'D') ? "long minor" : "long major";
      return `Running or near-running 7-card ${SUIT_SYMBOLS[f.m]} suit, extras, and ${stopPhrase} \u2014 jump to 3NT. The ${sourcePhrase} is the trick source; the stoppers protect the unbid suits in notrump play.`;
    }
  },
  {
    id: 8, priority: 2.0, name: "2NT (strong balanced)",
    bid: () => '2N',
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.hcp < 18 || f.hcp > 19) return false;
      if (f.support_len >= 4) return false;
      if (f.balanced) return true;
      // 6-3-2-2 with 6 in opening minor is semi-balanced — also rebids 2NT
      if (f.shape === '6322' && f.m_len === 6) return true;
      // 5-4-2-2 with scattered honors (not pure enough to reverse) rebids 2NT
      // — the existing impure check already catches the "5-4 minors with
      // honor in 2-card unbid major" case (the honor lives in a doubleton).
      if (f.shape === '5422' && !isPureFor5422Reverse(f)) return true;
      return false;
    },
    rationale: f => {
      let base = "Strong balanced (18-19 HCP), not 4-card support for responder's major \u2014 2NT shows the strength and balanced shape. It doesn't say anything about stoppers in the other suits.";
      if (f.shape === '6322' && f.m_len === 6) {
        base = "18-19 HCP with semi-balanced 6-3-2-2 (and 6 in the opening minor) \u2014 2NT shows the strength without overcommitting to the minor. It doesn't promise stoppers in the other suits.";
      } else if (f.shape === '5422') {
        base = "18-19 HCP with 5-4-2-2 and honors too scattered to reverse cleanly \u2014 rebid 2NT to show the strength. It doesn't promise stoppers in the other suits.";
      }
      // Could have reversed (4+ in a higher suit) but balanced 2NT is more descriptive
      const reverseSuit = SUITS.find(s => isReverseTarget(s, f.m, f.M) && f.lens[s] >= 4);
      if (reverseSuit) {
        base += ` You have 4 ${SUIT_SYMBOLS[reverseSuit]} \u2014 strong enough to reverse, but 2NT is more descriptive of a balanced 18-19.`;
      }
      if (f.M === 'H' && f.lens.S === 4) {
        base += " 2NT takes priority over 1\u2660 since it shows the balanced strength immediately (and a 2\u2660 jump shift wouldn't apply \u2014 that promises 5+ spades unbalanced).";
      }
      return base;
    }
  },
  {
    id: 4, priority: 3.0, name: "1\u2660 rebid (over 1\u2665)",
    bid: () => '1S',
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.M !== 'H') return false;
      if (f.tp >= 18) return false;
      if (f.support_len >= 4) return false;
      if (f.m_len >= 7) return false; // With 7+ in opening minor, rebid the minor
      if (f.lens.S === 4 && f.shape !== '4333') return true;
      if (f.lens.S === 5 && f.m_len >= 6) return true; // rare 6-5
      return false;
    },
    rationale: f => {
      // 4-3 majors with extreme minors (5-1, 1-5, 6-0, 0-6) — show spades,
      // plan to raise hearts on the next round.
      if (f.lens.S === 4 && f.lens.H === 3) {
        const dc = f.lens.D + '/' + f.lens.C;
        if (['5/1','1/5','6/0','0/6'].includes(dc)) {
          return `Bid 1\u2660. With 4-3 in the majors and an extreme minor distribution (${dc.replace('/', '-')}), show the spades first \u2014 plan to raise hearts on the next round if responder bids again.`;
        }
      }
      return "Responder bid 1\u2665 and you have 4 spades \u2014 bid 1\u2660 to show the major. It's cheap, it's natural, and you might find a 4-4 spade fit.";
    },
    alternates: f => {
      if (f.balanced) {
        return [{
          bid: '1N',
          reason: "Some players rebid 1NT to show the balanced shape. Larry prefers 1\u2660 \u2014 showing the major is more descriptive and responder can always return to NT."
        }];
      }
      return [];
    }
  },
  {
    id: 7, priority: 4.1, name: "Jump rebid 3m",
    bid: f => '3' + f.m,
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp < 15 || f.tp > 17) return false;
      if (f.support_len >= 4) return false;
      if (f.m_len < 6) return false;
      if (f.balanced) return false;
      const q = f.quality[f.m];
      if (q !== 'good' && q !== 'really_good' && q !== 'solid') return false;
      // Over 1H: don't hide 4 spades unless 4-3-3-3
      if (f.M === 'H' && f.lens.S === 4 && f.shape !== '4333') return false;
      return true;
    },
    rationale: f => {
      const has4SideSuit = SUITS.some(s => s !== f.m && s !== f.M && f.lens[s] === 4);
      if (f.m_len >= 7 && has4SideSuit) {
        return `Jump to 3${SUIT_SYMBOLS[f.m]}. You could introduce the 4-card suit, but with 7 of the first suit, it's better to start by repeating it.`;
      }
      return `Good 6+ card minor and 15-17 points \u2014 jump in your suit. The jump shows the extra strength; the long suit shows where the tricks are coming from.`;
    },
    alternates: f => {
      const alts = [];
      // 6-3-2-2 is semi-balanced; 2NT instead of jumping the minor is acceptable
      if (f.shape === '6322' && f.m_len === 6) {
        alts.push({
          bid: '2N',
          reason: "6-3-2-2 is semi-balanced. Larry prefers jumping in the 6-card minor, but 2NT is acceptable."
        });
      }
      // 6-4 with a reverse target and 16+ TP: reverse is also defensible
      if (f.m_len === 6 && f.tp >= 16) {
        const reverseSuit = SUITS.find(s => isReverseTarget(s, f.m, f.M) && f.lens[s] >= 4);
        if (reverseSuit) {
          alts.push({
            bid: '2' + reverseSuit,
            reason: `Reverse to 2${SUIT_SYMBOLS[reverseSuit]} is also defensible with extras. The jump 3${SUIT_SYMBOLS[f.m]} emphasizes the suit length; the reverse emphasizes the second suit. A reverse here is on the light side \u2014 with a clearly minimum hand, the jump is safer.`
          });
        }
      }
      return alts;
    }
  },
  {
    id: 3, priority: 4.2, name: "Minimum minor rebid 2m",
    bid: f => '2' + f.m,
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp >= 15) return false;
      if (f.support_len >= 4) return false;
      if (f.m_len < 6) return false;
      if (f.M === 'H' && f.lens.S === 4 && f.shape !== '4333') return false;
      return true;
    },
    rationale: f => {
      // 7-4 (not a reverse): prefer repeating the 7-card suit over showing the 4-card side
      const has4SideSuit = SUITS.some(s => s !== f.m && s !== f.M && f.lens[s] === 4);
      if (f.m_len >= 7 && has4SideSuit) {
        return `Rebid 2${SUIT_SYMBOLS[f.m]}. You could introduce the 4-card suit, but with 7 of the first suit, it's better to start by repeating it.`;
      }
      // Has 4+ in a higher-ranking suit but minimum hand
      const reverseSuit = SUITS.find(s => isReverseTarget(s, f.m, f.M) && f.lens[s] >= 4);
      if (reverseSuit) {
        return `Minimum opener (12-14) with 6+ in your minor and 4 ${SUIT_SYMBOLS[reverseSuit]} \u2014 you'd reverse with 17+, but with this minimum you can't. Rebid the long suit.`;
      }
      return "Minimum opener with 6+ in your minor and nothing else to say \u2014 just rebid the suit. No fit, no spades to show over 1\u2665, no extras: keep it simple.";
    },
    alternates: f => {
      // 6-3-2-2 is semi-balanced; 1NT instead of repeating the minor is acceptable
      if (f.shape === '6322' && f.m_len === 6) {
        return [{
          bid: '1N',
          reason: "6-3-2-2 is semi-balanced. Larry prefers rebidding the 6-card minor, but 1NT is acceptable."
        }];
      }
      return [];
    }
  },
  {
    id: 5, priority: 4.0, name: "Show the second suit (2\u2663 after 1\u2666)",
    bid: () => '2C',
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (f.tp >= 18) return false;
      if (f.support_len >= 4) return false;
      if (f.lens.D < 4 || f.lens.C < 4) return false;
      if (f.balanced) return false;
      if (f.M === 'H' && f.lens.S === 4 && f.shape !== '4333') return false;
      // With 6+ diamonds, only show clubs if the suit has some quality (Q+ or J-10-9)
      if (f.lens.D >= 6 && !clubsDecentForRebid(f)) return false;
      // 5-4 minors with honor in 2-card unbid major \u2014 prefer 1NT (rule 1)
      if (has54MinorsHonorInUnbidMajor(f)) return false;
      // With 7+ in opening minor, repeat the minor instead of showing the second suit
      if (f.m_len >= 7) return false;
      return true;
    },
    rationale: f => {
      let base = "You have a second suit \u2014 show it. 2\u2663 is below diamonds so responder can return to 2\u2666 without a problem; no reverse risk.";
      const reverseSuit = SUITS.find(s => isReverseTarget(s, f.m, f.M) && f.lens[s] >= 4);
      if (reverseSuit) {
        base += ` You can't bid 2${SUIT_SYMBOLS[reverseSuit]} \u2014 with this minimum, that would be a reverse, which promises 17+.`;
      }
      base += " With 6+ diamonds, still show clubs as long as the suit has some bite \u2014 Q or better, or at least J-10-9.";
      return base;
    }
  },
  {
    id: 10, priority: 5.1, name: "Jump shift",
    bid: f => jumpShiftBid(f),
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp < 19 || f.tp > 21) return false;
      if (f.support_len >= 4) return false;
      // Target must be a valid jump-shift suit (no jump-AND-reverse — Larry's rule)
      const target = SUITS.find(s => isJumpShiftTarget(s, f.m, f.M) && f.lens[s] >= 5);
      if (!target) return false;
      const secondCount = SUITS.filter(s => s !== target && f.lens[s] >= 4).length;
      if (secondCount === 0) return false;
      return true;
    },
    rationale: "Jump shift — game-forcing. With 19-21 points and a 5+ card new suit (plus a 4+ second suit), jump to show the strength and the shape. Larry's rule: never jump AND reverse, so only jump in suits where the natural bid wouldn't already have been a reverse."
  },
  {
    id: 9, priority: 5.2, name: "Reverse",
    bid: f => reverseBid(f),
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp < 17 || f.tp > 21) return false;
      if (f.support_len >= 4) return false;
      if (f.balanced) return false;
      if (f.m_len < 5) return false;
      if (!SUITS.some(s => isReverseTarget(s, f.m, f.M) && f.lens[s] >= 4)) return false;
      // 5-4-2-2 requires extreme purity (all values in long suits) to reverse
      if (f.shape === '5422' && !isPureFor5422Reverse(f)) return false;
      return true;
    },
    rationale: "Reverse \u2014 17-21 unbalanced with your long minor and 4+ in a higher-ranking side suit. Forcing for one round (responder can't pass), but not game-forcing. With 5-4-2-2 shape, only reverse when your values are concentrated in the long suits; with scattered honors, rebid 2NT instead."
  },
  { id: 13, priority: 2.5, name: "Three-card raise",
    bid: f => '2' + f.M,
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp >= 15) return false;
      if (f.support_len !== 3) return false;
      if (!f.hand[f.M].some(r => r >= 11)) return false;
      // Ruffing value: side void, side singleton, OR side doubleton lower than Jx
      const hasRuffingValue = SUITS.some(s => {
        if (s === f.M) return false;
        if (f.lens[s] === 0) return true; // void
        if (f.lens[s] === 1) return true; // singleton
        if (f.lens[s] === 2 && !f.hand[s].some(r => r >= 11)) return true; // doubleton lower than Jx
        return false;
      });
      // 4-3-4-2 / 4-4-3-2 with 4 spades + 3-card heart support after 1m-1H also
      // raises immediately, even without a "lower than Jx" doubleton.
      const is4432_43_majors = f.shape === '4432' && f.M === 'H' && f.lens.S === 4 && f.lens.H === 3;
      if (!hasRuffingValue && !is4432_43_majors) return false;
      // With 7+ in opening minor, repeat the minor instead.
      if (f.m_len >= 7) return false;
      return true;
    },
    rationale: f => {
      if (f.shape === '4432' && f.M === 'H' && f.lens.S === 4 && f.lens.H === 3) {
        return `Raise to 2${SUIT_SYMBOLS[f.M]}. With 4-3-4-2 and a minimum, just raise immediately. (Showing 1\u2660 is also playable, but planning to raise hearts on the next round would want a stronger hand \u2014 easier to confirm the fit now.)`;
      }
      return `Raise to 2${SUIT_SYMBOLS[f.M]}. We rarely raise with three-card support \u2014 but Bobby Levin and Steve Weinstein were a famous partnership and their rule for this situation is: with three-card support that includes a J or higher honor, plus a side void, singleton, or doubleton lower than Jx (a potential ruffing value), go ahead and raise.`;
    },
    alternates: f => {
      if (f.shape === '4432' && f.M === 'H' && f.lens.S === 4 && f.lens.H === 3) {
        return [{
          bid: '1S',
          reason: "Showing the spades is also acceptable. To bid 1\u2660 planning to raise hearts on a third round, though, the hand should be better than a minimum \u2014 easier to just raise hearts now."
        }];
      }
      return [];
    }
  },
  {
    id: 1, priority: 6.0, name: "1NT rebid",
    bid: () => '1N',
    matches: f => {
      if (f.isNTResponse) return false;
      if (f.tp >= 15) return false;
      if (f.support_len >= 4) return false;
      if (f.balanced) return true;
      if (f.shape !== '5422' || f.m_len !== 5) return false;
      // 5-4-2-2 exception #1: 4-card non-M non-m suit higher than opener's
      // first \u2014 the 2-level bid would be a reverse you can't afford with this minimum.
      for (const s of SUITS) {
        if (s === f.M || s === f.m) continue;
        if (f.lens[s] === 4 && SUIT_RANK[s] > SUIT_RANK[f.m]) return true;
      }
      // 5-4-2-2 exception #2: 5-4 in minors AND a stopper (A/K/Q/J) in the
      // 2-card unbid major \u2014 treat as balanced.
      if (has54MinorsHonorInUnbidMajor(f)) return true;
      return false;
    },
    rationale: f => {
      if (f.M === 'H' && f.lens.S === 4 && f.shape === '4333') {
        return "Skip a 4-card spade suit after a 1\u2665 response only with 4-3-3-3 shape. Minimum balanced opener (12-14), bid 1NT.";
      }
      if (f.shape === '5422') {
        return "Minimum opener (12-14) with semi-balanced 5-4-2-2 \u2014 1NT describes the strength and shape. With this minimum, the 4-card side suit can't be shown at the 2-level.";
      }
      return "Minimum balanced opener (12-14) with no four-card fit for responder's major \u2014 1NT describes the strength and shape in one breath.";
    }
  },

  /* ========== 1C-1NT auctions (rules 15-19) ==========
     Spec per Larry: Pass on minimum without 6 clubs; 2C with 6+ clubs minimum;
     2D/2H/2S (reverse-style) with 5+ clubs + 4+ side + 17+; 2NT balanced 18-19;
     3C with 6+ clubs 17-19 and no side suit. 3NT covered by rule 14. */
  { id: 19, priority: 10.10, name: "3\u2663 jump rebid (1C-1NT)",
    bid: () => '3C',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1C') return false;
      if (f.lens.C < 6) return false;
      if (f.tp < 17 || f.tp > 19) return false;
      for (const s of ['D','H','S']) if (f.lens[s] >= 4) return false;
      return true;
    },
    rationale: "6+ clubs, 17-19 total points, no other 4-card suit to show \u2014 jump to 3\u2663 to invite game in the long suit."
  },
  { id: 17, priority: 10.20, name: "New suit at 2-level (1C-1NT)",
    bid: f => '2' + lowestSideSuitOf(['D','H','S'], f, 4),
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1C') return false;
      if (f.lens.C < 5) return false;
      if (f.tp < 17) return false;
      if (f.balanced) return false;
      return lowestSideSuitOf(['D','H','S'], f, 4) !== null;
    },
    rationale: f => {
      const s = lowestSideSuitOf(['D','H','S'], f, 4);
      return `5+ clubs, 4+ ${SUIT_SYMBOLS[s]}, unbalanced, 17+ total points \u2014 introduce the second suit. The reverse shows the extras; responder can preference back to clubs or pass.`;
    }
  },
  { id: 18, priority: 10.25, name: "2NT (1C-1NT)",
    bid: () => '2N',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1C') return false;
      if (!f.balanced) return false;
      if (f.tp < 18 || f.tp > 19) return false;
      return true;
    },
    rationale: "Balanced 18-19 after 1\u2663-1NT \u2014 invitational 2NT. Responder passes with a minimum or pushes on with extras."
  },
  { id: 16, priority: 10.30, name: "2\u2663 rebid (1C-1NT)",
    bid: () => '2C',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1C') return false;
      if (f.lens.C < 6) return false;
      if (f.tp >= 17) return false;
      return true;
    },
    rationale: "6+ clubs and a minimum opener \u2014 rebid 2\u2663 to show the long suit. Responder can pass or correct."
  },
  { id: 15, priority: 10.40, name: "Pass (1C-1NT)",
    bid: () => 'P',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1C') return false;
      if (f.tp >= 17) return false;
      if (f.lens.C >= 6) return false;
      return true;
    },
    rationale: "Minimum opener with no 6-card club suit to repeat \u2014 just pass 1NT. Responder's 1NT shows 6-10 balanced; the partnership has at most 24 combined HCP."
  },

  /* ========== 1D-1NT auctions (rules 20-26) ==========
     Spec: Pass minimum without long diamonds or second suit; 2C with 5+D + 4+C
     minimum (except 2-2-5-4); 2D with 6+D or 5D + side singleton/void; 2H/2S
     reverse-style with 4+ major 17+ unbalanced; 2NT balanced 18-19; 3C with
     4+ clubs 19+ unbalanced; 3D with 6+D no side 17-19. */
  { id: 26, priority: 11.05, name: "3\u2666 jump rebid (1D-1NT)",
    bid: () => '3D',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (f.lens.D < 6) return false;
      if (f.tp < 17 || f.tp > 19) return false;
      for (const s of ['C','H','S']) if (f.lens[s] >= 4) return false;
      return true;
    },
    rationale: "6+ diamonds, 17-19 total points, no other 4-card suit \u2014 jump to 3\u2666 in the long suit."
  },
  { id: 25, priority: 11.10, name: "3\u2663 jump rebid (1D-1NT)",
    bid: () => '3C',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (f.lens.C < 4) return false;
      if (f.tp < 19) return false;
      if (f.balanced) return false;
      return true;
    },
    rationale: "4+ clubs and 19+ total points after 1\u2666-1NT \u2014 jump to 3\u2663 to set up game in either minor."
  },
  { id: 23, priority: 11.20, name: "New major at 2-level (1D-1NT)",
    bid: f => f.lens.H >= 4 ? '2H' : '2S',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (f.tp < 17) return false;
      if (f.balanced) return false;
      if (f.lens.H < 4 && f.lens.S < 4) return false;
      return true;
    },
    rationale: f => {
      const major = f.lens.H >= 4 ? 'H' : 'S';
      return `4+ ${SUIT_SYMBOLS[major]}, unbalanced, 17+ total points \u2014 reverse into 2${SUIT_SYMBOLS[major]} to show the extras and the second suit. Responder can preference back to diamonds or carry on with values.`;
    }
  },
  { id: 24, priority: 11.25, name: "2NT (1D-1NT)",
    bid: () => '2N',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (!f.balanced) return false;
      if (f.tp < 18 || f.tp > 19) return false;
      return true;
    },
    rationale: "Balanced 18-19 after 1\u2666-1NT \u2014 invitational 2NT."
  },
  { id: 22, priority: 11.32, name: "2\u2666 rebid (1D-1NT)",
    bid: () => '2D',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (f.tp >= 17) return false;
      if (f.lens.D >= 6) return true;
      if (f.lens.D === 5) {
        // 5 diamonds with a side singleton or void
        for (const s of ['H','S','C']) if (f.lens[s] <= 1) return true;
      }
      return false;
    },
    rationale: f => {
      if (f.lens.D >= 6) {
        return "6+ diamonds and a minimum \u2014 rebid 2\u2666 to show the long suit.";
      }
      return "5 diamonds with side shortness \u2014 rebid 2\u2666. The singleton or void adds playing tricks; a diamond contract plays better than 1NT.";
    }
  },
  { id: 21, priority: 11.30, name: "2\u2663 rebid (1D-1NT)",
    bid: () => '2C',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (f.lens.D < 5) return false;
      if (f.lens.C < 4) return false;
      if (f.tp >= 17) return false;
      // Spec exclusion: 2-2-5-4 prefers Pass (the doubleton majors with 4-card
      // clubs and only 5 diamonds isn't a clean second-suit show).
      if (f.lens.S === 2 && f.lens.H === 2 && f.lens.D === 5 && f.lens.C === 4) return false;
      return true;
    },
    rationale: "5+ diamonds and 4+ clubs with a minimum \u2014 show the second suit with 2\u2663. Stays low; responder can return to 2\u2666 with a diamond preference."
  },
  { id: 20, priority: 11.40, name: "Pass (1D-1NT)",
    bid: () => 'P',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1D') return false;
      if (f.tp >= 17) return false;
      if (f.lens.D >= 6) return false;
      // 2-2-5-4 passes explicitly per spec
      const is2254 = f.lens.S === 2 && f.lens.H === 2 && f.lens.D === 5 && f.lens.C === 4;
      if (is2254) return true;
      // 5+D + 4+C → 2C (not Pass)
      if (f.lens.D >= 5 && f.lens.C >= 4) return false;
      // 5D + side singleton/void → 2D (not Pass)
      if (f.lens.D === 5) {
        for (const s of ['H','S','C']) if (f.lens[s] <= 1) return false;
      }
      return true;
    },
    rationale: "Minimum opener with no long diamonds, no second suit to show at the 2-level, no side shortness \u2014 just pass 1NT."
  },

  /* ========== 1H-1NT auctions (rules 27-31) ==========
     Spec: Pass on any balanced hand less than a 1NT opener (so 12-14 balanced);
     2-of-a-minor with 4+ minor and <19 TP (semi-balanced 18-19 prefers 2NT);
     2H with 6+ hearts <17 and any side 4-card suit headed by at most a Jack;
     2S with 4+ spades 17+ TP; 2NT balanced (or 5-4-2-2 with 5H) 18-19. */
  { id: 30, priority: 12.20, name: "2\u2660 reverse (1H-1NT)",
    bid: () => '2S',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1H') return false;
      if (f.tp < 17) return false;
      if (f.lens.S < 4) return false;
      return true;
    },
    rationale: "4+ spades and 17+ total points after 1\u2665-1NT \u2014 reverse into 2\u2660 to show the extras and the second suit."
  },
  { id: 31, priority: 12.25, name: "2NT (1H-1NT)",
    bid: () => '2N',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1H') return false;
      if (f.tp < 18 || f.tp > 19) return false;
      if (!f.balanced && !(f.shape === '5422' && f.lens.H === 5)) return false;
      return true;
    },
    rationale: f => {
      if (f.shape === '5422') {
        return "Semi-balanced 5-4-2-2 with 5 hearts and 18-19 total points \u2014 prefer 2NT over showing the minor; the strength is the key message.";
      }
      return "Balanced 18-19 after 1\u2665-1NT \u2014 invitational 2NT.";
    }
  },
  { id: 29, priority: 12.30, name: "2\u2665 rebid (1H-1NT)",
    bid: () => '2H',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1H') return false;
      if (f.lens.H < 6) return false;
      if (f.tp >= 17) return false;
      // Any 4-card side suit must be headed by at most a jack (no A/K/Q)
      for (const s of ['S','D','C']) {
        if (f.lens[s] >= 4) {
          const set = new Set(f.hand[s]);
          if (set.has(14) || set.has(13) || set.has(12)) return false;
        }
      }
      return true;
    },
    rationale: "6+ hearts and a minimum opener \u2014 rebid 2\u2665 to show the suit length. Any 4-card side suit is too weak (headed by at most a jack) to be worth introducing; just repeat the hearts."
  },
  { id: 28, priority: 12.35, name: "2-of-a-minor (1H-1NT)",
    bid: f => f.lens.C >= 4 ? '2C' : '2D',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1H') return false;
      if (f.tp >= 19) return false;
      if (f.lens.C < 4 && f.lens.D < 4) return false;
      // Semi-balanced 5-4-2-2 with 5 hearts and 18-19 TP prefers 2NT (rule 31)
      if (f.shape === '5422' && f.lens.H === 5 && f.tp >= 18) return false;
      return true;
    },
    rationale: f => {
      const minor = f.lens.C >= 4 ? 'C' : 'D';
      return `4+ ${SUIT_SYMBOLS[minor]} after 1\u2665-1NT \u2014 show the minor with 2${SUIT_SYMBOLS[minor]}. Stays low; responder can prefer hearts or pass.`;
    }
  },
  { id: 27, priority: 12.40, name: "Pass (1H-1NT)",
    bid: () => 'P',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1H') return false;
      // Any balanced hand less than a 1NT opener (15 HCP would have opened 1NT)
      if (!f.balanced) return false;
      if (f.hcp >= 15) return false;
      return true;
    },
    rationale: "Balanced minimum opener \u2014 just pass 1\u2665-1NT. With nothing extra to show, let responder play it there."
  },

  /* ========== 1S-1NT auctions (rules 32-37) ==========
     Spec: Pass any balanced hand less than a 1NT opener; 2C/2D/2H with 4+ side
     and <17; 2S with 6+ spades <17; 2NT balanced (or 5-4-2-2 with 5S) 18-19;
     3C/3D/3H with 4+ side 19+; 3S with 6+ spades no side 17-19. */
  { id: 37, priority: 13.05, name: "3\u2660 jump rebid (1S-1NT)",
    bid: () => '3S',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1S') return false;
      if (f.lens.S < 6) return false;
      if (f.tp < 17 || f.tp > 19) return false;
      for (const s of ['H','D','C']) if (f.lens[s] >= 4) return false;
      return true;
    },
    rationale: "6+ spades, 17-19 total points, no other 4-card suit \u2014 jump to 3\u2660 to invite game."
  },
  { id: 36, priority: 13.10, name: "New suit at 3-level (1S-1NT)",
    bid: f => '3' + lowestSideSuitOf(['C','D','H'], f, 4),
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1S') return false;
      if (f.tp < 19) return false;
      return lowestSideSuitOf(['C','D','H'], f, 4) !== null;
    },
    rationale: f => {
      const s = lowestSideSuitOf(['C','D','H'], f, 4);
      return `4+ ${SUIT_SYMBOLS[s]} and 19+ total points after 1\u2660-1NT \u2014 jump to 3${SUIT_SYMBOLS[s]} to set up game. The jump shows extras and the shape.`;
    }
  },
  { id: 35, priority: 13.25, name: "2NT (1S-1NT)",
    bid: () => '2N',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1S') return false;
      if (f.tp < 18 || f.tp > 19) return false;
      if (!f.balanced && !(f.shape === '5422' && f.lens.S === 5)) return false;
      return true;
    },
    rationale: f => {
      if (f.shape === '5422') {
        return "Semi-balanced 5-4-2-2 with 5 spades and 18-19 total points \u2014 prefer 2NT.";
      }
      return "Balanced 18-19 after 1\u2660-1NT \u2014 invitational 2NT.";
    }
  },
  { id: 34, priority: 13.30, name: "2\u2660 rebid (1S-1NT)",
    bid: () => '2S',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1S') return false;
      if (f.lens.S < 6) return false;
      if (f.tp >= 17) return false;
      return true;
    },
    rationale: "6+ spades and a minimum opener \u2014 rebid 2\u2660 to show the long suit."
  },
  { id: 33, priority: 13.35, name: "New suit at 2-level (1S-1NT)",
    bid: f => '2' + lowestSideSuitOf(['C','D','H'], f, 4),
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1S') return false;
      if (f.tp >= 17) return false;
      return lowestSideSuitOf(['C','D','H'], f, 4) !== null;
    },
    rationale: f => {
      const s = lowestSideSuitOf(['C','D','H'], f, 4);
      return `4+ ${SUIT_SYMBOLS[s]} with a minimum opener after 1\u2660-1NT \u2014 show the second suit with 2${SUIT_SYMBOLS[s]}. Responder can correct back to 2\u2660 with spade tolerance.`;
    }
  },
  { id: 32, priority: 13.40, name: "Pass (1S-1NT)",
    bid: () => 'P',
    matches: f => {
      if (!f.isNTResponse) return false;
      if (f.opening !== '1S') return false;
      if (!f.balanced) return false;
      if (f.hcp >= 15) return false;
      return true;
    },
    rationale: "Balanced minimum opener \u2014 just pass 1\u2660-1NT."
  }
];

const RULES_BY_ID = Object.fromEntries(RULES.map(r => [r.id, r]));
const RULES_SORTED = RULES.slice().sort((a, b) => a.priority - b.priority);

/* ---------- Matcher ---------- */
function findMatch(features) {
  for (const rule of RULES_SORTED) {
    if (rule.matches(features)) return rule;
  }
  return null;
}

/* ---------- Generator ---------- */
const AUCTIONS = [
  {opening: '1C', response: '1H'},
  {opening: '1C', response: '1S'},
  {opening: '1D', response: '1H'},
  {opening: '1D', response: '1S'},
  {opening: '1C', response: '1N'},
  {opening: '1D', response: '1N'},
  {opening: '1H', response: '1N'},
  {opening: '1S', response: '1N'}
];

// Auction display strings for the quiz/curator UIs. Keys match
// `${opening}-${response}` (e.g., "1C-1H", "1S-1N").
const AUCTION_LABELS = {
  '1C-1H': '1\u2663 \u2014 1\u2665',
  '1C-1S': '1\u2663 \u2014 1\u2660',
  '1D-1H': '1\u2666 \u2014 1\u2665',
  '1D-1S': '1\u2666 \u2014 1\u2660',
  '1C-1N': '1\u2663 \u2014 1NT',
  '1D-1N': '1\u2666 \u2014 1NT',
  '1H-1N': '1\u2665 \u2014 1NT',
  '1S-1N': '1\u2660 \u2014 1NT'
};
const AUCTION_KEYS = AUCTIONS.map(a => `${a.opening}-${a.response}`);

// Which auctions each rule can fire on. Used by the quiz/curator UIs to group
// rule checkboxes by auction and filter rule lists when an auction is picked.
// The matcher itself doesn't read this — each rule's `matches` function is
// the source of truth — but the map must stay in sync when adding new rules.
const RULE_AUCTIONS = {
  1:  ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // 1NT rebid
  2:  ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // simple raise
  3:  ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // 2m rebid
  4:  ['1C-1H', '1D-1H'],                              // 1S over 1H (M=H only)
  5:  ['1D-1H', '1D-1S'],                              // 2C after 1D (opening=1D)
  6:  ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // jump raise 3M
  7:  ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // jump 3m
  8:  ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // 2NT strong balanced
  9:  ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // reverse
  10: ['1C-1H', '1D-1H', '1D-1S'],                     // jump shift (no valid target for 1C-1S)
  11: ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // splinter
  12: ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // 4M jump
  13: ['1C-1H', '1C-1S', '1D-1H', '1D-1S'],            // three-card raise
  14: ['1C-1H', '1C-1S', '1D-1H', '1D-1S',
       '1C-1N', '1D-1N', '1H-1N', '1S-1N'],            // 3NT (running suit)
  15: ['1C-1N'], 16: ['1C-1N'], 17: ['1C-1N'], 18: ['1C-1N'], 19: ['1C-1N'],
  20: ['1D-1N'], 21: ['1D-1N'], 22: ['1D-1N'], 23: ['1D-1N'], 24: ['1D-1N'], 25: ['1D-1N'], 26: ['1D-1N'],
  27: ['1H-1N'], 28: ['1H-1N'], 29: ['1H-1N'], 30: ['1H-1N'], 31: ['1H-1N'],
  32: ['1S-1N'], 33: ['1S-1N'], 34: ['1S-1N'], 35: ['1S-1N'], 36: ['1S-1N'], 37: ['1S-1N']
};

function rulesForAuction(auctionKey) {
  return Object.keys(RULE_AUCTIONS)
    .filter(id => RULE_AUCTIONS[id].includes(auctionKey))
    .map(id => parseInt(id, 10))
    .sort((a, b) => RULES_BY_ID[a].priority - RULES_BY_ID[b].priority);
}

function auctionsForRule(ruleId) {
  return RULE_AUCTIONS[ruleId] || [];
}

// Hand-shape exclusions for quiz generation. Hands that "could open" but
// produce awkward/ambiguous quiz questions are filtered here, separate
// from openingBid which models real-world bidding decisions.
function isInQuizScope(hand) {
  const lens = {S: hand.S.length, H: hand.H.length, D: hand.D.length, C: hand.C.length};
  let hcp = 0;
  for (const s of SUITS) for (const r of hand[s]) hcp += (HONOR[r] || 0);
  const sortedLens = Object.values(lens).slice().sort((a, b) => b - a);
  const shape = sortedLens.join('');
  // 14-17 HCP 6-3-2-2 with a 6-card minor: borderline 1NT/1m hands that
  // produce awkward rebid quizzes. Skip.
  if (shape === '6322' && hcp >= 14 && hcp <= 17) {
    const sixSuit = SUITS.find(s => lens[s] === 6);
    if (sixSuit === 'C' || sixSuit === 'D') return false;
  }
  return true;
}

function generateForRule(targetRuleId, maxAttempts = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    // Random auction
    const auction = AUCTIONS[Math.floor(Math.random() * AUCTIONS.length)];
    const hand = dealHand();
    if (!isPlausibleOpening(hand, auction.opening)) continue;
    if (!isInQuizScope(hand)) continue;
    const f = computeFeatures(hand, auction.opening, auction.response);
    const match = findMatch(f);
    if (match && match.id === targetRuleId) {
      return { hand, features: f, rule: match, auction };
    }
  }
  return null;
}

function generateForRuleSet(enabledIds, maxAttempts = 5000) {
  // First pass: natural distribution — random plausible hands, accept if the
  // rule that fires is in the enabled set. This makes common bids (raises,
  // 1NT, 2m rebids) appear more often than rare ones (splinter, jump shift,
  // 3-card raise) instead of selecting all rules with equal probability.
  const enabledSet = new Set(enabledIds);
  for (let i = 0; i < 3000; i++) {
    const auction = AUCTIONS[Math.floor(Math.random() * AUCTIONS.length)];
    const hand = dealHand();
    if (!isPlausibleOpening(hand, auction.opening)) continue;
    if (!isInQuizScope(hand)) continue;
    const f = computeFeatures(hand, auction.opening, auction.response);
    const match = findMatch(f);
    if (!match || !enabledSet.has(match.id)) continue;
    return { hand, features: f, rule: match, auction };
  }
  // Fallback: rule-targeted (only kicks in when the enabled set is small
  // enough that natural sampling can't find it within the budget).
  const shuffled = enabledIds.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (const id of shuffled) {
    const result = generateForRule(id, maxAttempts);
    if (result) return result;
  }
  return null;
}

// Curator helper: returns the first random plausible hand whose rule fires,
// regardless of which rule it is. (No "enabled ids" filter.)
function generateRandomHand(maxAttempts = 5000) {
  for (let i = 0; i < maxAttempts; i++) {
    const auction = AUCTIONS[Math.floor(Math.random() * AUCTIONS.length)];
    const hand = dealHand();
    if (!isPlausibleOpening(hand, auction.opening)) continue;
    if (!isInQuizScope(hand)) continue;
    const f = computeFeatures(hand, auction.opening, auction.response);
    const match = findMatch(f);
    if (match) return { hand, features: f, rule: match, auction };
  }
  return null;
}

// Generate a hand for a specific auction, optionally filtering to a subset
// of rule ids. Pass enabledRuleIds = null/undefined to accept any matching
// rule. Used by the curator's auction picker and as a fallback by the quiz.
function generateForAuction(auctionKey, enabledRuleIds, maxAttempts = 5000) {
  const [opening, response] = auctionKey.split('-');
  const auction = { opening, response };
  const enabledSet = enabledRuleIds ? new Set(enabledRuleIds) : null;
  for (let i = 0; i < maxAttempts; i++) {
    const hand = dealHand();
    if (!isPlausibleOpening(hand, opening)) continue;
    if (!isInQuizScope(hand)) continue;
    const f = computeFeatures(hand, opening, response);
    const match = findMatch(f);
    if (!match) continue;
    if (enabledSet && !enabledSet.has(match.id)) continue;
    return { hand, features: f, rule: match, auction };
  }
  return null;
}

// Quiz generator: rulesByAuction is { auctionKey: Set<ruleId> }. Auctions with
// an empty/missing set are skipped. Uses natural-distribution sampling first
// (random plausible auction → random hand → accept if match), falls back to
// targeted (auction, rule) pairs when natural sampling fails.
function generateForAuctionRuleMap(rulesByAuction, maxAttempts = 5000) {
  const enabledAuctions = Object.keys(rulesByAuction)
    .filter(k => rulesByAuction[k] && rulesByAuction[k].size > 0);
  if (enabledAuctions.length === 0) return null;

  for (let i = 0; i < 3000; i++) {
    const auctionKey = enabledAuctions[Math.floor(Math.random() * enabledAuctions.length)];
    const [opening, response] = auctionKey.split('-');
    const hand = dealHand();
    if (!isPlausibleOpening(hand, opening)) continue;
    if (!isInQuizScope(hand)) continue;
    const f = computeFeatures(hand, opening, response);
    const match = findMatch(f);
    if (!match) continue;
    if (!rulesByAuction[auctionKey].has(match.id)) continue;
    return { hand, features: f, rule: match, auction: { opening, response } };
  }

  // Fallback: shuffle all (auction, rule) pairs and try each in turn.
  const pairs = [];
  for (const aKey of enabledAuctions) {
    for (const rid of rulesByAuction[aKey]) {
      pairs.push([aKey, rid]);
    }
  }
  for (let i = pairs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
  }
  for (const [aKey, rid] of pairs) {
    const r = generateForAuction(aKey, [rid], maxAttempts);
    if (r) return r;
  }
  return null;
}
