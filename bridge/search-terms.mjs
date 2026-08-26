// A bilingual vault only matches on the exact string that was typed, so a note
// written in Chinese is invisible to an English query and vice versa. Groups are
// symmetric: any member of a group pulls in the rest.
const SYNONYM_GROUPS = [
  ["vo2max", "vo2 max", "最大摄氧量", "摄氧量"],
  ["rpe", "perceived exertion", "主观疲劳", "主观用力感觉"],
  ["hrv", "heart rate variability", "心率变异性"],
  ["countermovement jump", "cmj", "反向纵跳", "纵跳"],
  ["sprint", "冲刺", "短跑"],
  ["endurance", "耐力"],
  ["strength training", "resistance training", "力量训练", "抗阻训练"],
  ["fatigue", "疲劳"],
  ["injury", "损伤", "受伤"],
  ["workload", "training load", "训练负荷", "负荷"],
  ["recovery", "恢复"],
  ["reliability", "信度", "重测信度"],
  ["validity", "效度"],
  ["effect size", "效应量"],
  ["confidence interval", "置信区间"],
  ["randomised controlled trial", "randomized controlled trial", "rct", "随机对照试验"],
  ["systematic review", "系统综述", "系统评价"],
  ["meta-analysis", "meta analysis", "荟萃分析", "元分析"],
  ["questionnaire", "survey", "问卷"],
  ["possession", "控球"],
  ["pace of play", "比赛节奏", "节奏"],
  ["football", "soccer", "足球"],
  ["basketball", "篮球"],
  ["tennis", "网球"],
  ["biomechanics", "生物力学"],
  ["kinematics", "运动学"],
  ["kinetics", "动力学"],
  ["accelerometer", "加速度计"],
  ["gps", "全球定位", "定位数据"],
  ["manuscript", "paper", "论文", "稿件"],
  ["submission", "投稿"],
  ["reviewer", "审稿人", "评审"],
];

const SYNONYMS = new Map();
for (const group of SYNONYM_GROUPS)
  for (const term of group)
    SYNONYMS.set(
      term,
      group.filter((item) => item !== term),
    );

// Expansions are appended, never substituted, so an exact hit always outranks a
// synonym hit through the usual scoring. Groups are matched both against single
// tokens and against the raw query, so a multi-word key still resolves.
export function expandTerms(terms, query = "", ceiling = 24) {
  const expanded = [...terms];
  const seen = new Set(terms);
  const haystack = String(query).toLowerCase();
  const add = (synonyms) => {
    for (const synonym of synonyms) {
      if (seen.has(synonym) || expanded.length >= ceiling) continue;
      seen.add(synonym);
      expanded.push(synonym);
    }
  };
  for (const term of terms) add(SYNONYMS.get(term) || []);
  if (haystack)
    for (const group of SYNONYM_GROUPS)
      if (group.some((item) => item.includes(" ") && haystack.includes(item))) add(group);
  return expanded;
}

// Function words plus the vocabulary every paper uses about itself. A section
// of a manuscript is mostly these, and without them a frequency ranking returns
// "the study of these results" for every section of every paper.
const STOPWORDS = new Set(
  `the and for that with this was were are have has had not but from they their there here which who whom whose when where what while
   into onto over under between among during after before above below than then them these those such been being does did doing
   its his her our your you  she him himself herself itself themselves ourselves yourself
   can could may might must shall should will would also both each every other more most some any all one two three
   study studies research paper article manuscript section chapter draft write writing written
   result results finding findings method methods data analysis analyses table figure appendix
   show shows shown found using used use uses based following present presented report reported
   significant significantly effect effects level levels group groups value values
   however therefore thus moreover furthermore although though because since about across within without
   aim aims objective objectives purpose approach overall general specific particular
   participants subjects sample samples total mean means standard`
    .split(/\s+/)
    .filter(Boolean),
);

function countedTerms(text) {
  const counts = new Map();
  for (const raw of String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)) {
    // The same shape rule as the query tokenizer, and for the same reason: a
    // three-letter cut would throw away GPS, RPE, HRV and ACL, which are the
    // terms a sports-science section most needs to be searched on.
    if (!(raw.length > 2 || (raw.length === 2 && /\p{Script=Han}/u.test(raw)))) continue;
    if (STOPWORDS.has(raw)) continue;
    counts.set(raw, (counts.get(raw) || 0) + 1);
  }
  return counts;
}

// The opening words of a manuscript section are its throat-clearing, not its
// subject, so a long focus text is ranked by what recurs in it. Ties fall back
// to the order the words appeared, which keeps a short text's own sequence.
export function topicTerms(text, limit = 8) {
  const counts = [...countedTerms(text)];
  return counts
    .map(([term, count], index) => ({ term, count, index }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.term);
}

export { SYNONYM_GROUPS, STOPWORDS };
