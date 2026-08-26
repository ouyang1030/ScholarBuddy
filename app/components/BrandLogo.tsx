const brandAssets = {
  deepseek: "/brands/deepseek.svg",
  kimi: "/brands/kimi.svg",
  openai: "/brands/openai.svg",
  claude: "/brands/claude.svg",
  grok: "/brands/grok.ico",
  gemini: "/brands/gemini.svg",
  calendar: "/brands/calendar.png",
  zotero: "/brands/zotero.svg",
  obsidian: "/brands/obsidian.svg",
} as const;

export type Brand = keyof typeof brandAssets;

export function BrandLogo({ brand, className = "" }: { brand: Brand; className?: string }) {
  return (
    <span className={`brand-logo brand-${brand} ${className}`} aria-hidden="true">
      <img src={brandAssets[brand]} alt="" />
    </span>
  );
}
