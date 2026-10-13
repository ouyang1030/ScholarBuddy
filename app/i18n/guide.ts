import type { Locale } from "./locale";

// The guide is prose, so it is kept apart from the interface strings: one typed
// document per language, rendered by the same layout.

type Item = [title: string, detail: string];
type Section = {
  id: string;
  nav: string;
  title: string;
  layout: "steps" | "routine" | "modules" | "data" | "help";
  items: Item[];
  callouts?: { title: string; text: string; warning?: boolean }[];
  openConnections?: boolean;
};
export type Guide = {
  label: string;
  eyebrow: string;
  title: string;
  jump: string;
  openConnections: string;
  footer: string;
  done: string;
  sections: Section[];
};

const en: Guide = {
  label: "User guide",
  eyebrow: "SCHOLARBUDDY",
  title: "How to use your workbench",
  jump: "Guide sections",
  openConnections: "Open Connections →",
  footer: "⌘ K commands · ⌘ J log · ⌘ I idea",
  done: "Done",
  sections: [
    {
      id: "guide-start",
      nav: "Start here",
      title: "Start here",
      layout: "steps",
      items: [
        ["Define today’s output.", "Add one concrete result on Today and start a focus session."],
        ["Set up the frame.", "Add the project, its questions, and experiments in Projects."],
        ["Add the manuscript.", "Track the writing, then one submission attempt per journal."],
        ["Connect sources.", "Connections → Configure this Mac: AI keys, vault, Zotero, Calendar."],
      ],
      openConnections: true,
    },
    {
      id: "guide-daily",
      nav: "Daily routine",
      title: "A simple daily routine",
      layout: "routine",
      items: [
        ["1 · Decide", "One visible result worth finishing today."],
        ["2 · Focus", "Start the timer; pause to close a block."],
        ["3 · Record", "One log entry on what actually changed."],
        ["4 · Capture", "Park new ideas in the inbox."],
        ["5 · Watch", "Act on submission alerts only when Today shows them."],
        ["6 · Continue", "Leave tomorrow’s next output ready."],
      ],
    },
    {
      id: "guide-modules",
      nav: "Modules",
      title: "What each module is for",
      layout: "modules",
      items: [
        ["Today", "Output, focus, schedule, log, ideas, and alerts."],
        ["Projects", "Projects, research questions, experiments, and ideas."],
        ["Manuscripts", "Writing, submissions, feedback, and research gaps."],
        ["Library", "Zotero passages with sections and APA 7 citations."],
        ["Operations", "Supervision, meetings, deadlines, and the full research log."],
      ],
      callouts: [
        {
          title: "Editing",
          text: "New creates a record; open a card to edit it. Progress is set by hand. Delete asks twice and permanently removes the record and its history.",
        },
      ],
    },
    {
      id: "guide-capture",
      nav: "Log & ideas",
      title: "Research log and idea inbox",
      layout: "steps",
      items: [
        ["Write the log.", "Say what changed. The first line is the title; ⌘ ⏎ saves."],
        ["Capture an idea.", "One line, then Enter. Sort it later."],
        ["From anywhere.", "⌘ J opens the log and ⌘ I the inbox."],
        ["Judge later.", "↑ Question promotes an idea; × drops it. Both stay in Projects → Ideas."],
      ],
      callouts: [
        {
          title: "Feeds the AI",
          text: "Workflows see the last three days of log entries and the ideas still open. Unsaved text stays in this browser until it reaches Obsidian.",
        },
      ],
    },
    {
      id: "guide-passages",
      nav: "Passages",
      title: "Passage library",
      layout: "steps",
      items: [
        ["Highlight in Zotero.", "Highlights and notes are read live."],
        ["Search and filter.", "By text, note, source, author, tag, or keyword."],
        [
          "Confirm the section.",
          "Suggested from Zotero tags, then the text; unsure ones stay Unassigned.",
        ],
        [
          "Link and cite.",
          "Linked passages appear in Manuscripts → Develop. Copy Citation gives APA 7 author–year.",
        ],
      ],
      callouts: [
        {
          title: "Source of truth",
          text: "Zotero holds the passage and its source. Obsidian holds only the link, section, keywords, and usage.",
        },
      ],
    },
    {
      id: "guide-milestones",
      nav: "Focus & milestones",
      title: "Focus and milestones",
      layout: "steps",
      items: [
        ["Daily total.", "Pause and resume freely; Today keeps one total."],
        ["Calendar.", "Blocks are written to the Focus calendar chosen in Connections."],
        ["Six hours.", "A one-time celebration for the day."],
        ["Accepted and Published.", "Each celebrates once per paper."],
        ["Motion.", "Esc closes a celebration; Reduce Motion is respected."],
      ],
    },
    {
      id: "guide-ai",
      nav: "AI",
      title: "AI workflows",
      layout: "steps",
      items: [
        ["Open.", "The search bar or ⌘ K."],
        ["Choose a task.", "Evidence, results, review, drafting, or planning."],
        ["Pick a model.", "In the workflow panel."],
        ["Check sources.", "Keep Zotero and Obsidian on when evidence matters."],
        ["Review.", "Output is a draft: check claims and citations before saving."],
      ],
      callouts: [
        {
          title: "Language",
          text: "Answers follow the interface language. Drafting and reviewing a manuscript section stay in English.",
        },
        {
          title: "Important",
          text: "Missing context is reported, never invented. Your scientific judgment still decides.",
          warning: true,
        },
      ],
    },
    {
      id: "guide-storage",
      nav: "Data",
      title: "Where your data lives",
      layout: "data",
      items: [
        ["Records, log, ideas", "Markdown in Obsidian → ScholarBuddy."],
        ["Tasks and drafts", "This browser only."],
        ["Focus and schedule", "macOS Calendar, through the Bridge."],
        ["Literature", "Read live from Zotero; links and sections are saved in Obsidian."],
        ["AI keys", "Kept by the Bridge on this Mac, never in the page."],
        [
          "Hosted access",
          "scholarbuddy.tech, with scholarbuddy-eta.vercel.app as a backup. Pair each separately.",
        ],
      ],
    },
    {
      id: "guide-help",
      nav: "Help",
      title: "Troubleshooting",
      layout: "help",
      items: [
        [
          "“Bridge unreachable”",
          "Use Safari or Chrome on this Mac, allow Local Network, then Test again in Connections.",
        ],
        ["“Pairing required”", "Connections → Configure this Mac."],
        ["Calendar not syncing", "Test Calendar on the setup page and approve the macOS prompt."],
        ["No Zotero results", "Keep Zotero open; broaden the search or add keywords."],
        [
          "AI lacks context",
          "Mark a project Active, add a research question and keywords, and write a few log entries.",
        ],
      ],
    },
  ],
};

