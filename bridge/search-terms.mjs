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

export { SYNONYM_GROUPS };