const zh: Guide = {
  label: "使用指南",
  eyebrow: "SCHOLARBUDDY",
  title: "如何使用工作台",
  jump: "指南章节",
  openConnections: "打开连接 →",
  footer: "⌘ K 命令 · ⌘ J 日志 · ⌘ I 灵感",
  done: "完成",
  sections: [
    {
      id: "guide-start",
      nav: "快速开始",
      title: "快速开始",
      layout: "steps",
      items: [
        ["确定今日产出", "在“今日”中写下一个具体成果，然后开始专注"],
        ["搭建研究框架", "在“项目”中添加项目、研究问题和实验"],
        ["添加稿件", "先跟踪写作进度，再为每个期刊单独建立投稿记录"],
        ["连接数据源", "连接 → 设置这台 Mac：AI 密钥、Obsidian 库、Zotero、日历"],
      ],
      openConnections: true,
    },
    {
      id: "guide-daily",
      nav: "每日流程",
      title: "简单的每日流程",
      layout: "routine",
      items: [
        ["1 · 决定", "选一个今天值得完成的可见成果"],
        ["2 · 专注", "启动计时器；暂停即结束一个专注时段"],
        ["3 · 记录", "写一条研究日志，说明实际变化"],
        ["4 · 收集", "把新灵感放进收集箱"],
        ["5 · 关注", "仅在“今日”提示时处理投稿提醒"],
        ["6 · 延续", "为明天准备好下一个产出"],
      ],
    },
    {
      id: "guide-modules",
      nav: "模块",
      title: "各模块的用途",
      layout: "modules",
      items: [
        ["今日", "产出、专注、日程、日志、灵感和提醒"],
        ["项目", "项目、研究问题、实验和灵感"],
        ["稿件", "写作、投稿、反馈和研究缺口"],
        ["文献库", "带章节与 APA 7 引用的 Zotero 摘录"],
        ["事务", "导师沟通、会议、截止日期和完整的研究日志"],
      ],
      callouts: [
        {
          title: "编辑",
          text: "“新建”创建记录；打开卡片即可编辑。进度由你手动设置。删除需二次确认，并永久移除记录及其历史。",
        },
      ],
    },
    {
      id: "guide-capture",
      nav: "日志与灵感",
      title: "研究日志与灵感收集箱",
      layout: "steps",
      items: [
        ["写日志", "写下发生了什么变化。第一行是标题；⌘ ⏎ 保存。"],
        ["记录灵感", "一行字，按回车即可。稍后再整理。"],
        ["随处记录", "⌘ J 打开日志，⌘ I 打开收集箱"],
        ["稍后判断", "“转为问题”将灵感转为研究问题；× 将其搁置。两者都保留在 项目 → 灵感 中。"],
      ],
      callouts: [
        {
          title: "提供给 AI",
          text: "工作流会读取最近三天的日志和尚未处理的灵感。未保存的文字会保留在此浏览器中，直到写入 Obsidian。",
        },
      ],
    },
    {
      id: "guide-passages",
      nav: "摘录",
      title: "摘录库",
      layout: "steps",
      items: [
        ["在 Zotero 中高亮", "高亮和批注会被实时读取"],
        ["搜索与筛选", "按正文、批注、来源、作者、标签或关键词"],
        ["确认章节", "先依据 Zotero 标签，再依据正文给出建议；不确定的保持“未分配”"],
        ["关联与引用", "关联后的摘录出现在 稿件 → 撰写。“复制引用”生成 APA 7 作者–年份格式。"],
      ],
      callouts: [
        {
          title: "数据来源",
          text: "摘录及其来源以 Zotero 为准。Obsidian 只保存关联、章节、关键词和使用状态。",
        },
      ],
    },
    {
      id: "guide-milestones",
      nav: "专注与里程碑",
      title: "专注与里程碑",
      layout: "steps",
      items: [
        ["每日累计", "可随时暂停和继续；“今日”只保留一个总时长"],
        ["日历", "专注时段会写入你在“连接”中选择的专注日历"],
        ["六小时", "当天仅庆祝一次"],
        ["录用与发表", "每篇稿件各庆祝一次"],
        ["动效", "按 Esc 关闭庆祝动画；遵循系统“减弱动态效果”设置"],
      ],
    },
    {
      id: "guide-ai",
      nav: "AI",
      title: "AI 工作流",
      layout: "steps",
      items: [
        ["打开", "顶部搜索栏或 ⌘ K"],
        ["选择任务", "找证据、解释结果、审阅、起草或规划"],
        ["选择模型", "在工作流面板中选择"],
        ["检查资料来源", "需要证据时保持 Zotero 和 Obsidian 开启"],
        ["审阅", "输出只是草稿：保存前请核对论点和引用"],
      ],
      callouts: [
        {
          title: "语言",
          text: "回答使用界面语言。起草和审阅稿件章节仍使用英文。",
        },
        {
          title: "重要",
          text: "缺失的上下文会被如实指出，绝不编造。最终判断仍取决于你的学术判断。",
          warning: true,
        },
      ],
    },
    {
      id: "guide-storage",
      nav: "数据",
      title: "数据存放位置",
      layout: "data",
      items: [
        ["记录、日志、灵感", "Obsidian → ScholarBuddy 中的 Markdown 文件"],
        ["任务与草稿", "仅保存在此浏览器中"],
        ["专注与日程", "通过 Bridge 写入 macOS 日历"],
        ["文献", "实时读取 Zotero；关联和章节保存在 Obsidian 中"],
        ["AI 密钥", "由这台 Mac 上的 Bridge 保管，绝不进入网页"],
        [
          "访问地址",
          "scholarbuddy.tech，备用地址 scholarbuddy-eta.vercel.app。两个地址需分别配对。",
        ],
      ],
    },
    {
      id: "guide-help",
      nav: "帮助",
      title: "常见问题",
      layout: "help",
      items: [
        [
          "“无法连接 Bridge”",
          "在这台 Mac 上使用 Safari 或 Chrome，允许访问本地网络，然后在“连接”中重新测试。",
        ],
        ["“需要配对”", "连接 → 设置这台 Mac"],
        ["日历未同步", "在设置页测试日历，并批准 macOS 的授权请求"],
        ["Zotero 没有结果", "保持 Zotero 打开；放宽搜索或添加关键词"],
        ["AI 缺少上下文", "将一个项目设为“当前”，添加研究问题和关键词，并写几条日志"],
      ],
    },
  ],
};

export const GUIDES: Record<Locale, Guide> = { en, zh };
